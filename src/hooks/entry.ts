#!/usr/bin/env node
// Hook launcher entry: `test-steward-hook <claude|codex> <event>` with the raw
// host payload on stdin. Invokes the same core decision seam the CLI uses;
// adapters only parse payloads and translate output (ADR-005).

import { access, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
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
) => Promise<NormalizedDecision>;

const BLOCK_GUARD_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete",
]);

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
  readonly exitCode: number;
}

async function storeRef(
  stateDir: string,
  data: unknown,
  label: string,
): Promise<string | null> {
  try {
    const directory = path.join(stateDir, "hooks", "raw");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(
      directory,
      `${label.replace(/[^a-z0-9-]/gi, "")}-${randomUUID()}.json`,
    );
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
    return file;
  } catch {
    return null;
  }
}

/** Downgrade a repeat remediation request to advice (ADR-005 loop guard). */
async function applyOneShotGuard(
  invocation: NormalizedInvocation,
  decision: NormalizedDecision,
  options: HookEntryOptions,
  repoRoot: string | null,
): Promise<NormalizedDecision> {
  if (
    decision.action !== "request_remediation" ||
    !BLOCK_GUARD_EVENTS.has(invocation.event)
  ) {
    return decision;
  }
  const status = await inspectLoopState(loopKey(invocation), {
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
  const granted = await recordRemediation(loopKey(invocation), {
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
 * never blocked by a Test Steward parse error.
 */
export async function runHook(
  argv: readonly string[],
  stdin: string,
  options: HookEntryOptions = {},
): Promise<HookRunResult> {
  const [host, event] = argv;
  if (host !== "claude" && host !== "codex") {
    return { stdout: null, exitCode: 2 };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return { stdout: null, exitCode: 0 };
  }

  try {
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
      process.env.TEST_STEWARD_STATE_DIR ??
      path.join(repoRoot ?? process.cwd(), ".test-steward");
    const context = {
      hostVersion: options.hostVersion ?? null,
      repoRoot,
      cwd: process.cwd(),
      store: (data: unknown, label: string) => storeRef(stateDir, data, label),
    };

    const invocation =
      host === "claude"
        ? await normalizeClaudeInput(raw, event as HookEvent, context)
        : await normalizeCodexInput(raw, event as HookEvent, context);

    const decide = options.decide ?? coreHookDecider;
    const guarded = await applyOneShotGuard(
      invocation,
      await decide(invocation),
      options,
      repoRoot,
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
    return { stdout: output.stdout, exitCode: output.exitCode };
  } catch {
    return { stdout: null, exitCode: 0 };
  }
}

async function hookMain(): Promise<number> {
  const stdin = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
  const result = await runHook(process.argv.slice(2), stdin);
  if (result.stdout !== null) {
    process.stdout.write(result.stdout);
  }
  return result.exitCode;
}

// Direct execution (node dist entry or tsx source); imports skip this.
const invokedPath =
  process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await hookMain();
}
