// `audit` command (M8): read-only portfolio analysis. Runs every cleanup
// detector over the repository test inventory, attaches protected-record
// matches, and reports observations + candidates as EVIDENCE only — audit
// makes no lifecycle decisions (those belong to `cleanup-plan`).

import type { CommandOptions } from "../options.js";
import { analyzeTypeScript } from "../../analysis/typescript.js";
import {
  detectExactDuplicates,
  detectExpiry,
  detectMockChoreography,
  detectOrphans,
  detectPlacement,
  detectSimilar,
  detectSnapshots,
  detectTrivial,
  loadDetectorContext,
  reportSlowFlake,
  type CleanupDetection,
  type CleanupObservation,
  type DetectorContext,
} from "../../cleanup/detectors/index.js";
import {
  loadProtectionIndex,
  matchProtection,
  PROTECTED_TESTS_LEDGER,
  type ProtectedRecord,
  type ProtectionIndex,
} from "../../cleanup/protection.js";
import {
  buildReportEnvelope,
  CLI_VERSION,
  finishReport,
  loadRepoContext,
  type RepoContext,
} from "./inventory.js";

/** Wall-clock date (`YYYY-MM-DD`) for expiry evaluation. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AuditCollection {
  readonly context: DetectorContext;
  /** All detections (structural detectors + placement + expiry), sorted by id. */
  readonly detections: readonly CleanupDetection[];
  /** Detection ids whose candidate proposes a non-destructive move. */
  readonly moveProposals: ReadonlySet<string>;
  readonly observations: readonly CleanupObservation[];
  readonly protection: ProtectionIndex;
  /** Detection id -> protected records matching any of its test paths. */
  readonly protectionMatches: ReadonlyMap<string, readonly ProtectedRecord[]>;
  readonly astMode: "type_resolved" | "syntactic_only";
  readonly detectorLimitations: readonly string[];
}

/** Run the full detector battery + protection index over the repository. */
export async function collectAudit(
  ctx: RepoContext,
  expiryDate: string,
): Promise<AuditCollection> {
  const root = ctx.snapshot.root;
  const context = await loadDetectorContext(root, ctx.files);
  const analysis = await analyzeTypeScript({
    repoRoot: root,
    files: ctx.files,
  });
  const staticResults = [
    detectExactDuplicates(context),
    detectSimilar(context),
    detectOrphans(context, analysis.files),
    detectTrivial(context),
    detectMockChoreography(context),
    await detectSnapshots(context),
  ];
  const placement = detectPlacement(context);
  const expiry = await detectExpiry(root, expiryDate);
  const slowFlake = reportSlowFlake(context);

  const detections = [
    ...staticResults.flatMap((result) => result.detections),
    ...placement.detections,
    ...expiry.detections,
  ].sort((a, b) => a.id.localeCompare(b.id));

  const protection = await loadProtectionIndex(root, ctx.config.protectedTests);
  const protectionMatches = new Map(
    detections.map((detection) => [
      detection.id,
      matchProtection(protection, detection.test_paths, []),
    ]),
  );

  return {
    context,
    detections,
    moveProposals: new Set(placement.detections.map((d) => d.id)),
    observations: slowFlake.observations,
    protection,
    protectionMatches,
    astMode:
      analysis.capabilities.mode === "type-resolved"
        ? "type_resolved"
        : "syntactic_only",
    detectorLimitations: [
      ...new Set(
        [...staticResults, placement, expiry, slowFlake].flatMap(
          (result) => result.limitations,
        ),
      ),
    ],
  };
}

function findingCode(detector: string): string {
  return `CLEANUP_${detector.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * One evidence record per detector SIGNAL, keyed by the signal id so
 * cleanup-plan candidates and decisions can reference the same identifiers.
 */
export function signalEvidence(
  audit: AuditCollection,
  ctx: RepoContext,
  observedAt: string,
): unknown[] {
  const records = new Map<string, unknown>();
  for (const detection of audit.detections) {
    const matches = audit.protectionMatches.get(detection.id) ?? [];
    for (const signal of detection.signals) {
      if (records.has(signal.id)) {
        continue;
      }
      records.set(signal.id, {
        schema_version: "1.0",
        id: signal.id,
        kind: signal.kind === "historical" ? "declared_policy" : "ast_fact",
        status: "observed",
        source: {
          tool: `test-steward ${detection.detector} detector`,
          version: CLI_VERSION,
          path: null,
          command_fingerprint: ctx.diff.fingerprint,
          observed_at: observedAt,
        },
        findings: [
          {
            code: findingCode(detection.detector),
            summary: signal.detail,
            paths: [...detection.test_paths],
          },
        ],
        data: {
          detector: detection.detector,
          detection_id: detection.id,
          signal_kind: signal.kind,
          rationale: detection.rationale,
          protected_paths: matches.map((record) => record.path),
        },
        gate_trust: "advisory_only",
        limitations: [...detection.limitations],
      });
    }
  }
  return [...records.values()];
}

/** Protected-record and expiry-ledger evidence (declared policy). */
export function protectionEvidence(
  audit: AuditCollection,
  ctx: RepoContext,
  observedAt: string,
): unknown {
  const { protection } = audit;
  return {
    schema_version: "1.0",
    id: "ev-protection-index",
    kind: "declared_policy",
    status: protection.deletionEligible ? "observed" : "partial",
    source: {
      tool: "test-steward protection",
      version: CLI_VERSION,
      path: PROTECTED_TESTS_LEDGER,
      command_fingerprint: ctx.diff.fingerprint,
      observed_at: observedAt,
    },
    findings: [
      ...protection.records.map((record) => ({
        code: "PROTECTED_TEST",
        summary: `${record.path} is protected (${record.source}): ${record.reason}`,
        paths: [record.path],
      })),
      ...protection.expiry.map((record) => ({
        code: "EXPIRY_RECORD",
        summary: `${record.testPath} has a declared expiry record (expires_after ${record.expiresAfter}); removal condition: ${record.removalCondition}`,
        paths: [record.testPath],
      })),
    ],
    data: {
      deletion_eligible: protection.deletionEligible,
      records: protection.records,
      expiry: protection.expiry,
    },
    gate_trust: "advisory_only",
    limitations: [...protection.limitations],
  };
}

/** Slow/flake observations as evidence that can never feed deletion. */
export function observationEvidence(
  audit: AuditCollection,
  ctx: RepoContext,
  observedAt: string,
): unknown[] {
  return audit.observations.map((observation) => ({
    schema_version: "1.0",
    id: observation.id,
    kind: "flake",
    status: "observed",
    source: {
      tool: "test-steward slow-flake reporter",
      version: CLI_VERSION,
      path: null,
      command_fingerprint: ctx.diff.fingerprint,
      observed_at: observedAt,
    },
    findings: [
      {
        code: observation.kind === "slow" ? "SLOW_TEST_MARKER" : "FLAKE_MARKER",
        summary: observation.detail,
        paths: [...observation.test_paths],
      },
    ],
    data: { kind: observation.kind },
    gate_trust: "not_evidence",
    limitations: [...observation.limitations],
  }));
}

export async function run(options: CommandOptions): Promise<void> {
  const started = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const ctx = await loadRepoContext(options);
  const repositoryMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const audit = await collectAudit(ctx, todayIso());
  const elapsedMs = Number((process.hrtime.bigint() - started) / 1_000_000n);

  const evidence = [
    ...signalEvidence(audit, ctx, generatedAt),
    protectionEvidence(audit, ctx, generatedAt),
    ...observationEvidence(audit, ctx, generatedAt),
  ];
  const summary = `Audit surfaced ${audit.detections.length} cleanup candidate group(s) and ${audit.observations.length} slow/flake observation(s); ${audit.protection.records.length} protected record(s) apply. Lifecycle decisions are deferred to cleanup-plan.`;
  const decision = {
    schema_version: "1.0",
    id: "audit-summary",
    domain: "change",
    outcome: "NO_TEST_SUPPORTED",
    gate_action: "allow",
    confidence: "high",
    reason_code: "AUDIT_ADVISORY_ONLY",
    summary,
    rationale:
      "Audit is a read-only evidence view: detector signals and protected-record matches are reported without KEEP/MERGE/DELETE/MOVE decisions (ADR-006).",
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
    command: "audit",
    ctx,
    generatedAt,
    ast: audit.astMode,
    evidence,
    decisions: [decision],
    limitations: [
      "Audit is read-only and advisory: no lifecycle decisions are made and no file is modified.",
      ...ctx.shape.limitations,
      ...audit.detectorLimitations,
      ...audit.protection.limitations,
    ],
    elapsedMs,
    phases: { repository: repositoryMs, detectors: elapsedMs - repositoryMs },
  });

  const humanLines = [summary];
  for (const detection of audit.detections) {
    const matches = audit.protectionMatches.get(detection.id) ?? [];
    const protectedNote =
      matches.length > 0
        ? ` [protected: ${matches.map((record) => record.path).join(", ")}]`
        : "";
    humanLines.push(
      ` - ${detection.detector}: ${detection.test_paths.join(", ")}${protectedNote}`,
    );
  }
  for (const observation of audit.observations) {
    humanLines.push(
      ` - ${observation.kind}: ${observation.test_paths.join(", ")}`,
    );
  }
  for (const record of audit.protection.records) {
    humanLines.push(` - protected: ${record.path} (${record.reason})`);
  }
  if (options.report !== undefined) {
    humanLines.push(`Report: ${options.report}`);
  }
  if (options.json !== undefined && options.json !== "-") {
    humanLines.push(`JSON: ${options.json}`);
  }
  await finishReport(options, report, humanLines);
}
