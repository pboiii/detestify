// Default HookDecider: the fast verify-change core path for Stop-family
// events. It checks the current diff fingerprint against the latest
// verification receipt and otherwise evaluates the plan-level policy verdict
// (materiality + ADR-004 gates). It NEVER executes repository tests from a
// hook: nothing in the configuration schema can enable hook-time execution,
// and a repository-discovered config can never grant execution trust anyway.
// Any internal failure resolves to a non-blocking decision (fail open).

import {
  allowedGateAction,
  assignTier,
  isGateEligible,
} from "../core/materiality/index.js";
import type { MaterialityAxes } from "../core/model/index.js";
import { snapshotRepository } from "../repository/git.js";
import { fingerprintDiff } from "../repository/fingerprint.js";
import { isTestFilePath } from "../analysis/tests.js";
import {
  evaluatePlanStage,
  loadTrust,
  stripOwnState,
} from "../evidence/verdict.js";
import { latestReceipt, stateDirectory } from "../evidence/receipts.js";
import {
  buildDecision,
  type HookEvent,
  type NormalizedDecision,
  type NormalizedInvocation,
} from "./normalized.js";
import type { HookDecider } from "./entry.js";

const STOP_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete",
]);

const GIT_BUDGET = { timeoutMs: 4_000 } as const;

const NO_EXECUTION_LIMITATION =
  "No test was executed from the hook; run test-steward verify-change for an executable receipt.";

const FAILING_RECEIPT_AXES: MaterialityAxes = {
  consequence: "degraded",
  exposure: "user_facing",
  change_mechanism: "pure_behavior",
  evidence_gap: "material",
  confidence: "observed",
};

function allow(
  reasonCode: string,
  summary: string,
  limitations: readonly string[] = [],
): Promise<NormalizedDecision> {
  return buildDecision({
    action: "allow",
    confidence: "high",
    reason_code: reasonCode,
    summary,
    remediation: null,
    report_path: null,
    limitations,
    loop_guard: { next_attempt: 0 },
  });
}

async function decideStop(
  invocation: NormalizedInvocation,
): Promise<NormalizedDecision> {
  const repoRoot = invocation.repo_root;
  if (repoRoot === null) {
    return allow(
      "NO_REPOSITORY",
      "No Git repository is associated with this session; nothing to verify.",
    );
  }

  const trust = await loadTrust(repoRoot);
  const snapshot = stripOwnState(
    await snapshotRepository(repoRoot, undefined, GIT_BUDGET),
  );
  if (snapshot.changedFiles.length === 0) {
    return allow("NO_CHANGES", "The diff contains no changed paths.");
  }
  const fingerprint = (await fingerprintDiff(snapshot)).fingerprint;

  // Fingerprint check: a receipt for exactly this tree settles the verdict.
  const stateDir = stateDirectory(repoRoot);
  const found = await latestReceipt(stateDir);
  if (
    found !== null &&
    found.receipt.diff_fingerprint_end === fingerprint &&
    !found.receipt.stale
  ) {
    if (found.receipt.passed) {
      return buildDecision({
        action: "allow",
        confidence: "high",
        reason_code: "VERIFIED_WITH_RECEIPT",
        summary:
          "A passing verification receipt matches the current diff fingerprint.",
        remediation: null,
        report_path: found.path,
        limitations: [],
        loop_guard: { next_attempt: 0 },
      });
    }
    const failed = found.receipt.results?.failed ?? null;
    const action = allowedGateAction({
      tier: assignTier({
        axes: FAILING_RECEIPT_AXES,
        distinctChangedObligation: true,
      }),
      provenance: "observed",
      mode: trust.mode,
      gateEligible: isGateEligible({
        provenance: "observed",
        executableGapDemonstrated: true,
        ruleId: "TST-003",
        elevatedRuleIds: trust.elevatedRuleIds,
      }),
    });
    return buildDecision({
      action:
        action === "request_remediation" ? "request_remediation" : "advise",
      confidence: "high",
      reason_code: "VERIFICATION_FAILED",
      summary: `The verification receipt for the current diff records ${failed ?? "unparsed"} failing focused test${failed === 1 ? "" : "s"}.`,
      remediation:
        action === "request_remediation"
          ? "Fix the failing focused tests recorded in the verification receipt, then re-run test-steward verify-change to produce a passing receipt."
          : null,
      report_path: found.path,
      limitations: [],
      loop_guard: { next_attempt: action === "request_remediation" ? 1 : 0 },
    });
  }

  // No receipt for this tree: plan-level policy verdict, no execution.
  const changedTestFiles = snapshot.changedFiles
    .filter((file) => file.status !== "deleted" && isTestFilePath(file.path))
    .map((file) => file.path)
    .sort();
  const plan = evaluatePlanStage({
    snapshot,
    trust,
    observedAt: new Date().toISOString(),
    changedTestFiles,
    idPrefix: "hook-plan",
  });
  const strongest = plan.strongestDecision;

  if (strongest === null || plan.strongestAction === "allow") {
    return allow(
      "NO_MATERIAL_OBLIGATION",
      "The current diff exposes no obligation requiring new evidence.",
      [NO_EXECUTION_LIMITATION],
    );
  }
  if (plan.strongestAction === "request_remediation") {
    return buildDecision({
      action: "request_remediation",
      confidence: strongest.confidence,
      reason_code: strongest.reason_code,
      summary: strongest.summary,
      remediation: `${
        strongest.remediation ??
        "Add the required evidence for the changed obligation."
      } Then run test-steward verify-change to record a passing receipt.`,
      report_path: null,
      limitations: [NO_EXECUTION_LIMITATION, ...strongest.limitations],
      loop_guard: { next_attempt: 1 },
    });
  }
  return buildDecision({
    action: "advise",
    confidence: strongest.confidence,
    reason_code: strongest.reason_code,
    summary: strongest.summary,
    remediation: null,
    report_path: null,
    limitations: [NO_EXECUTION_LIMITATION, ...strongest.limitations],
    loop_guard: { next_attempt: 0 },
  });
}

/** Core-connected decider wired as the default in the hook entry. */
export const coreHookDecider: HookDecider = async (invocation) => {
  if (!STOP_EVENTS.has(invocation.event)) {
    return allow(
      "EVENT_NOT_GATED",
      "This lifecycle event is not gated by Test Steward.",
    );
  }
  try {
    return await decideStop(invocation);
  } catch (error) {
    // Fail open: a hook parse/Git/state failure never blocks the host.
    return allow(
      "CORE_UNAVAILABLE",
      "Test Steward could not evaluate this repository; no verification claim is made.",
      [
        `Fast-path evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    );
  }
};
