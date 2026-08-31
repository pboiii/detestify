#!/usr/bin/env node
// Hook launcher entry: `detestify-hook <claude|codex> <event>` with the raw
// host payload on stdin. Invokes the same core decision seam the CLI uses;
// adapters only parse payloads and translate output (ADR-005).

import { access } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repositoryStateDirectory,
  writePrivateJsonAtomic,
} from "../security/state.js";
import { fingerprintDiff } from "../repository/fingerprint.js";
import { snapshotRepository } from "../repository/git.js";
import { isRepositoryMutationTargetContained } from "../repository/paths.js";
import { stripOwnState } from "../evidence/verdict.js";
import {
  parseDecision,
  type HookEvent,
  type NormalizedDecision,
  type NormalizedInvocation,
} from "./normalized.js";
import {
  clearSessionState,
  inspectLoopState,
  loopKey,
  recordRemediation,
} from "./loop-state.js";
import {
  normalizeClaudeInput,
  translateClaudeDecision,
} from "./claude/adapter.js";
import {
  normalizeCodexInput,
  translateCodexDecision,
} from "./codex/adapter.js";
import { coreHookDecider } from "./decider.js";

/** The core decision seam shared with the CLI (`verify-change` core). */
export type HookDecider = (
  invocation: NormalizedInvocation,
  context?: HookRuntimeContext,
) => Promise<NormalizedDecision>;

export interface HookRuntimeContext {
  readonly toolTargetPath: string | null;
}

const BLOCK_GUARD_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete",
]);

const GIT_BUDGET = { timeoutMs: 4_000 } as const;
const RAW_PAYLOAD_BYTE_LIMIT = 1024 * 1024;
const APPLY_PATCH_PAYLOAD_BYTE_LIMIT = 8 * RAW_PAYLOAD_BYTE_LIMIT;
const TOOL_TARGET_BYTE_LIMIT = 4096;
const FILE_TARGET_TOOLS: ReadonlySet<string> = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);
const FILE_MUTATION_TOOLS: ReadonlySet<string> = new Set([
  ...FILE_TARGET_TOOLS,
  "apply_patch",
]);
const APPLY_PATCH_PATH_MARKERS = [
  "*** Add File: ",
  "*** Delete File: ",
  "*** Update File: ",
  "*** Move to: ",
] as const;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(start: string): Promise<string | null> {
  let current = path.resolve(start);
  while (true) {
    if (await pathExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export interface HookEntryOptions {
  /** Core decision provider; defaults to the verify-change core decider. */
  readonly decide?: HookDecider;
  readonly stateDir?: string;
  readonly hostVersion?: string | null;
  readonly repoRoot?: string | null;
  readonly now?: () => number;
}

export interface HookRunResult {
  readonly stdout: string | null;
  readonly stderr: string | null;
  readonly exitCode: number;
}

export interface BoundedHookInput {
  readonly stdin: string;
  readonly exceeded: boolean;
}

function hookPayloadByteLimit(argv: readonly string[]): number {
  return argv[1] === "before_tool"
    ? APPLY_PATCH_PAYLOAD_BYTE_LIMIT
    : RAW_PAYLOAD_BYTE_LIMIT;
}

/** Read at most `byteLimit` bytes so the hook never buffers unbounded stdin. */
export async function readBoundedHookInput(
  input: AsyncIterable<string | Uint8Array>,
  byteLimit: number,
): Promise<BoundedHookInput> {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1) {
    throw new RangeError("Hook input byte limit must be a positive integer.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of input) {
      const bytes = Buffer.from(chunk);
      const remaining = byteLimit - total;
      if (bytes.length > remaining) {
        if (remaining > 0) {
          chunks.push(bytes.subarray(0, remaining));
          total += remaining;
        }
        return {
          stdin: Buffer.concat(chunks, total).toString("utf8"),
          exceeded: true,
        };
      }
      chunks.push(bytes);
      total += bytes.length;
    }
  } catch {
    return { stdin: "", exceeded: false };
  }
  return {
    stdin: Buffer.concat(chunks, total).toString("utf8"),
    exceeded: false,
  };
}

function jsonStringEnd(source: string, start: number): number | null {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return index;
    }
  }
  return null;
}

/** Read one unescaped top-level string field from a bounded JSON prefix. */
function topLevelStringField(source: string, field: string): string | null {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      const end = jsonStringEnd(source, index);
      if (end === null) {
        return null;
      }
      if (depth === 1) {
        let cursor = end + 1;
        while (/\s/u.test(source[cursor] ?? "")) {
          cursor += 1;
        }
        const key = source.slice(index + 1, end);
        if (source[cursor] === ":" && key === field) {
          cursor += 1;
          while (/\s/u.test(source[cursor] ?? "")) {
            cursor += 1;
          }
          if (source[cursor] !== '"') {
            return null;
          }
          const valueEnd = jsonStringEnd(source, cursor);
          if (valueEnd === null) {
            return null;
          }
          const value = source.slice(cursor + 1, valueEnd);
          return value.includes("\\") ? null : value;
        }
      }
      index = end;
    } else if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
  return null;
}

function bounded(value: string | null): string | null {
  return value === null ? null : value.slice(0, 128);
}

function eventIdentity(raw: unknown, event: HookEvent): string | null {
  if (
    (event !== "subagent_stop" && event !== "task_complete") ||
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw)
  ) {
    return null;
  }
  const field = event === "task_complete" ? "task_id" : "agent_id";
  const value = (raw as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return `${event === "task_complete" ? "task" : "subagent"}:${value.normalize("NFC").trim()}`;
}

function toolTargetPath(
  raw: unknown,
  invocation: NormalizedInvocation,
): string | null {
  if (
    invocation.event !== "before_tool" ||
    invocation.tool.name === null ||
    !FILE_TARGET_TOOLS.has(invocation.tool.name) ||
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw)
  ) {
    return null;
  }
  const input = (raw as Record<string, unknown>)["tool_input"];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const field =
    invocation.tool.name === "NotebookEdit" ? "notebook_path" : "file_path";
  const target = (input as Record<string, unknown>)[field];
  return typeof target === "string" &&
    target.trim() !== "" &&
    !target.includes("\0") &&
    Buffer.byteLength(target, "utf8") <= TOOL_TARGET_BYTE_LIMIT
    ? target
    : null;
}

function applyPatchTargetPaths(
  raw: unknown,
  invocation: NormalizedInvocation,
): readonly string[] | null | undefined {
  if (
    invocation.event !== "before_tool" ||
    invocation.tool.name !== "apply_patch"
  ) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const input = (raw as Record<string, unknown>)["tool_input"];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const command = (input as Record<string, unknown>)["command"];
  if (typeof command !== "string") {
    return null;
  }
  const lines = command.trim().split(/\r?\n/u);
  if (
    lines[0]?.trim() !== "*** Begin Patch" ||
    lines.at(-1)?.trim() !== "*** End Patch"
  ) {
    return null;
  }
  const targets: string[] = [];
  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim();
    const marker = APPLY_PATCH_PATH_MARKERS.find((candidate) =>
      trimmed.startsWith(candidate),
    );
    if (marker === undefined) {
      continue;
    }
    const target = trimmed.slice(marker.length);
    if (
      target === "" ||
      target.includes("\0") ||
      Buffer.byteLength(target, "utf8") > TOOL_TARGET_BYTE_LIMIT
    ) {
      return null;
    }
    targets.push(target);
  }
  return targets;
}

async function toolTargetIsContained(
  invocation: NormalizedInvocation,
  target: string,
): Promise<boolean> {
  return invocation.repo_root === null
    ? false
    : isRepositoryMutationTargetContained(
        invocation.repo_root,
        invocation.cwd,
        target,
      );
}

async function denyToolDecision(
  reasonCode: string,
  summary: string,
): Promise<NormalizedDecision> {
  return parseDecision({
    schema_version: "1.0",
    action: "deny_tool",
    confidence: "high",
    reason_code: reasonCode,
    summary,
    remediation: null,
    report_path: null,
    limitations: [],
    loop_guard: { next_attempt: 0, max_attempts: 2 },
  });
}

async function mutationGuardDecision(
  raw: unknown,
  invocation: NormalizedInvocation,
  targetPath: string | null,
): Promise<NormalizedDecision | null> {
  if (invocation.event !== "before_tool") {
    return null;
  }
  if (
    invocation.tool.name !== null &&
    FILE_TARGET_TOOLS.has(invocation.tool.name)
  ) {
    if (targetPath === null) {
      return denyToolDecision(
        "TOOL_TARGET_UNAVAILABLE",
        `The ${invocation.tool.name} target path could not be established.`,
      );
    }
    if (!(await toolTargetIsContained(invocation, targetPath))) {
      return denyToolDecision(
        "TOOL_TARGET_OUTSIDE_REPOSITORY",
        `The ${invocation.tool.name} target resolves outside the repository root.`,
      );
    }
    return null;
  }

  const targets = applyPatchTargetPaths(raw, invocation);
  if (targets === undefined) {
    return null;
  }
  const unavailable = targets === null || targets.length === 0;
  const outside =
    !unavailable &&
    !(
      await Promise.all(
        targets.map((target) => toolTargetIsContained(invocation, target)),
      )
    ).every(Boolean);
  if (!unavailable && !outside) {
    return null;
  }
  return denyToolDecision(
    unavailable
      ? "APPLY_PATCH_TARGETS_UNAVAILABLE"
      : "TOOL_TARGET_OUTSIDE_REPOSITORY",
    unavailable
      ? "The apply_patch target paths could not be established."
      : "An apply_patch target resolves outside the repository root.",
  );
}

async function currentDiffFingerprint(
  repoRoot: string | null,
): Promise<string | null> {
  if (repoRoot === null) {
    return null;
  }
  try {
    const snapshot = stripOwnState(
      await snapshotRepository(repoRoot, undefined, GIT_BUDGET),
    );
    return (await fingerprintDiff(snapshot)).fingerprint;
  } catch {
    return null;
  }
}

async function recordInvocation(
  invocation: NormalizedInvocation,
  stateDir: string | null,
  now: number,
  diffFingerprint: string | null,
  decision: NormalizedDecision,
  oneShotDowngraded: boolean,
): Promise<void> {
  if (stateDir === null) {
    return;
  }
  const recordedAt = new Date(now).toISOString();
  const file = path.join(
    stateDir,
    "hooks",
    "invocations",
    `${recordedAt.replace(/[:.]/g, "")}-${randomUUID()}.json`,
  );
  try {
    await writePrivateJsonAtomic(
      file,
      {
        schema_version: "1.0",
        recorded_at: recordedAt,
        host: invocation.host,
        host_version: bounded(invocation.host_version),
        event: invocation.event,
        session_id: bounded(invocation.session_id),
        turn_id: bounded(invocation.turn_id),
        tool_name: bounded(invocation.tool.name),
        diff_fingerprint: diffFingerprint,
        loop_guard: invocation.loop_guard,
        action: decision.action,
        reason_code: decision.reason_code.slice(0, 128),
        one_shot_downgraded: oneShotDowngraded,
      },
      stateDir,
    );
  } catch {
    // Receipt failure never changes the host decision.
  }
}

/** Downgrade a repeat remediation request to advice (ADR-005 loop guard). */
async function applyOneShotGuard(
  invocation: NormalizedInvocation,
  decision: NormalizedDecision,
  options: HookEntryOptions,
  repoRoot: string | null,
  identity: string | null,
): Promise<NormalizedDecision> {
  if (
    decision.action !== "request_remediation" ||
    !BLOCK_GUARD_EVENTS.has(invocation.event)
  ) {
    return decision;
  }
  const key = loopKey(invocation, identity);
  const status = await inspectLoopState(key, {
    alreadyRemediated: invocation.loop_guard.already_remediated,
    repoRoot,
    stateDir: options.stateDir,
    now: options.now?.(),
  });
  if (status.alreadyRemediated) {
    return parseDecision({
      ...decision,
      action: "advise",
      remediation: null,
      limitations: [
        ...decision.limitations,
        "One remediation continuation was already granted; remaining gap disclosed without blocking.",
        ...status.limitations,
      ],
    });
  }
  const granted = await recordRemediation(key, {
    alreadyRemediated: invocation.loop_guard.already_remediated,
    repoRoot,
    stateDir: options.stateDir,
    now: options.now?.(),
  });
  if (!granted) {
    return parseDecision({
      ...decision,
      action: "advise",
      remediation: null,
      limitations: [
        ...decision.limitations,
        "Loop state could not be persisted; remediation request downgraded to advice.",
      ],
    });
  }
  return decision;
}

/**
 * Run one hook invocation end to end. Any adapter failure (unparseable
 * payload, event/host mismatch, schema violation) fails open: the host is
 * never blocked by a Detestify parse error.
 */
async function runBoundedHook(
  argv: readonly string[],
  stdin: string,
  inputLimitExceeded: boolean,
  options: HookEntryOptions,
): Promise<HookRunResult> {
  const [host, event] = argv;
  if (host !== "claude" && host !== "codex") {
    return {
      stdout: null,
      stderr: "detestify-hook: expected <claude|codex> <event>\n",
      exitCode: 2,
    };
  }
  const toolName =
    event === "before_tool" ? topLevelStringField(stdin, "tool_name") : null;
  const payloadLimit =
    event === "before_tool" && toolName === "apply_patch"
      ? APPLY_PATCH_PAYLOAD_BYTE_LIMIT
      : RAW_PAYLOAD_BYTE_LIMIT;
  const oversized =
    inputLimitExceeded || Buffer.byteLength(stdin, "utf8") > payloadLimit;
  if (oversized) {
    if (toolName !== null && FILE_MUTATION_TOOLS.has(toolName)) {
      const denied = await denyToolDecision(
        "HOOK_PAYLOAD_TOO_LARGE",
        "The file mutation payload exceeded the safe hook input limit, so its target could not be established.",
      );
      return host === "claude"
        ? translateClaudeDecision("before_tool", denied)
        : translateCodexDecision("before_tool", denied);
    }
    return { stdout: null, stderr: null, exitCode: 0 };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    if (toolName !== null && FILE_MUTATION_TOOLS.has(toolName)) {
      const denied = await denyToolDecision(
        toolName === "apply_patch"
          ? "APPLY_PATCH_TARGETS_UNAVAILABLE"
          : "TOOL_TARGET_UNAVAILABLE",
        `The ${toolName} target path could not be established.`,
      );
      return host === "claude"
        ? translateClaudeDecision("before_tool", denied)
        : translateCodexDecision("before_tool", denied);
    }
    return { stdout: null, stderr: null, exitCode: 0 };
  }

  try {
    if (options.stateDir !== undefined && !path.isAbsolute(options.stateDir)) {
      throw new Error("Hook state directory override must be absolute.");
    }
    const payloadCwd =
      typeof raw === "object" &&
      raw !== null &&
      "cwd" in raw &&
      typeof (raw as { cwd: unknown }).cwd === "string"
        ? (raw as { cwd: string }).cwd
        : process.cwd();
    const repoRoot =
      options.repoRoot !== undefined
        ? options.repoRoot
        : await findGitRoot(payloadCwd);
    const stateDir =
      options.stateDir ??
      (repoRoot === null ? null : repositoryStateDirectory(repoRoot));
    const context = {
      hostVersion: options.hostVersion ?? null,
      repoRoot,
      cwd: process.cwd(),
      // Hook payloads may contain secrets and repository-controlled text.
      // Raw payload persistence stays disabled by default.
      store: async () => null,
    };

    const invocation =
      host === "claude"
        ? await normalizeClaudeInput(raw, event as HookEvent, context)
        : await normalizeCodexInput(raw, event as HookEvent, context);
    const targetPath = toolTargetPath(raw, invocation);
    const mutationGuard = await mutationGuardDecision(
      raw,
      invocation,
      targetPath,
    );
    const runtimeContext: HookRuntimeContext = {
      toolTargetPath: targetPath,
    };
    const identity = eventIdentity(raw, invocation.event);
    raw = null;
    const diffFingerprint =
      invocation.event === "after_tool"
        ? await currentDiffFingerprint(repoRoot)
        : null;

    const decide = options.decide ?? coreHookDecider;
    const requested =
      mutationGuard ?? (await decide(invocation, runtimeContext));
    const guarded = await applyOneShotGuard(
      invocation,
      requested,
      options,
      repoRoot,
      identity,
    );
    await recordInvocation(
      invocation,
      stateDir,
      options.now?.() ?? Date.now(),
      diffFingerprint,
      guarded,
      requested.action === "request_remediation" &&
        guarded.action !== "request_remediation",
    );

    if (invocation.event === "session_end") {
      await clearSessionState(invocation.host, invocation.session_id, {
        repoRoot,
        stateDir: options.stateDir,
      });
    }

    const output =
      host === "claude"
        ? translateClaudeDecision(invocation.event, guarded)
        : translateCodexDecision(invocation.event, guarded);
    return output;
  } catch {
    return { stdout: null, stderr: null, exitCode: 0 };
  }
}

export async function runHook(
  argv: readonly string[],
  stdin: string,
  options: HookEntryOptions = {},
): Promise<HookRunResult> {
  return runBoundedHook(
    argv,
    stdin,
    Buffer.byteLength(stdin, "utf8") > hookPayloadByteLimit(argv),
    options,
  );
}

async function hookMain(): Promise<number> {
  const argv = process.argv.slice(2);
  const input = await readBoundedHookInput(
    process.stdin,
    hookPayloadByteLimit(argv),
  );
  const result = await runBoundedHook(argv, input.stdin, input.exceeded, {});
  if (result.stdout !== null) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== null) {
    process.stderr.write(result.stderr);
  }
  return result.exitCode;
}

// Direct execution (node dist entry or tsx source); imports skip this.
const invokedPath =
  process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await hookMain();
}
