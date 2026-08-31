// Atomic one-shot remediation state (ADR-005 loop guard, TM-008).
// Keyed by host + session + repository (+ stable subagent/task identity):
// the first eligible Stop may persist attempt 1 exactly once; every later
// turn or diff in that work item — or a host already-continued flag — must
// resolve to allow/advise.
// State lives under a private, repository-keyed user state directory by
// default (`DETESTIFY_STATE_DIR` overrides the external root). Corrupt or
// unavailable state disables remediation rather than allowing an unbounded loop.

import { createHash } from "node:crypto";
import path from "node:path";
import {
  readPrivateTextFile,
  repositoryStateDirectory,
  withPrivateFileLock,
  writePrivateJsonAtomic,
} from "../security/state.js";
import type { NormalizedInvocation } from "./normalized.js";

const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const STATE_MAX_BYTES = 1024 * 1024;

export interface LoopKey {
  readonly host: string;
  readonly sessionId: string | null;
  readonly repoFingerprint: string;
  readonly agentId: string | null;
}

export interface LoopStatus {
  /** True when a remediation continuation was already granted. */
  readonly alreadyRemediated: boolean;
  /** Attempt number to stamp on a first-time remediation decision. */
  readonly nextAttempt: 0 | 1;
  readonly limitations: readonly string[];
}

interface PersistedState {
  readonly version: 1;
  readonly remediated: Record<string, number>;
  readonly updated_at: string;
}

function emptyState(): PersistedState {
  return { version: 1, remediated: {}, updated_at: new Date().toISOString() };
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<PersistedState>;
  return (
    Object.keys(value).sort().join(",") === "remediated,updated_at,version" &&
    candidate.version === 1 &&
    typeof candidate.remediated === "object" &&
    candidate.remediated !== null &&
    !Array.isArray(candidate.remediated) &&
    Object.values(candidate.remediated).every(
      (timestamp) =>
        typeof timestamp === "number" &&
        Number.isSafeInteger(timestamp) &&
        timestamp >= 0,
    ) &&
    typeof candidate.updated_at === "string" &&
    Number.isFinite(Date.parse(candidate.updated_at))
  );
}

export function diffFingerprint(source: string | null): string {
  return createHash("sha256")
    .update(source ?? "")
    .digest("hex");
}

function identityFingerprint(identity: string | null): string | null {
  const normalized = identity?.normalize("NFC").trim() ?? "";
  return normalized === "" ? null : diffFingerprint(normalized);
}

/** Stable loop key: turns and diff changes never create another remediation. */
export function loopKey(
  invocation: NormalizedInvocation,
  agentId?: string | null,
): LoopKey {
  return {
    host: invocation.host,
    sessionId: invocation.session_id,
    repoFingerprint:
      invocation.repo_root === null
        ? "no-repository"
        : diffFingerprint(invocation.repo_root),
    agentId: identityFingerprint(agentId ?? null),
  };
}

function keyString(key: LoopKey): string {
  return [
    key.host,
    key.sessionId ?? "-",
    key.repoFingerprint,
    key.agentId ?? "-",
  ]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function stateFilePath(
  repoRoot: string | null,
  overrideDir: string | undefined,
): string {
  if (overrideDir !== undefined) {
    if (!path.isAbsolute(overrideDir)) {
      throw new Error(
        "Loop state directory override must be an absolute path.",
      );
    }
    return path.join(overrideDir, "hooks", "loop-state.json");
  }
  if (repoRoot === null) {
    throw new Error(
      "Loop state directory unavailable: no repository root for repository-keyed state.",
    );
  }
  return path.join(
    repositoryStateDirectory(repoRoot),
    "hooks",
    "loop-state.json",
  );
}

/** Read state; corrupt state is unavailable, while a missing file is empty state. */
async function readState(file: string): Promise<{
  state: PersistedState;
  limitations: readonly string[];
  available: boolean;
}> {
  const stateRoot = path.dirname(path.dirname(file));
  let text: string | null;
  try {
    text = await readPrivateTextFile(file, stateRoot, STATE_MAX_BYTES);
  } catch {
    return {
      state: emptyState(),
      limitations: [
        "Loop state file was unavailable or insecure; remediation disabled for this stop.",
      ],
      available: false,
    };
  }
  if (text === null) {
    return { state: emptyState(), limitations: [], available: true };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isPersistedState(parsed)) {
      return { state: parsed, limitations: [], available: true };
    }
  } catch {
    // handled as corrupt below
  }
  return {
    state: emptyState(),
    limitations: [
      "Loop state file was corrupt; remediation disabled for this stop.",
    ],
    available: false,
  };
}

async function writeStateAtomic(
  file: string,
  state: PersistedState,
): Promise<void> {
  await writePrivateJsonAtomic(file, state, path.dirname(path.dirname(file)));
}

function liveEntries(
  remediated: Record<string, number>,
  now: number,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(remediated).filter(
      ([, timestamp]) => now - timestamp <= STATE_TTL_MS,
    ),
  );
}

/**
 * Inspect current one-shot state for `key`. Folds the persisted record, the
 * TTL, and the host `already_remediated` flag (Claude/Codex
 * `stop_hook_active`) into the adapter-facing status: any signal of a prior
 * continuation forces allow/advise.
 */
export async function inspectLoopState(
  key: LoopKey,
  options: {
    readonly alreadyRemediated: boolean;
    readonly repoRoot: string | null;
    readonly stateDir?: string | undefined;
    readonly now?: number | undefined;
  },
): Promise<LoopStatus> {
  let file: string;
  try {
    file = stateFilePath(options.repoRoot, options.stateDir);
  } catch {
    return {
      alreadyRemediated: options.alreadyRemediated,
      nextAttempt: 0,
      limitations: [
        "Loop state directory unavailable; remediation disabled for this stop.",
      ],
    };
  }

  const { state, limitations, available } = await readState(file);
  if (!available) {
    return {
      alreadyRemediated: true,
      nextAttempt: 0,
      limitations,
    };
  }
  const now = options.now ?? Date.now();
  const recorded = state.remediated[keyString(key)];
  const live = recorded !== undefined && now - recorded <= STATE_TTL_MS;

  return {
    alreadyRemediated: live || options.alreadyRemediated,
    nextAttempt: live ? 1 : 0,
    limitations,
  };
}

/**
 * Persist attempt 1 for `key` atomically. Returns false when a continuation
 * was already recorded (or the host flag already shows one), in which case
 * the caller must not block again.
 */
export async function recordRemediation(
  key: LoopKey,
  options: {
    readonly alreadyRemediated: boolean;
    readonly repoRoot: string | null;
    readonly stateDir?: string | undefined;
    readonly now?: number | undefined;
  },
): Promise<boolean> {
  if (options.alreadyRemediated) {
    return false;
  }
  try {
    const file = stateFilePath(options.repoRoot, options.stateDir);
    const stateRoot = path.dirname(path.dirname(file));
    const lockFile = path.join(path.dirname(file), "loop-state.lock");
    // ponytail: one repository-wide lock; use per-key locks if contention matters.
    return await withPrivateFileLock(lockFile, stateRoot, async () => {
      const { state, available } = await readState(file);
      if (!available) {
        return false;
      }
      const now = options.now ?? Date.now();
      const id = keyString(key);
      const recorded = state.remediated[id];
      if (recorded !== undefined && now - recorded <= STATE_TTL_MS) {
        return false;
      }
      const remediated = liveEntries({ ...state.remediated, [id]: now }, now);
      await writeStateAtomic(file, {
        version: 1,
        remediated,
        updated_at: new Date(now).toISOString(),
      });
      return true;
    });
  } catch {
    return false;
  }
}

/**
 * Expire every loop-state key for one host + session (session_end cleanup).
 * Errors are swallowed: cleanup must never fail the session-end hook.
 */
export async function clearSessionState(
  host: string,
  sessionId: string | null,
  options: {
    readonly repoRoot: string | null;
    readonly stateDir?: string | undefined;
  },
): Promise<void> {
  try {
    const file = stateFilePath(options.repoRoot, options.stateDir);
    const stateRoot = path.dirname(path.dirname(file));
    const lockFile = path.join(path.dirname(file), "loop-state.lock");
    await withPrivateFileLock(lockFile, stateRoot, async () => {
      const { state, available } = await readState(file);
      if (!available) {
        return;
      }
      const sessionPart = encodeURIComponent(sessionId ?? "-");
      const hostPart = encodeURIComponent(host);
      const remediated = Object.fromEntries(
        Object.entries(state.remediated).filter(([id]) => {
          const [idHost, idSession] = id.split("/");
          return idHost !== hostPart || idSession !== sessionPart;
        }),
      );
      await writeStateAtomic(file, {
        version: 1,
        remediated,
        updated_at: new Date().toISOString(),
      });
    });
  } catch {
    // session_end is best-effort cleanup
  }
}
