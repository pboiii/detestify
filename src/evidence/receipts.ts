// Verification receipts (TM-004/TM-015/TM-016): a receipt records exactly
// what ran (fixed argv, environment allowlist keys, revisions), how it ended
// (exit, timeout, process-group cleanup), the structured results, and the
// diff fingerprint at start AND end of the run. A fingerprint change during
// the run marks the receipt stale: it then proves nothing about the tree.

import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceRecord } from "../core/model/index.js";
import { writeJsonReport } from "../cli/output.js";
import type { RunnerInvocation } from "./runners/vitest.js";
import type { RunnerResults } from "./runners/process.js";

/** Test Steward state directory for a repository (env override respected). */
export function stateDirectory(repoRoot: string): string {
  return (
    process.env.TEST_STEWARD_STATE_DIR ?? path.join(repoRoot, ".test-steward")
  );
}

/** Receipts live under the report directory. */
export function receiptsDirectory(stateDir: string): string {
  return path.join(stateDir, "reports", "receipts");
}

export interface VerificationReceipt {
  readonly schema_version: "1.0";
  readonly receipt_id: string;
  readonly created_at: string;
  readonly repo_root: string;
  readonly base_revision: string | null;
  readonly head_revision: string | null;
  readonly runner: "vitest" | "jest";
  readonly runner_version: string | null;
  readonly command: {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly env_keys: readonly string[];
    readonly timeout_ms: number;
  };
  readonly started_at: string;
  readonly finished_at: string;
  readonly duration_ms: number;
  readonly exit_code: number | null;
  readonly timed_out: boolean;
  readonly process_group_killed: boolean;
  readonly selected_test_files: readonly string[];
  readonly results: RunnerResults | null;
  readonly diff_fingerprint_start: string;
  readonly diff_fingerprint_end: string;
  readonly stale: boolean;
  /** True only for a completed, parseable, fully passing, non-stale run. */
  readonly passed: boolean;
  readonly limitations: readonly string[];
}

export interface BuildReceiptInput {
  readonly invocation: RunnerInvocation;
  readonly repoRoot: string;
  readonly baseRevision: string | null;
  readonly headRevision: string | null;
  readonly timeoutMs: number;
  readonly envKeys: readonly string[];
  readonly diffFingerprintStart: string;
  readonly diffFingerprintEnd: string;
  readonly limitations?: readonly string[];
}

/** Assemble a receipt from one runner invocation and the two fingerprints. */
export function buildReceipt(input: BuildReceiptInput): VerificationReceipt {
  const { invocation } = input;
  const stale = input.diffFingerprintStart !== input.diffFingerprintEnd;
  const limitations = [...(input.limitations ?? [])];
  if (stale) {
    limitations.push(
      "The worktree changed while verification ran; this receipt is stale and makes no verification claim (TM-015).",
    );
  }
  if (invocation.outcome.timedOut) {
    limitations.push(
      `Verification exceeded ${input.timeoutMs} ms; the runner's process group was killed and partial output is not reported as a result.`,
    );
  }
  if (!invocation.outcome.timedOut && invocation.results === null) {
    limitations.push(
      "The runner produced no parseable structured results; pass/fail state is unknown.",
    );
  }
  const passed =
    !stale &&
    !invocation.outcome.timedOut &&
    invocation.results !== null &&
    invocation.results.failed === 0 &&
    invocation.outcome.exitCode === 0;
  return {
    schema_version: "1.0",
    receipt_id: randomUUID(),
    created_at: new Date().toISOString(),
    repo_root: input.repoRoot,
    base_revision: input.baseRevision,
    head_revision: input.headRevision,
    runner: invocation.runner,
    runner_version: invocation.version,
    command: {
      argv: invocation.argv,
      cwd: invocation.cwd,
      env_keys: input.envKeys,
      timeout_ms: input.timeoutMs,
    },
    started_at: invocation.outcome.startedAt,
    finished_at: invocation.outcome.finishedAt,
    duration_ms: invocation.outcome.durationMs,
    exit_code: invocation.outcome.exitCode,
    timed_out: invocation.outcome.timedOut,
    process_group_killed: invocation.outcome.processGroupKilled,
    selected_test_files: invocation.testFiles,
    results: invocation.results,
    diff_fingerprint_start: input.diffFingerprintStart,
    diff_fingerprint_end: input.diffFingerprintEnd,
    stale,
    passed,
    limitations,
  };
}

/** Write a receipt atomically under the report directory; returns its path. */
export async function writeReceipt(
  stateDir: string,
  receipt: VerificationReceipt,
): Promise<string> {
  const stamp = receipt.created_at.replace(/[:.]/g, "");
  const file = path.join(
    receiptsDirectory(stateDir),
    `${stamp}-${receipt.receipt_id}.json`,
  );
  await writeJsonReport(file, receipt);
  return file;
}

function isReceipt(value: unknown): value is VerificationReceipt {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<VerificationReceipt>;
  return (
    candidate.schema_version === "1.0" &&
    typeof candidate.receipt_id === "string" &&
    typeof candidate.diff_fingerprint_start === "string" &&
    typeof candidate.diff_fingerprint_end === "string" &&
    typeof candidate.stale === "boolean" &&
    typeof candidate.passed === "boolean"
  );
}

/** Load the newest parseable receipt, or null when none exists. */
export async function latestReceipt(
  stateDir: string,
): Promise<{ receipt: VerificationReceipt; path: string } | null> {
  const directory = receiptsDirectory(stateDir);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return null;
  }
  const candidates = names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();
  for (const name of candidates) {
    const file = path.join(directory, name);
    try {
      const document: unknown = JSON.parse(await readFile(file, "utf8"));
      if (isReceipt(document)) {
        return { receipt: document, path: file };
      }
    } catch {
      // Skip unreadable/corrupt receipts.
    }
  }
  return null;
}

export interface ReceiptEvidenceInput {
  readonly id: string;
  readonly observedAt: string;
  /** Repository-relative receipt path for the evidence source. */
  readonly receiptPath: string | null;
}

/** Shape a receipt as a schema-valid `runtime` evidence record. */
export function receiptEvidence(
  receipt: VerificationReceipt,
  input: ReceiptEvidenceInput,
): EvidenceRecord {
  const results = receipt.results;
  const findings = [
    {
      code: receipt.timed_out
        ? "VERIFICATION_TIMEOUT"
        : results === null
          ? "VERIFICATION_UNPARSEABLE"
          : results.failed > 0
            ? "VERIFICATION_FAILED"
            : "VERIFICATION_PASSED",
      summary:
        results === null
          ? `The ${receipt.runner} run produced no structured results (exit ${receipt.exit_code ?? "none"}).`
          : `${receipt.runner} ran ${results.total} test${results.total === 1 ? "" : "s"}: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped.`,
      paths: [...receipt.selected_test_files].sort(),
    },
    ...(results?.failures ?? []).slice(0, 10).map((failure) => ({
      code: "TEST_FAILURE",
      summary: `${failure.name}: ${failure.message.split("\n")[0] ?? ""}`.slice(
        0,
        400,
      ),
      paths: [] as string[],
    })),
  ];
  return {
    schema_version: "1.0",
    id: input.id,
    kind: "runtime",
    status: receipt.stale
      ? "partial"
      : results === null
        ? "failed"
        : "observed",
    source: {
      tool: receipt.runner,
      version: receipt.runner_version,
      path: input.receiptPath,
      command_fingerprint: `sha256:${createHash("sha256")
        .update(receipt.command.argv.join(" "))
        .digest("hex")}`,
      observed_at: input.observedAt,
    },
    findings,
    data: {
      receipt_id: receipt.receipt_id,
      argv: receipt.command.argv,
      exit_code: receipt.exit_code,
      timed_out: receipt.timed_out,
      process_group_killed: receipt.process_group_killed,
      duration_ms: receipt.duration_ms,
      total: results?.total ?? null,
      passed: results?.passed ?? null,
      failed: results?.failed ?? null,
      skipped: results?.skipped ?? null,
      diff_fingerprint_start: receipt.diff_fingerprint_start,
      diff_fingerprint_end: receipt.diff_fingerprint_end,
      stale: receipt.stale,
    },
    gate_trust:
      receipt.stale || results === null ? "advisory_only" : "eligible",
    limitations: [...receipt.limitations],
  };
}
