// `verify-change` (M5): re-evaluate a completed change with trusted selected
// verification. Pipeline: current diff evidence -> plan-level obligations ->
// trusted focused run (or report-only when execution is not trusted) ->
// verification receipt -> remediation eligibility through the core
// materiality/gate tables -> schema-valid report.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { CommanderError } from "commander";
import { EXIT_CODES, type ExitCode } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";
import { writeJsonReport } from "../output.js";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import {
  allowedGateAction,
  assignTier,
  isGateEligible,
} from "../../core/materiality/index.js";
import type {
  Decision,
  EvidenceRecord,
  GateAction,
  MaterialityAxes,
} from "../../core/model/index.js";
import {
  GitError,
  snapshotRepository,
  type RepositorySnapshot,
} from "../../repository/git.js";
import {
  buildGitDiffEvidence,
  fingerprintDiff,
} from "../../repository/fingerprint.js";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
} from "../../repository/discovery.js";
import { analyzeTests, isTestFilePath } from "../../analysis/tests.js";
import {
  buildReportChange,
  evaluatePlanStage,
  loadTrust,
  stripOwnState,
  type LoadedTrust,
  type PlanStage,
} from "../../evidence/verdict.js";
import { negotiateOptionalEvidence } from "../../evidence/capabilities.js";
import { runnerEnvironment } from "../../evidence/runners/process.js";
import {
  runVitest,
  RunnerUnavailableError,
  type RunnerInvocation,
} from "../../evidence/runners/vitest.js";
import { runJest } from "../../evidence/runners/jest.js";
import {
  buildReceipt,
  receiptEvidence,
  stateDirectory,
  writeReceipt,
  type VerificationReceipt,
} from "../../evidence/receipts.js";

const RUN_TIMEOUT_MS = 120_000;
const MAX_SELECTED_TEST_FILES = 200;
const JS_TS_SOURCE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Throw the frozen CLI dispatch's exit-code pass-through error. */
function exitWith(code: ExitCode, message: string): never {
  throw new CommanderError(code, "test-steward.notImplemented", message);
}

interface Verification {
  readonly mode: "trusted-run" | "report-only" | "no-tests";
  readonly receipt: VerificationReceipt | null;
  readonly receiptPath: string | null;
  readonly usedAst: boolean;
  readonly limitations: readonly string[];
  /** Deferred non-zero exit after the report is written, or null. */
  readonly pendingExit: { code: ExitCode; message: string } | null;
}

/** Select affected tests: changed tests plus tests importing changed sources. */
async function selectAffectedTests(
  root: string,
  testFiles: readonly string[],
  sourceFiles: readonly string[],
  snapshot: RepositorySnapshot,
  changedTestFiles: readonly string[],
): Promise<{
  selection: string[];
  usedAst: boolean;
  limitations: string[];
}> {
  const limitations: string[] = [];
  const changedSources = new Set(
    snapshot.changedFiles
      .filter(
        (file) =>
          file.status !== "deleted" &&
          JS_TS_SOURCE_PATTERN.test(file.path) &&
          !isTestFilePath(file.path),
      )
      .map((file) => file.path),
  );

  const selected = new Set(changedTestFiles);
  let usedAst = false;
  if (changedSources.size > 0 && testFiles.length > 0) {
    try {
      const inventory = await analyzeTests({
        repoRoot: root,
        files: [...testFiles, ...sourceFiles],
      });
      usedAst = true;
      for (const testFile of inventory.testFiles) {
        if (
          testFile.imports.some(
            (edge) => edge.to !== null && changedSources.has(edge.to),
          )
        ) {
          selected.add(testFile.file);
        }
      }
    } catch (error) {
      limitations.push(
        `Affected-test analysis failed (${error instanceof Error ? error.message : String(error)}); falling back to the discovered suite.`,
      );
      for (const file of testFiles) {
        selected.add(file);
      }
    }
  }

  if (selected.size === 0 && changedSources.size > 0) {
    // No import mapping reached the changed sources: run the discovered
    // suite rather than inferring a pass from an empty run.
    limitations.push(
      "No focused test mapped to the changed sources; the discovered suite was selected instead.",
    );
    for (const file of testFiles) {
      selected.add(file);
    }
  }

  let selection = [...selected].sort();
  if (selection.length > MAX_SELECTED_TEST_FILES) {
    limitations.push(
      `Selection was capped at ${MAX_SELECTED_TEST_FILES} of ${selection.length} test files.`,
    );
    selection = selection.slice(0, MAX_SELECTED_TEST_FILES);
  }
  return { selection, usedAst, limitations };
}

async function runVerification(input: {
  readonly root: string;
  readonly base: string | undefined;
  readonly trust: LoadedTrust;
  readonly runner: "vitest" | "jest" | "unknown" | "none";
  readonly testFiles: readonly string[];
  readonly sourceFiles: readonly string[];
  readonly snapshot: RepositorySnapshot;
  readonly startFingerprint: string;
  readonly changedTestFiles: readonly string[];
  readonly stateDir: string;
}): Promise<Verification> {
  const limitations: string[] = [];

  if (!input.trust.runRepositoryCommands) {
    return {
      mode: "report-only",
      receipt: null,
      receiptPath: null,
      usedAst: false,
      limitations: [
        "Repository command execution is not trusted; verify-change ran in report-only mode and executed no tests. Grant trust with an explicitly passed --config whose trusted_operations.run_repository_commands is true.",
      ],
      pendingExit: null,
    };
  }

  if (input.runner !== "vitest" && input.runner !== "jest") {
    const detail =
      input.runner === "none"
        ? "No supported test runner (Vitest or Jest) was detected."
        : "Both Vitest and Jest markers are present; the runner selection is ambiguous.";
    return {
      mode: "no-tests",
      receipt: null,
      receiptPath: null,
      usedAst: false,
      limitations: [detail],
      pendingExit: {
        code: EXIT_CODES.UNSUPPORTED_REPOSITORY,
        message: `verify-change cannot execute verification: ${detail}`,
      },
    };
  }

  const {
    selection,
    usedAst,
    limitations: selectionLimitations,
  } = await selectAffectedTests(
    input.root,
    input.testFiles,
    input.sourceFiles,
    input.snapshot,
    input.changedTestFiles,
  );
  limitations.push(...selectionLimitations);

  if (selection.length === 0) {
    return {
      mode: "no-tests",
      receipt: null,
      receiptPath: null,
      usedAst,
      limitations: [
        ...limitations,
        "No test files were discovered; nothing was executed.",
      ],
      pendingExit: null,
    };
  }

  let invocation: RunnerInvocation;
  try {
    const run = input.runner === "vitest" ? runVitest : runJest;
    invocation = await run({
      repoRoot: input.root,
      testFiles: selection,
      timeoutMs: RUN_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof RunnerUnavailableError) {
      return {
        mode: "no-tests",
        receipt: null,
        receiptPath: null,
        usedAst,
        limitations: [...limitations, error.message],
        pendingExit: {
          code: EXIT_CODES.EXTERNAL_TOOL_UNAVAILABLE,
          message: error.message,
        },
      };
    }
    throw error;
  }

  if (invocation.outcome.spawnError !== null) {
    return {
      mode: "no-tests",
      receipt: null,
      receiptPath: null,
      usedAst,
      limitations: [...limitations, invocation.outcome.spawnError],
      pendingExit: {
        code: EXIT_CODES.EXTERNAL_TOOL_UNAVAILABLE,
        message: invocation.outcome.spawnError,
      },
    };
  }

  // End fingerprint: re-snapshot so any mutation during the run is caught.
  const endSnapshot = stripOwnState(
    await snapshotRepository(input.root, input.base),
  );
  const endFingerprint = (await fingerprintDiff(endSnapshot)).fingerprint;

  const receipt = buildReceipt({
    invocation,
    repoRoot: input.root,
    baseRevision: input.snapshot.baseRevision,
    headRevision: input.snapshot.headRevision,
    timeoutMs: RUN_TIMEOUT_MS,
    envKeys: Object.keys(runnerEnvironment()).sort(),
    diffFingerprintStart: input.startFingerprint,
    diffFingerprintEnd: endFingerprint,
  });
  const receiptPath = await writeReceipt(input.stateDir, receipt);

  let pendingExit: Verification["pendingExit"] = null;
  if (invocation.outcome.timedOut) {
    pendingExit = {
      code: EXIT_CODES.TIMEOUT,
      message: `Verification exceeded ${RUN_TIMEOUT_MS} ms; the runner process group was killed.`,
    };
  } else if (invocation.results === null) {
    pendingExit = {
      code: EXIT_CODES.EXTERNAL_TOOL_FAILED,
      message: `${invocation.runner} ran but returned no parseable structured results.`,
    };
  }

  return {
    mode: "trusted-run",
    receipt,
    receiptPath,
    usedAst,
    limitations: [...limitations, ...receipt.limitations],
    pendingExit,
  };
}

const FAILING_RUN_AXES: MaterialityAxes = {
  consequence: "degraded",
  exposure: "user_facing",
  change_mechanism: "pure_behavior",
  evidence_gap: "material",
  confidence: "observed",
};

/** Build the top-level verification decision from the current evidence. */
function verificationDecision(input: {
  readonly verification: Verification;
  readonly plan: PlanStage;
  readonly trust: LoadedTrust;
  readonly evidenceIds: readonly string[];
}): Decision {
  const { verification, plan, trust } = input;
  const receipt = verification.receipt;
  const base = {
    schema_version: "1.0" as const,
    id: "verify-change-verdict",
    domain: "change" as const,
    obligation_candidate_ids: plan.obligations.map(
      (obligation) => obligation.id,
    ),
    evidence_ids: [...input.evidenceIds],
    target: {
      scope: null,
      purpose: null,
      technique: null,
      cadence: null,
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
  };

  if (receipt !== null && !receipt.stale && receipt.results !== null) {
    if (receipt.passed) {
      return {
        ...base,
        outcome: "NO_TEST_SUPPORTED",
        gate_action: "allow",
        confidence: "high",
        reason_code: "VERIFIED_WITH_RECEIPT",
        summary: `Focused verification passed: ${receipt.results.passed}/${receipt.results.total} selected tests passed on the current diff.`,
        rationale:
          "The trusted focused run completed on the analyzed tree, its fingerprint did not change, and every selected test passed.",
        remediation: null,
        limitations: [...verification.limitations],
      };
    }
    // Failing run: an observed, executable, material gap on the change.
    const tier = assignTier({
      axes: FAILING_RUN_AXES,
      distinctChangedObligation: true,
    });
    const gateEligible = isGateEligible({
      provenance: "observed",
      executableGapDemonstrated: true,
      ruleId: "TST-003",
      elevatedRuleIds: trust.elevatedRuleIds,
    });
    const action = allowedGateAction({
      tier,
      provenance: "observed",
      mode: trust.mode,
      gateEligible,
    });
    const failed = receipt.results.failed;
    const firstFailure = receipt.results.failures[0];
    return {
      ...base,
      outcome: "EXISTING_TEST_UPDATE_CANDIDATE",
      gate_action: action,
      confidence: "high",
      reason_code: "VERIFICATION_FAILED",
      summary: `Focused verification failed: ${failed} of ${receipt.results.total} selected tests failed on the current diff.`,
      rationale: `A trusted ${receipt.runner} run on the analyzed tree observed ${failed} failing test${failed === 1 ? "" : "s"}${firstFailure === undefined ? "" : `, first: ${firstFailure.name}`}.`,
      remediation:
        action === "request_remediation"
          ? `Fix the change (or the test contract) so the ${failed} failing focused test${failed === 1 ? "" : "s"} pass${failed === 1 ? "es" : ""}, then re-run test-steward verify-change to produce a passing receipt.`.slice(
              0,
              1500,
            )
          : null,
      limitations: [...verification.limitations],
    };
  }

  if (receipt !== null && receipt.stale) {
    return {
      ...base,
      outcome: "INSUFFICIENT_EVIDENCE",
      gate_action: "advise",
      confidence: "low",
      reason_code: "STALE_FINGERPRINT",
      summary:
        "The worktree changed while verification ran; the receipt is stale and no verification claim is made.",
      rationale:
        "The diff fingerprint at the end of the run differed from the fingerprint at the start (TM-015).",
      remediation: null,
      limitations: [...verification.limitations],
    };
  }

  if (receipt !== null) {
    // Ran but unparseable/timed out.
    return {
      ...base,
      outcome: "INSUFFICIENT_EVIDENCE",
      gate_action: "advise",
      confidence: "low",
      reason_code: receipt.timed_out
        ? "VERIFICATION_TIMEOUT"
        : "VERIFICATION_UNPARSEABLE",
      summary: receipt.timed_out
        ? "Verification timed out; partial evidence is not reported as a result."
        : "The runner returned no parseable results; pass/fail state is unknown.",
      rationale:
        "A trusted run was attempted but produced no usable structured results.",
      remediation: null,
      limitations: [...verification.limitations],
    };
  }

  // Report-only / nothing executed: the plan-stage verdict carries the
  // remediation eligibility (materiality + ADR-004 gates).
  const strongest = plan.strongestDecision;
  const action: GateAction =
    strongest === null ? "allow" : plan.strongestAction;
  const reasonCode =
    verification.mode === "report-only"
      ? "REPORT_ONLY_UNTRUSTED"
      : "NO_EXECUTABLE_VERIFICATION";
  if (action === "request_remediation" && strongest !== null) {
    return {
      ...base,
      outcome: strongest.outcome,
      gate_action: "request_remediation",
      confidence: strongest.confidence,
      reason_code: strongest.reason_code,
      summary: strongest.summary,
      rationale: strongest.rationale,
      remediation:
        strongest.remediation ??
        "Add the required evidence, then re-run test-steward verify-change.",
      limitations: [...verification.limitations],
    };
  }
  return {
    ...base,
    outcome: strongest === null ? "NO_TEST_SUPPORTED" : strongest.outcome,
    gate_action: action === "allow" ? "allow" : "advise",
    confidence: strongest?.confidence ?? "high",
    reason_code: reasonCode,
    summary:
      verification.mode === "report-only"
        ? "verify-change ran in report-only mode: no repository command is trusted, so no test was executed."
        : "No executable verification was performed; the plan-level verdict is advisory.",
    rationale:
      strongest?.rationale ??
      "The diff exposes no obligation that requires new evidence.",
    remediation: null,
    limitations: [...verification.limitations],
  };
}

export async function run(options: CommandOptions): Promise<void> {
  const startedAt = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const requestedRepo = options.repo ?? process.cwd();

  let rawSnapshot: RepositorySnapshot;
  try {
    rawSnapshot = await snapshotRepository(requestedRepo, options.base);
  } catch (error) {
    if (error instanceof GitError) {
      if (
        error.code === "NOT_A_REPOSITORY" ||
        error.code === "GIT_UNAVAILABLE"
      ) {
        exitWith(EXIT_CODES.REPOSITORY_NOT_FOUND, error.message);
      }
      if (error.code === "GIT_TIMEOUT") {
        exitWith(EXIT_CODES.TIMEOUT, error.message);
      }
      if (error.message.startsWith("Base revision not found")) {
        exitWith(EXIT_CODES.USAGE_ERROR, error.message);
      }
    }
    throw error;
  }

  const snapshot = stripOwnState(rawSnapshot);
  const root = snapshot.root;
  const stateDir = stateDirectory(root);

  // ConfigInvalidError messages start with "Configuration" and map to exit 3.
  const trust = await loadTrust(root, options.config);

  const diff = await fingerprintDiff(snapshot);
  const gitEvidence = buildGitDiffEvidence(snapshot, diff, {
    id: "verify-change-git-diff",
    observedAt: generatedAt,
  });

  const files = await listRepositoryFiles(root);
  const shape = await discoverRepositoryShape(root, files);

  const changedTestFiles = snapshot.changedFiles
    .filter((file) => file.status !== "deleted" && isTestFilePath(file.path))
    .map((file) => file.path)
    .sort();

  const plan = evaluatePlanStage({
    snapshot,
    trust,
    observedAt: generatedAt,
    changedTestFiles,
    idPrefix: "verify-change-plan",
  });

  const optional = negotiateOptionalEvidence({
    coverageRequested: false,
    mutationRequested: trust.mutationRequested,
    observedAt: generatedAt,
    idPrefix: "verify-change-capability",
  });

  const verification = await runVerification({
    root,
    base: options.base,
    trust,
    runner: shape.runner,
    testFiles: shape.testFiles,
    sourceFiles: shape.sourceFiles,
    snapshot,
    startFingerprint: diff.fingerprint,
    changedTestFiles,
    stateDir,
  });

  const evidence: EvidenceRecord[] = [
    gitEvidence as EvidenceRecord,
    ...plan.evidence,
    ...optional.evidence,
  ];
  if (verification.receipt !== null) {
    evidence.push(
      receiptEvidence(verification.receipt, {
        id: "verify-change-receipt",
        observedAt: generatedAt,
        receiptPath:
          verification.receiptPath === null
            ? null
            : path.relative(root, verification.receiptPath),
      }),
    );
  }

  const topDecision = verificationDecision({
    verification,
    plan,
    trust,
    evidenceIds: evidence.map((record) => record.id),
  });

  const limitations = [
    ...new Set([
      ...trust.limitations,
      ...shape.limitations,
      ...diff.limitations,
      ...plan.limitations,
      ...optional.limitations,
      ...verification.limitations,
    ]),
  ];

  const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  const reportId = randomUUID();
  const report = {
    schema_version: "1.0",
    report_id: reportId,
    command: "verify-change",
    generated_at: generatedAt,
    repository: {
      root,
      base_revision: snapshot.baseRevision,
      head_revision: snapshot.headRevision,
      diff_fingerprint: diff.fingerprint,
      dirty: snapshot.dirty,
    },
    change: buildReportChange(snapshot, plan),
    capabilities: {
      runner: shape.runner,
      ast: verification.usedAst ? "syntactic_only" : "unavailable",
      coverage: optional.coverage,
      mutation: optional.mutation,
      repository_commands_trusted: trust.runRepositoryCommands,
      network_used: false,
    },
    obligation_candidates: plan.obligations,
    evidence,
    decisions: [topDecision, ...plan.decisions],
    limitations,
    timing: {
      elapsed_ms: elapsedMs,
      phases: { verify_change: elapsedMs },
    },
  };

  const validate = await getValidator("report.schema.json");
  if (!validate(report)) {
    exitWith(
      EXIT_CODES.SCHEMA_CONTRACT_ERROR,
      `verify-change report failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }

  const reportPath =
    options.report ?? path.join(stateDir, "reports", `${reportId}.json`);
  await writeJsonReport(reportPath, report);
  if (options.json !== undefined && options.json !== "-") {
    await writeJsonReport(options.json, report);
  }

  const human = [
    `Decision: ${topDecision.outcome} (${topDecision.gate_action})`,
    `Why: ${topDecision.summary}`,
    ...(verification.receiptPath !== null
      ? [`Receipt: ${verification.receiptPath}`]
      : []),
    `Report: ${reportPath}`,
  ].join("\n");
  if (options.json === "-") {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.stderr.write(`${human}\n`);
  } else {
    process.stdout.write(`${human}\n`);
  }

  if (verification.pendingExit !== null) {
    exitWith(verification.pendingExit.code, verification.pendingExit.message);
  }
  if (topDecision.gate_action === "request_remediation") {
    exitWith(
      EXIT_CODES.REMEDIATION_REQUIRED,
      topDecision.remediation ??
        "A configured eligible gate requires one concrete remediation.",
    );
  }
}
