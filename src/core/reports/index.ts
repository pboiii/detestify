// Report envelope assembly and safe report writing for `plan --diff` (M3).
//
// Determinism (ADR-002): every field except the documented volatile `timing`
// section is a pure function of the analyzed repository snapshot. Timestamps
// in the deterministic core (`generated_at`, evidence `observed_at`) are
// derived from the analyzed HEAD commit, never from the wall clock, so two
// runs over an unchanged tree serialize byte-identically once `timing` is
// removed. Threat model: report paths are written atomically (TM-002/TM-017),
// never through a symlink, and repository-derived text is sanitized before it
// reaches the terminal (TM-011).

import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { formatSchemaErrors, getValidator } from "../schemas/index.js";
import type {
  Decision,
  DecisionConfidence,
  EvidenceRecord,
  ObligationCandidate,
} from "../model/index.js";

// ---------------------------------------------------------------------------
// Report envelope types (report.schema.json mirror)
// ---------------------------------------------------------------------------

/** report.schema.json `change.classes` item. */
export type ReportChangeClass =
  | "behavior"
  | "bugfix"
  | "refactor"
  | "boundary"
  | "schema"
  | "migration"
  | "configuration"
  | "generated"
  | "dependency"
  | "performance"
  | "security"
  | "documentation"
  | "test_only"
  | "mixed";

export interface ReportRepository {
  readonly root: string;
  readonly base_revision: string | null;
  readonly head_revision: string | null;
  readonly diff_fingerprint: string;
  readonly dirty: boolean;
}

export interface ReportChange {
  readonly classes: readonly ReportChangeClass[];
  readonly confidence: DecisionConfidence;
  readonly changed_paths: readonly string[];
  readonly test_paths: readonly string[];
}

export interface ReportCapabilities {
  readonly runner: "vitest" | "jest" | "unknown" | "none";
  readonly ast: "type_resolved" | "syntactic_only" | "unavailable";
  readonly coverage: "available" | "unavailable" | "not_requested";
  readonly mutation: "available" | "unavailable" | "not_requested";
  readonly repository_commands_trusted: boolean;
  readonly network_used: boolean;
}

export interface ReportTiming {
  readonly elapsed_ms: number;
  readonly phases: Readonly<Record<string, number>>;
}

export interface PlanReport {
  readonly schema_version: "1.0";
  readonly report_id: string;
  readonly command: "plan --diff";
  readonly generated_at: string;
  readonly repository: ReportRepository;
  readonly change: ReportChange;
  readonly capabilities: ReportCapabilities;
  readonly obligation_candidates: readonly ObligationCandidate[];
  readonly evidence: readonly EvidenceRecord[];
  readonly decisions: readonly Decision[];
  readonly limitations: readonly string[];
  readonly timing: ReportTiming;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Most material change outcome first; the terminal summary shows index 0. */
const OUTCOME_SEVERITY: Readonly<Record<string, number>> = {
  NEW_TEST_CANDIDATE: 0,
  EXISTING_TEST_UPDATE_CANDIDATE: 1,
  INSUFFICIENT_EVIDENCE: 2,
  NO_TEST_SUPPORTED: 3,
};

function byId(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export interface BuildPlanReportInput {
  readonly reportId: string;
  /** Deterministic snapshot-derived RFC 3339 time (see module header). */
  readonly generatedAt: string;
  readonly repository: ReportRepository;
  readonly change: ReportChange;
  readonly capabilities: ReportCapabilities;
  readonly obligations: readonly ObligationCandidate[];
  readonly evidence: readonly EvidenceRecord[];
  readonly decisions: readonly Decision[];
  readonly limitations: readonly string[];
  readonly timing: ReportTiming;
}

/**
 * Assemble the report envelope with deterministic ordering: decisions by
 * outcome severity then id, evidence and obligations by id, limitations
 * deduplicated in first-seen order. Key order is fixed by construction.
 */
export function buildPlanReport(input: BuildPlanReportInput): PlanReport {
  const decisions = [...input.decisions].sort((left, right) => {
    const severity =
      (OUTCOME_SEVERITY[left.outcome] ?? 9) -
      (OUTCOME_SEVERITY[right.outcome] ?? 9);
    return severity !== 0 ? severity : byId(left, right);
  });
  return {
    schema_version: "1.0",
    report_id: input.reportId,
    command: "plan --diff",
    generated_at: input.generatedAt,
    repository: input.repository,
    change: input.change,
    capabilities: input.capabilities,
    obligation_candidates: [...input.obligations].sort(byId),
    evidence: [...input.evidence].sort(byId),
    decisions,
    limitations: [...new Set(input.limitations)],
    timing: input.timing,
  };
}

/** Validate a report against the packaged report schema; throws on failure. */
export async function validatePlanReport(report: PlanReport): Promise<void> {
  const validate = await getValidator("report.schema.json");
  if (!validate(report)) {
    throw new Error(
      `plan --diff report failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Terminal rendering (a view of the JSON, never separate logic)
// ---------------------------------------------------------------------------

const TERMINAL_FIELD_LIMIT = 300;

/**
 * Strip terminal control bytes (C0 except nothing, DEL, C1) from
 * repository-derived text and bound its length (TM-011). ESC removal disarms
 * ANSI sequences; the residue is plain text.
 */
export function sanitizeTerminal(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ");
  return clean.length > TERMINAL_FIELD_LIMIT
    ? `${clean.slice(0, TERMINAL_FIELD_LIMIT)}…`
    : clean;
}

/**
 * Render the concise terminal summary from the report JSON. `reportDisplay`
 * is the path shown on the final line, or null when no report file was
 * written (JSON on stdout).
 */
export function renderPlanSummary(
  report: PlanReport,
  reportDisplay: string | null,
): string {
  const top = report.decisions[0];
  if (top === undefined) {
    throw new Error("plan --diff report contains no decisions");
  }
  const lines: string[] = [];
  lines.push(`Decision: ${sanitizeTerminal(top.outcome)}`);
  lines.push(`Why: ${sanitizeTerminal(top.summary)}`);
  if (top.target.scope !== null) {
    lines.push(`Likely scope: ${sanitizeTerminal(top.target.scope)}`);
  }
  if (top.target.failure_class !== null) {
    lines.push(`Failure class: ${sanitizeTerminal(top.target.failure_class)}`);
  }

  const nearby = report.evidence
    .flatMap((record) => record.findings)
    .filter((finding) => finding.code === "NEARBY_TEST");
  if (nearby.length > 0) {
    lines.push(
      `Existing evidence: ${sanitizeTerminal(
        nearby.map((finding) => finding.summary).join("; "),
      )}`,
    );
  }

  const first = report.limitations[0];
  lines.push(
    first === undefined
      ? "Limitations: none recorded"
      : `Limitations: ${report.limitations.length} recorded — ${sanitizeTerminal(first)}`,
  );
  lines.push(
    reportDisplay === null
      ? "Report: not written (JSON on stdout)"
      : `Report: ${sanitizeTerminal(reportDisplay)}`,
  );
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Report writing: containment, staleness, atomic replace
// ---------------------------------------------------------------------------

function reportIoError(message: string, cause?: unknown): Error {
  return new Error(`Report I/O error: ${message}`, { cause });
}

function isGitInternal(relativePosix: string): boolean {
  return (
    relativePosix === ".git" ||
    relativePosix.startsWith(".git/") ||
    relativePosix.includes("/.git/") ||
    relativePosix.endsWith("/.git")
  );
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function nearestExistingAncestor(directory: string): Promise<string> {
  let current = directory;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return current;
      }
      current = parent;
    }
  }
}

/**
 * Refuse unsafe report targets before any directory or file is created
 * (TM-002): never write through a symlink at the target path, and a target
 * that is lexically inside the repository must still be inside it after the
 * nearest existing ancestor's symlinks are resolved — repository content must
 * not redirect a repository-contained report elsewhere. An explicit target
 * lexically outside the repository is the user's own choice and is allowed.
 */
export async function assertContainedReportTarget(
  target: string,
  repositoryRoot: string,
): Promise<void> {
  const absolute = path.resolve(target);
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      throw reportIoError(
        `refusing to write the report through a symlink: ${absolute}`,
      );
    }
    if (stat.isDirectory()) {
      throw reportIoError(`report path is a directory: ${absolute}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Report I/O")) {
      throw error;
    }
    // Target does not exist yet: fine.
  }

  const root = path.resolve(repositoryRoot);
  const lexicalRelative = path.relative(root, absolute);
  const lexicallyInside =
    lexicalRelative !== "" &&
    lexicalRelative !== ".." &&
    !lexicalRelative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(lexicalRelative);
  if (!lexicallyInside) {
    return;
  }
  if (isGitInternal(toPosix(lexicalRelative))) {
    throw reportIoError(`refusing to write the report into .git: ${absolute}`);
  }

  const realRoot = await realpath(root);
  const ancestor = await nearestExistingAncestor(path.dirname(absolute));
  const realAncestor = await realpath(ancestor);
  const remainder = path.relative(ancestor, path.dirname(absolute));
  const realParent = path.resolve(realAncestor, remainder);
  const realRelative = path.relative(realRoot, realParent);
  if (
    realRelative === ".." ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    throw reportIoError(
      `report path escapes the repository root after symlink resolution: ${absolute}`,
    );
  }
  if (realRelative !== "" && isGitInternal(toPosix(realRelative))) {
    throw reportIoError(`refusing to write the report into .git: ${absolute}`);
  }
}

export interface StaleReportCheck {
  readonly exists: boolean;
  /** Previous report's diff fingerprint, or null when unreadable. */
  readonly previousFingerprint: string | null;
  /** True when a previous report exists and was bound to a different tree. */
  readonly stale: boolean;
}

/**
 * Stale-fingerprint detection (M3, TM-015): a report already present at the
 * target that is bound to a different diff fingerprint proves the tree
 * changed since that analysis started.
 */
export async function detectStaleReport(
  target: string,
  currentFingerprint: string,
): Promise<StaleReportCheck> {
  let source: string;
  try {
    source = await readFile(path.resolve(target), "utf8");
  } catch {
    return { exists: false, previousFingerprint: null, stale: false };
  }
  try {
    const document = JSON.parse(source) as {
      repository?: { diff_fingerprint?: unknown };
    };
    const previous = document.repository?.diff_fingerprint;
    if (typeof previous === "string") {
      return {
        exists: true,
        previousFingerprint: previous,
        stale: previous !== currentFingerprint,
      };
    }
  } catch {
    // Unparseable previous report: replace it without a fingerprint claim.
  }
  return { exists: true, previousFingerprint: null, stale: false };
}

/**
 * Atomically write the report: exclusive temp file (0600) in the destination
 * directory, fsync, then rename over the target. A failure at any step
 * removes the temp file — no partial report is ever left at the target path.
 */
export async function writePlanReportAtomic(
  target: string,
  report: PlanReport,
  repositoryRoot: string,
): Promise<void> {
  await assertContainedReportTarget(target, repositoryRoot);
  const destination = path.resolve(target);
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(report, null, 2)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw message.startsWith("Report I/O error:")
      ? (error as Error)
      : reportIoError(message, error);
  }
}
