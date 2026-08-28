// Atomic one-shot remediation state (ADR-005 loop guard, TM-008).
// Keyed by host + session + diff fingerprint (+ agent id for subagents):
// the first eligible Stop may persist attempt 1 exactly once; every later
// observation — or a host already-continued flag — must resolve to allow/advise.
// State lives under the repository's untracked `.test-steward/` state dir by
// default (`TEST_STEWARD_STATE_DIR` overrides). Corrupt state degrades to
// first-attempt with a disclosed limitation; an unwritable state dir disables
// remediation entirely rather than allowing an unbounded loop.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { NormalizedInvocation } from "./normalized.js";

const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const STATE_FILE_MODE = 0o600;

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
    candidate.version === 1 &&
    typeof candidate.remediated === "object" &&
    candidate.remediated !== null &&
    typeof candidate.updated_at === "string"
  );
}

export function diffFingerprint(source: string | null): string {
  return createHash("sha256")
    .update(source ?? "")
    .digest("hex");
}

/**
 * Loop key for an invocation. When the adapter tracked a real Git diff
 * fingerprint for this turn it passes it as `diffDigest`; otherwise the
 * repository root snapshot stands in, per ADR-005 "host/session/repository
 * snapshot" keying.
 */
export function loopKey(
  invocation: NormalizedInvocation,
  diffDigest?: string | null,
  agentId?: string | null,
): LoopKey {
  return {
    host: invocation.host,
    sessionId: invocation.session_id,
    repoFingerprint:
      diffDigest !== undefined && diffDigest !== null
        ? diffFingerprint(diffDigest)
        : invocation.repo_root === null
          ? "no-repository"
          : diffFingerprint(invocation.repo_root),
    agentId: agentId ?? null,
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
  const base =
    overrideDir ??
    process.env.TEST_STEWARD_STATE_DIR ??
    (repoRoot !== null ? path.join(repoRoot, ".test-steward") : null);
  if (base === null) {
    throw new Error(
      "Loop state directory unavailable: no repository root and no TEST_STEWARD_STATE_DIR.",
    );
  }
  return path.join(base, "hooks", "loop-state.json");
}

/** Read state; corrupt/missing state degrades to empty with a limitation. */
async function readState(
  file: string,
): Promise<{ state: PersistedState; limitations: readonly string[] }> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return { state: emptyState(), limitations: [] };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isPersistedState(parsed)) {
      return { state: parsed, limitations: [] };
    }
  } catch {
    // handled below
  }
  return {
    state: emptyState(),
    limitations: [
      "Loop state file was corrupt; remediation state degraded to first-attempt.",
    ],
  };
}

async function writeStateAtomic(
  file: string,
  state: PersistedState,
): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", STATE_FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      await rename(temporary, file);
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
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

  const { state, limitations } = await readState(file);
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
  const file = stateFilePath(options.repoRoot, options.stateDir);
  const { state } = await readState(file);
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
    const { state } = await readState(file);
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
  } catch {
    // session_end is best-effort cleanup
  }
}
