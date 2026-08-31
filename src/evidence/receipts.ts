// Verification receipts (TM-004/TM-015/TM-016): a receipt records exactly
// what ran (fixed argv, environment allowlist keys, revisions), how it ended
// (exit, timeout, process-group cleanup), the structured results, and the
// diff fingerprint at start AND end of the run. A fingerprint change during
// the run marks the receipt stale: it then proves nothing about the tree.

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { EvidenceRecord } from "../core/model/index.js";
import {
  readPrivateDirectory,
  readPrivateTextFile,
  repositoryStateDirectory,
  writePrivateJsonAtomic,
} from "../security/state.js";
import type { RunnerInvocation } from "./runners/vitest.js";
import {
  hasPassingTestResults,
  type RunnerResults,
} from "./runners/process.js";

const RECEIPT_MAX_BYTES = 1024 * 1024;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Private external Detestify state directory for a repository. */
export function stateDirectory(repoRoot: string): string {
  return repositoryStateDirectory(repoRoot);
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
  readonly runner: "vitest" | "jest" | "node:test";
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
  readonly output_truncated: boolean;
  readonly process_group_killed: boolean;
  readonly selected_test_files: readonly string[];
  readonly selection_complete: boolean;
  readonly results: RunnerResults | null;
  readonly policy_fingerprint: string;
  readonly diff_fingerprint_start: string;
  readonly diff_fingerprint_end: string;
  readonly stale: boolean;
  /** True only for a complete selected suite with a parseable, passing, non-stale run. */
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
  readonly policyFingerprint: string;
  readonly diffFingerprintStart: string;
  readonly diffFingerprintEnd: string;
  readonly selectionComplete: boolean;
  readonly limitations?: readonly string[];
}

function isPassingRun(
  selectionComplete: boolean,
  stale: boolean,
  timedOut: boolean,
  outputTruncated: boolean,
  processGroupKilled: boolean,
  exitCode: number | null,
  results: RunnerResults | null,
): boolean {
  return (
    selectionComplete &&
    !stale &&
    !timedOut &&
    !outputTruncated &&
    !processGroupKilled &&
    exitCode === 0 &&
    hasPassingTestResults(results)
  );
}

/** Assemble a receipt from one runner invocation and its policy/diff fingerprints. */
export function buildReceipt(input: BuildReceiptInput): VerificationReceipt {
  const { invocation } = input;
  const stale = input.diffFingerprintStart !== input.diffFingerprintEnd;
  const limitations = [...(input.limitations ?? [])];
  if (stale) {
    limitations.push(
      "The worktree changed while verification ran; this receipt is stale and makes no verification claim (TM-015).",
    );
  }
  if (!input.selectionComplete) {
    limitations.push(
      "Affected-test selection was capped; this receipt covers only a subset and cannot support a passing verification claim.",
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
  if (
    invocation.results !== null &&
    invocation.results.failed === 0 &&
    invocation.results.passed === 0
  ) {
    limitations.push(
      "The runner passed no tests; skipped tests do not support a passing verification claim.",
    );
  }
  const passed = isPassingRun(
    input.selectionComplete,
    stale,
    invocation.outcome.timedOut,
    invocation.outcome.outputTruncated,
    invocation.outcome.processGroupKilled,
    invocation.outcome.exitCode,
    invocation.results,
  );
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
    output_truncated: invocation.outcome.outputTruncated,
    process_group_killed: invocation.outcome.processGroupKilled,
    selected_test_files: invocation.testFiles,
    selection_complete: input.selectionComplete,
    results: invocation.results,
    policy_fingerprint: input.policyFingerprint,
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
  await writePrivateJsonAtomic(file, receipt, stateDir);
  return file;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isFailure(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasKeys(value, ["file", "identityDigest", "message", "name"])
  ) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    typeof value.message === "string" &&
    isNullableString(value.file) &&
    typeof value.identityDigest === "string" &&
    /^[0-9a-f]{64}$/.test(value.identityDigest)
  );
}

function isResults(value: unknown): value is RunnerResults {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      "failed",
      "failures",
      "passed",
      "skipped",
      "success",
      "total",
    ])
  ) {
    return false;
  }
  if (
    !isNonnegativeInteger(value.total) ||
    !isNonnegativeInteger(value.passed) ||
    !isNonnegativeInteger(value.failed) ||
    !isNonnegativeInteger(value.skipped) ||
    typeof value.success !== "boolean" ||
    !Array.isArray(value.failures) ||
    !value.failures.every(isFailure)
  ) {
    return false;
  }
  return value.total === value.passed + value.failed + value.skipped;
}

function isReceipt(value: unknown): value is VerificationReceipt {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      "base_revision",
      "command",
      "created_at",
      "diff_fingerprint_end",
      "diff_fingerprint_start",
      "duration_ms",
      "exit_code",
      "finished_at",
      "head_revision",
      "limitations",
      "output_truncated",
      "passed",
      "policy_fingerprint",
      "process_group_killed",
      "receipt_id",
      "repo_root",
      "results",
      "runner",
      "runner_version",
      "schema_version",
      "selection_complete",
      "selected_test_files",
      "stale",
      "started_at",
      "timed_out",
    ])
  ) {
    return false;
  }
  if (
    !isRecord(value.command) ||
    !hasKeys(value.command, ["argv", "cwd", "env_keys", "timeout_ms"])
  ) {
    return false;
  }
  const results = value.results;
  const stale =
    typeof value.diff_fingerprint_start === "string" &&
    typeof value.diff_fingerprint_end === "string" &&
    value.diff_fingerprint_start !== value.diff_fingerprint_end;
  const passed = isPassingRun(
    value.selection_complete === true,
    stale,
    value.timed_out === true,
    value.output_truncated === true,
    value.process_group_killed === true,
    isInteger(value.exit_code) ? value.exit_code : null,
    results !== null && isResults(results) ? results : null,
  );
  return (
    value.schema_version === "1.0" &&
    typeof value.receipt_id === "string" &&
    RECEIPT_ID.test(value.receipt_id) &&
    isIsoDate(value.created_at) &&
    typeof value.repo_root === "string" &&
    path.isAbsolute(value.repo_root) &&
    isNullableString(value.base_revision) &&
    isNullableString(value.head_revision) &&
    (value.runner === "vitest" ||
      value.runner === "jest" ||
      value.runner === "node:test") &&
    isNullableString(value.runner_version) &&
    isStringArray(value.command.argv) &&
    value.command.argv.length > 0 &&
    typeof value.command.cwd === "string" &&
    path.isAbsolute(value.command.cwd) &&
    isStringArray(value.command.env_keys) &&
    isInteger(value.command.timeout_ms) &&
    value.command.timeout_ms > 0 &&
    isIsoDate(value.started_at) &&
    isIsoDate(value.finished_at) &&
    isNonnegativeInteger(value.duration_ms) &&
    (value.exit_code === null || isInteger(value.exit_code)) &&
    typeof value.timed_out === "boolean" &&
    typeof value.output_truncated === "boolean" &&
    typeof value.process_group_killed === "boolean" &&
    isStringArray(value.selected_test_files) &&
    typeof value.selection_complete === "boolean" &&
    (results === null || isResults(results)) &&
    typeof value.diff_fingerprint_start === "string" &&
    FINGERPRINT.test(value.diff_fingerprint_start) &&
    typeof value.diff_fingerprint_end === "string" &&
    FINGERPRINT.test(value.diff_fingerprint_end) &&
    typeof value.policy_fingerprint === "string" &&
    FINGERPRINT.test(value.policy_fingerprint) &&
    value.stale === stale &&
    value.passed === passed &&
    isStringArray(value.limitations)
  );
}

/** Load the newest parseable receipt, or null when none exists. */
export async function latestReceipt(
  stateDir: string,
): Promise<{ receipt: VerificationReceipt; path: string } | null> {
  const directory = receiptsDirectory(stateDir);
  try {
    const names = await readPrivateDirectory(directory, stateDir);
    if (names === null) {
      return null;
    }
    const candidates = names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse();
    for (const name of candidates) {
      const file = path.join(directory, name);
      try {
        const text = await readPrivateTextFile(
          file,
          stateDir,
          RECEIPT_MAX_BYTES,
        );
        if (text === null) {
          continue;
        }
        const document: unknown = JSON.parse(text);
        if (
          isReceipt(document) &&
          name ===
            `${document.created_at.replace(/[:.]/g, "")}-${document.receipt_id}.json`
        ) {
          return { receipt: document, path: file };
        }
      } catch {
        // Skip unreadable, insecure, or corrupt receipts.
      }
    }
  } catch {
    return null;
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
  const incompleteResults =
    results !== null && results.failed === 0 && !hasPassingTestResults(results);
  const findings = [
    {
      code: !receipt.selection_complete
        ? "SELECTION_INCOMPLETE"
        : receipt.timed_out
          ? "VERIFICATION_TIMEOUT"
          : results === null
            ? "VERIFICATION_UNPARSEABLE"
            : results.failed > 0
              ? "VERIFICATION_FAILED"
              : incompleteResults
                ? "VERIFICATION_INCOMPLETE"
                : "VERIFICATION_PASSED",
      summary: !receipt.selection_complete
        ? `The ${receipt.runner} run selected only a capped subset of affected tests; its result cannot verify the change.`
        : results === null
          ? `The ${receipt.runner} run produced no structured results (exit ${receipt.exit_code ?? "none"}).`
          : incompleteResults
            ? `The ${receipt.runner} structured results did not establish complete selected-file execution evidence.`
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
    status:
      receipt.stale || !receipt.selection_complete || incompleteResults
        ? "partial"
        : results === null
          ? "failed"
          : "observed",
    source: {
      tool: receipt.runner,
      version: receipt.runner_version,
      path: input.receiptPath,
      command_fingerprint: `sha256:${createHash("sha256")
        .update(receipt.command.argv.join("\0"))
        .digest("hex")}`,
      observed_at: input.observedAt,
    },
    findings,
    data: {
      receipt_id: receipt.receipt_id,
      argv: receipt.command.argv,
      exit_code: receipt.exit_code,
      timed_out: receipt.timed_out,
      output_truncated: receipt.output_truncated,
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
      receipt.stale ||
      !receipt.selection_complete ||
      results === null ||
      incompleteResults
        ? "advisory_only"
        : "eligible",
    limitations: [...receipt.limitations],
  };
}
