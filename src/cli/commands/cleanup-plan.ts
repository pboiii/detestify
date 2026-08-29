// `cleanup-plan` command (M8): full read-only pipeline — inventory ->
// detectors -> protection -> planner -> ranked cleanup-plan document
// (cleanup-plan.schema.json), written atomically when a path is given.
// There is NO apply command and this command never deletes, edits, stages,
// or commits anything (ADR-006).
//
// Determinism: the plan document is byte-identical across runs on an
// unchanged tree — plan_id derives from the repository fingerprint and
// generated_at is anchored to the HEAD commit time, not the wall clock.

import { EXIT_CODES } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";
import { writeJsonReport } from "../output.js";
import { runGit } from "../../repository/git.js";
import { schemaSignals, shortHash } from "../../cleanup/detectors/index.js";
import {
  buildCleanupPlan,
  type CandidateDraft,
  type CleanupCandidate,
  type CleanupPlan,
} from "../../cleanup/planner.js";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import {
  buildReportEnvelope,
  fail,
  finishReport,
  loadRepoContext,
  validateReport,
  type RepoContext,
} from "./inventory.js";
import {
  collectAudit,
  protectionEvidence,
  signalEvidence,
  todayIso,
  type AuditCollection,
} from "./audit.js";

const EPOCH_ISO = "1970-01-01T00:00:00Z";

/** HEAD committer time (RFC 3339): deterministic for an unchanged tree. */
async function deterministicGeneratedAt(ctx: RepoContext): Promise<string> {
  if (ctx.snapshot.headRevision === null) {
    return EPOCH_ISO;
  }
  const { stdout } = await runGit(ctx.snapshot.root, [
    "show",
    "-s",
    "--format=%cI",
    "HEAD",
  ]);
  const timestamp = stdout.trim();
  return timestamp === "" ? EPOCH_ISO : timestamp;
}

function candidateDrafts(audit: AuditCollection): CandidateDraft[] {
  return audit.detections.map((detection) => {
    const split = schemaSignals(detection.signals);
    const draft: CandidateDraft = {
      id: detection.id,
      test_paths: [...detection.test_paths],
      rationale: detection.rationale,
      structural_signals: split.structural_signals,
      independent_signals: split.independent_signals,
      limitations: [...detection.limitations],
    };
    return audit.moveProposals.has(detection.id)
      ? { ...draft, proposed_action: "MOVE_CANDIDATE" }
      : draft;
  });
}

function candidateDecision(candidate: CleanupCandidate): unknown {
  return {
    schema_version: "1.0",
    id: `dec-${candidate.id}`,
    domain: "cleanup",
    outcome: candidate.action,
    gate_action: "advise",
    confidence: candidate.action === "KEEP" ? "high" : "medium",
    reason_code: `CLEANUP_${candidate.action}`,
    summary: `${candidate.action}: ${candidate.test_paths.join(", ")}`.slice(
      0,
      500,
    ),
    rationale: candidate.rationale,
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: [
      ...candidate.structural_signals,
      ...candidate.independent_signals,
    ],
    target: {
      scope: null,
      purpose: null,
      technique: null,
      cadence: null,
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: {
      structural_signal_ids: [...candidate.structural_signals],
      independent_signal_ids: [...candidate.independent_signals],
      protected_check_passed: candidate.protected_checks.every(
        (check) => check.passed,
      ),
      human_approval_required: candidate.human_approval.required,
    },
    limitations: [...candidate.limitations],
  };
}

function planSummaryLines(plan: CleanupPlan): string[] {
  const lines = [
    `Cleanup plan ${plan.plan_id}: ${plan.candidates.length} ranked candidate(s). Read-only — there is no apply command; nothing was modified.`,
    "HUMAN APPROVAL REQUIRED: no candidate may be acted on without explicit human review and approval.",
  ];
  plan.candidates.forEach((candidate, index) => {
    lines.push(
      `${String(index + 1).padStart(2)}. ${candidate.action}  ${candidate.test_paths.join(", ")}`,
    );
    const structural =
      candidate.structural_signals.length > 0
        ? candidate.structural_signals.join(", ")
        : "(none)";
    const independent =
      candidate.independent_signals.length > 0
        ? candidate.independent_signals.join(", ")
        : "(none)";
    lines.push(`    structural: ${structural} | independent: ${independent}`);
    const blocked = candidate.protected_checks.filter((check) => !check.passed);
    for (const check of blocked) {
      lines.push(`    protected: ${check.detail}`);
    }
    lines.push(`    ${candidate.rationale}`);
  });
  return lines;
}

export async function run(options: CommandOptions): Promise<void> {
  const started = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const ctx = await loadRepoContext(options);
  const repositoryMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const audit = await collectAudit(ctx, todayIso());

  const revision = ctx.snapshot.headRevision ?? "unborn";
  const planGeneratedAt = await deterministicGeneratedAt(ctx);
  const plan = buildCleanupPlan({
    plan_id: `plan-${shortHash(ctx.snapshot.root, revision, ctx.diff.fingerprint)}`,
    generated_at: planGeneratedAt,
    repository: {
      root: ctx.snapshot.root,
      revision,
      diff_fingerprint: ctx.diff.fingerprint,
    },
    candidates: candidateDrafts(audit),
    protection: audit.protection,
    allow_delete_candidates: ctx.config.allowDeleteCandidates,
    limitations: [
      "Alpha cleanup is a read-only candidate plan: no apply command exists and nothing is deleted, edited, staged, or committed.",
      "Static-only evidence cannot produce DELETE_CANDIDATE (ADR-006).",
      ...(ctx.snapshot.headRevision === null
        ? [
            "The repository has no HEAD commit; generated_at is fixed to the epoch.",
          ]
        : []),
    ],
  });

  const planValidate = await getValidator("cleanup-plan.schema.json");
  if (!planValidate(plan)) {
    fail(
      EXIT_CODES.SCHEMA_CONTRACT_ERROR,
      `Cleanup plan failed schema validation: ${formatSchemaErrors(planValidate.errors)}`,
    );
  }

  // `--json` carries the command-specific cleanup-plan document; the shared
  // report envelope is written via `--report`.
  if (options.json !== undefined && options.json !== "-") {
    await writeJsonReport(options.json, plan);
  }

  const elapsedMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const evidence = [
    ...signalEvidence(audit, ctx, generatedAt),
    protectionEvidence(audit, ctx, generatedAt),
  ];
  const summaryDecision = {
    schema_version: "1.0",
    id: "cleanup-plan-summary",
    domain: "change",
    outcome: "NO_TEST_SUPPORTED",
    gate_action: "allow",
    confidence: "high",
    reason_code: "CLEANUP_PLAN_READ_ONLY",
    summary: `Cleanup plan ${plan.plan_id} ranked ${plan.candidates.length} candidate(s); every candidate requires human approval and no destructive capability exists.`,
    rationale:
      "The planner applied the ADR-006 evidence rule: DELETE_CANDIDATE requires a structural signal, an independent behavioral/historical signal, passing protected checks, and human approval; static-only candidates were demoted.",
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: [
      ...new Set(evidence.map((record) => (record as { id: string }).id)),
    ],
    target: {
      scope: null,
      purpose: null,
      technique: null,
      cadence: null,
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
    limitations: [],
  };
  const report = buildReportEnvelope({
    command: "cleanup-plan",
    ctx,
    generatedAt,
    ast: audit.astMode,
    evidence,
    decisions: [
      summaryDecision,
      ...plan.candidates.map((candidate) => candidateDecision(candidate)),
    ],
    limitations: [
      ...plan.limitations,
      ...ctx.shape.limitations,
      ...audit.detectorLimitations,
    ],
    elapsedMs,
    phases: { repository: repositoryMs, plan: elapsedMs - repositoryMs },
  });

  const humanLines = planSummaryLines(plan);
  if (options.json !== undefined && options.json !== "-") {
    humanLines.push(`Plan document: ${options.json}`);
  } else if (options.json === undefined) {
    humanLines.push(
      "Pass --json <path> to write the cleanup-plan document (cleanup-plan.schema.json).",
    );
  }
  if (options.report !== undefined) {
    humanLines.push(`Report: ${options.report}`);
  }

  // Report envelope validation + emission. `--json -` streams the PLAN
  // document (the command-specific schema) on stdout, not the report.
  if (options.json === "-") {
    await validateReport(report);
    if (options.report !== undefined) {
      await writeJsonReport(options.report, report);
    }
    process.stderr.write(`${humanLines.join("\n")}\n`);
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }
  // The plan document already went to --json; keep the report off that path.
  const { json: _json, ...reportOptions } = options;
  await finishReport(reportOptions, report, humanLines);
}
