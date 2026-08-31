// `cleanup-plan` command (M8): full read-only pipeline — inventory ->
// detectors -> protection -> planner -> ranked cleanup-plan document
// (cleanup-plan.schema.json), written atomically when a path is given.
// There is NO apply command and this command never mutates the source
// repository (ADR-006). Explicit historical replay applies repository-owned
// source patches only inside temporary scratch copies.
//
// Without historical replay, the plan document is byte-identical across runs
// on an unchanged tree: plan_id derives from the repository fingerprint and
// generated_at is anchored to the HEAD commit time, not the wall clock.

import { EXIT_CODES } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";
import { writeJsonReport } from "../output.js";
import { runGit } from "../../repository/git.js";
import { normalizeRepositoryPath } from "../../repository/paths.js";
import {
  schemaSignals,
  shortHash,
  type PlacementDetection,
} from "../../cleanup/detectors/index.js";
import {
  buildCleanupPlan,
  type CandidateDraft,
  type CleanupCandidate,
  type CleanupPlan,
} from "../../cleanup/planner.js";
import {
  HistoricalReplayTrustError,
  runHistoricalReplay,
  type HistoricalReplayResult,
} from "../../cleanup/historical-replay.js";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import type { EvidenceRecord } from "../../core/model/index.js";
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

interface CleanupPlanOptions extends CommandOptions {
  readonly historicalFaults?: string;
  readonly candidate?: string;
  readonly excludeTest?: string | readonly string[];
}

interface HistoricalRequest {
  readonly manifestPath: string;
  readonly candidateId: string;
  readonly excludeTestPaths: readonly string[];
  readonly configPath: string;
}

function historicalRequest(
  options: CleanupPlanOptions,
): HistoricalRequest | null {
  const excludeTestPaths =
    typeof options.excludeTest === "string"
      ? [options.excludeTest]
      : options.excludeTest;
  const supplied = [
    options.historicalFaults !== undefined,
    options.candidate !== undefined,
    excludeTestPaths !== undefined,
  ];
  if (!supplied.some(Boolean)) {
    return null;
  }
  if (!supplied.every(Boolean) || excludeTestPaths?.length === 0) {
    fail(
      EXIT_CODES.USAGE_ERROR,
      "Historical replay requires all of --historical-faults, --candidate, and --exclude-test.",
    );
  }
  if (options.config === undefined) {
    fail(
      EXIT_CODES.TRUST_REQUIRED,
      "Historical replay requires an explicitly passed --config.",
    );
  }
  return {
    manifestPath: options.historicalFaults!,
    candidateId: options.candidate!,
    excludeTestPaths: excludeTestPaths!,
    configPath: options.config,
  };
}

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
  const hypotheses = new Map<string, CandidateDraft>();
  for (const detection of audit.detections) {
    const split = schemaSignals(detection.signals);
    const proposedAction = audit.moveProposals.has(detection.id)
      ? "MOVE_CANDIDATE"
      : undefined;
    const direction =
      detection.detector === "placement"
        ? {
            remove_paths: [(detection as PlacementDetection).covered_path],
            retain_paths: [(detection as PlacementDetection).covering_path],
          }
        : {};
    // Exact path identity is the hypothesis boundary. Mere overlap is not
    // enough to combine signals from separate cleanup candidates.
    const identity = [...detection.test_paths].sort().join("\0");
    const existing = hypotheses.get(identity);
    if (existing !== undefined) {
      hypotheses.set(identity, {
        ...existing,
        ...direction,
        ...(existing.proposed_action === undefined &&
        proposedAction !== undefined
          ? { proposed_action: proposedAction }
          : {}),
        structural_signals: [
          ...new Set([
            ...(existing.structural_signals ?? []),
            ...split.structural_signals,
          ]),
        ].sort(),
        independent_signals: [
          ...new Set([
            ...(existing.independent_signals ?? []),
            ...split.independent_signals,
          ]),
        ].sort(),
        rationale: [...new Set([existing.rationale, detection.rationale])].join(
          " ",
        ),
        limitations: [
          ...new Set([
            ...(existing.limitations ?? []),
            ...detection.limitations,
          ]),
        ],
      });
      continue;
    }
    hypotheses.set(identity, {
      id: detection.id,
      test_paths: [...detection.test_paths],
      ...direction,
      rationale: detection.rationale,
      ...(proposedAction === undefined
        ? {}
        : { proposed_action: proposedAction }),
      structural_signals: split.structural_signals,
      independent_signals: split.independent_signals,
      limitations: [...detection.limitations],
    });
  }
  return [...hypotheses.values()];
}

function bindEvidenceToHypotheses(
  drafts: readonly CandidateDraft[],
  records: readonly EvidenceRecord[],
): EvidenceRecord[] {
  const candidatesBySignal = new Map<string, CandidateDraft | null>();
  for (const draft of drafts) {
    for (const signalId of [
      ...(draft.structural_signals ?? []),
      ...(draft.independent_signals ?? []),
    ]) {
      candidatesBySignal.set(
        signalId,
        candidatesBySignal.has(signalId) ? null : draft,
      );
    }
  }
  return records.map((record) => {
    const candidate = candidatesBySignal.get(record.id);
    const removePaths = candidate?.remove_paths ?? [];
    const retainPaths = candidate?.retain_paths ?? [];
    if (
      candidate === undefined ||
      candidate === null ||
      removePaths.length === 0 ||
      retainPaths.length === 0
    ) {
      return record;
    }
    const structural =
      candidate.structural_signals?.includes(record.id) ?? false;
    return {
      ...record,
      data: {
        ...record.data,
        candidate_id: candidate.id,
        remove_paths: [...removePaths],
        retain_paths: [...retainPaths],
      },
      gate_trust:
        record.status === "observed" &&
        (record.gate_trust === "eligible" || structural)
          ? "eligible"
          : record.gate_trust,
    };
  });
}

function attachHistoricalReplay(
  drafts: readonly CandidateDraft[],
  candidateId: string,
  excludeTestPaths: readonly string[],
  revision: string | null,
  replay: HistoricalReplayResult,
): CandidateDraft[] {
  return drafts.map((draft) => {
    if (draft.id !== candidateId) {
      return draft;
    }
    const removePaths = [
      ...new Set(excludeTestPaths.map(normalizeRepositoryPath)),
    ];
    const retainPaths = draft.test_paths.filter(
      (testPath) => !removePaths.includes(testPath),
    );
    const limitations = replay.passed
      ? [...(draft.limitations ?? [])]
      : [
          ...(draft.limitations ?? []),
          ...(replay.limitations.length > 0
            ? replay.limitations
            : [replay.summary]),
        ];
    return {
      ...draft,
      remove_paths: removePaths,
      retain_paths: retainPaths,
      ...(replay.passed
        ? {
            obligation_ids: [
              ...new Set([
                ...(draft.obligation_ids ?? []),
                ...replay.obligationIds,
              ]),
            ],
            obligation_preservation: replay.obligationIds.map(
              (obligationId) => ({
                obligation_id: obligationId,
                retained_paths: retainPaths,
              }),
            ),
            independent_signals: [
              ...new Set([
                ...(draft.independent_signals ?? []),
                replay.signalId,
              ]),
            ],
          }
        : {}),
      counterfactual: {
        status: replay.counterfactualStatus,
        commands_ref: replay.signalId,
        candidate_id: candidateId,
        remove_paths: removePaths,
        retain_paths: retainPaths,
        preserved_obligations: replay.passed ? replay.obligationIds : [],
        limitations: replay.limitations,
      },
      worktree_validation: {
        status: replay.worktreeStatus,
        worktree_ref: replay.signalId,
        revision,
        cleanup_complete: true,
      },
      rationale: replay.passed
        ? `${draft.rationale} ${replay.summary}`
        : draft.rationale,
      limitations,
    };
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
    summary:
      `${candidate.action}: remove ${candidate.remove_paths.join(", ") || "(none)"}; retain ${candidate.retain_paths.join(", ") || "(none)"}`.slice(
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
    `Cleanup plan ${plan.plan_id}: ${plan.candidates.length} ranked candidate(s). Read-only — there is no apply command; the source repository was not modified.`,
    "HUMAN APPROVAL REQUIRED: no candidate may be acted on without explicit human review and approval.",
  ];
  plan.candidates.forEach((candidate, index) => {
    lines.push(
      `${String(index + 1).padStart(2)}. ${candidate.action}  ${candidate.test_paths.join(", ")}`,
    );
    lines.push(
      `    remove: ${candidate.remove_paths.join(", ") || "(none)"} | retain: ${candidate.retain_paths.join(", ") || "(none)"}`,
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

export async function run(options: CleanupPlanOptions): Promise<void> {
  const started = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const request = historicalRequest(options);
  const ctx = await loadRepoContext(options);
  const repositoryMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const audit = await collectAudit(ctx, todayIso());

  let drafts = candidateDrafts(audit);
  let replay: HistoricalReplayResult | null = null;
  if (request !== null) {
    const selected = drafts.find((draft) => draft.id === request.candidateId);
    if (selected === undefined) {
      fail(
        EXIT_CODES.USAGE_ERROR,
        `Cleanup candidate not found: ${request.candidateId}`,
      );
    }
    try {
      replay = await runHistoricalReplay({
        repositoryRoot: ctx.snapshot.root,
        repositoryFiles: ctx.files,
        sourceFiles: ctx.shape.sourceFiles,
        testFiles: ctx.shape.runnerTestFiles,
        runner: ctx.shape.runner,
        configPath: request.configPath,
        manifestPath: request.manifestPath,
        candidateId: request.candidateId,
        candidateTestPaths: selected.test_paths,
        excludeTestPaths: request.excludeTestPaths,
        revision: ctx.snapshot.headRevision,
        sourceFingerprint: ctx.diff.fingerprint,
        observedAt: generatedAt,
      });
    } catch (error) {
      if (error instanceof HistoricalReplayTrustError) {
        fail(EXIT_CODES.TRUST_REQUIRED, error.message);
      }
      throw error;
    }
    drafts = attachHistoricalReplay(
      drafts,
      request.candidateId,
      request.excludeTestPaths,
      ctx.snapshot.headRevision,
      replay,
    );
  }

  const revision = ctx.snapshot.headRevision ?? "unborn";
  const planGeneratedAt = await deterministicGeneratedAt(ctx);
  const candidateEvidence = bindEvidenceToHypotheses(drafts, [
    ...(signalEvidence(audit, ctx, generatedAt) as EvidenceRecord[]),
    ...(replay === null ? [] : [replay.evidence as unknown as EvidenceRecord]),
  ]);
  const plan = buildCleanupPlan({
    plan_id: `plan-${shortHash(ctx.snapshot.root, revision, ctx.diff.fingerprint, replay?.signalId ?? "")}`,
    generated_at: planGeneratedAt,
    repository: {
      root: ctx.snapshot.root,
      revision,
      diff_fingerprint: ctx.diff.fingerprint,
    },
    candidates: drafts,
    evidence: candidateEvidence,
    protection: audit.protection,
    allow_delete_candidates: ctx.config.allowDeleteCandidates,
    limitations: [
      "Alpha cleanup is a read-only candidate plan: no apply command exists and the source repository is not deleted, edited, staged, or committed.",
      "Static-only evidence cannot produce DELETE_CANDIDATE (ADR-006).",
      ...(ctx.snapshot.headRevision === null
        ? [
            "The repository has no HEAD commit; generated_at is fixed to the epoch.",
          ]
        : []),
      ...(replay !== null && !replay.passed ? replay.limitations : []),
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
    ...candidateEvidence,
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
  if (replay !== null) {
    report.capabilities = {
      ...(report.capabilities as Record<string, unknown>),
      repository_commands_trusted: true,
    };
  }

  const humanLines = planSummaryLines(plan);
  if (replay !== null) {
    humanLines.push(`Historical fault replay: ${replay.summary}`);
  }
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
