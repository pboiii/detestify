// Read-only cleanup planner (ADR-006). Ranks detector candidates into
// KEEP / MERGE_CANDIDATE / MOVE_CANDIDATE / DELETE_CANDIDATE /
// INSUFFICIENT_EVIDENCE and emits a cleanup-plan.schema.json document.
//
// The evidence rule is applied literally. DELETE_CANDIDATE requires all of:
//   1. explicit, disjoint remove and retain paths covering the candidate;
//   2. no declared protected obligation attaches to a removal path;
//   3. at least one structural redundancy signal;
//   4. at least one INDEPENDENT behavioral or historical signal
//      (a signal also listed as structural is discounted);
//   5. a passing candidate-bound counterfactual and linked worktree result;
//   6. human approval always required.
// Static-only evidence yields MERGE_CANDIDATE or INSUFFICIENT_EVIDENCE, never
// DELETE_CANDIDATE. The planner never promotes a detector proposal to a more
// destructive action, and it never touches test files.

import {
  CONFIG_PROTECTION_SOURCE,
  EXPIRY_LEDGER,
  matchExpiry,
  matchProtection,
  PROTECTED_TESTS_LEDGER,
  type ProtectionIndex,
} from "./protection.js";
import type { EvidenceRecord } from "../core/model/index.js";

export type CleanupAction =
  | "KEEP"
  | "MERGE_CANDIDATE"
  | "DELETE_CANDIDATE"
  | "MOVE_CANDIDATE"
  | "INSUFFICIENT_EVIDENCE";

export interface ProtectedCheck {
  readonly source: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface Counterfactual {
  readonly status: "not_run" | "passed" | "failed" | "partial";
  readonly commands_ref: string | null;
  readonly candidate_id: string | null;
  readonly remove_paths: readonly string[];
  readonly retain_paths: readonly string[];
  readonly preserved_obligations: readonly string[];
  readonly limitations: readonly string[];
}

export interface WorktreeValidation {
  readonly status: "not_run" | "passed" | "failed" | "partial";
  readonly worktree_ref: string | null;
  readonly revision: string | null;
  readonly cleanup_complete: boolean;
}

export interface HumanApproval {
  readonly required: boolean;
  readonly status: "not_requested" | "pending" | "approved" | "rejected";
  readonly approver_ref: string | null;
}

export interface ObligationPreservation {
  readonly obligation_id: string;
  readonly retained_paths: readonly string[];
}

export interface CleanupCandidate {
  readonly id: string;
  readonly test_paths: readonly string[];
  readonly remove_paths: readonly string[];
  readonly retain_paths: readonly string[];
  readonly action: CleanupAction;
  readonly obligation_ids: readonly string[];
  readonly obligation_preservation: readonly ObligationPreservation[];
  readonly structural_signals: readonly string[];
  readonly independent_signals: readonly string[];
  readonly protected_checks: readonly ProtectedCheck[];
  readonly counterfactual: Counterfactual;
  readonly worktree_validation: WorktreeValidation;
  readonly human_approval: HumanApproval;
  readonly rationale: string;
  readonly limitations: readonly string[];
}

export interface CleanupPlanRepository {
  readonly root: string;
  readonly revision: string;
  readonly diff_fingerprint: string;
}

export interface CleanupPlan {
  readonly schema_version: "1.0";
  readonly plan_id: string;
  readonly generated_at: string;
  readonly repository: CleanupPlanRepository;
  readonly candidates: readonly CleanupCandidate[];
  readonly limitations: readonly string[];
}

/**
 * Detector output consumed as schema-shaped data (cleanup-plan.schema.json
 * candidate, minus the planner-owned protection and approval verdicts).
 * `proposed_action` is a ceiling: the planner only ever demotes.
 * Draft `protected_checks` contribute prose detail only; `passed` is always
 * recomputed from the protection index.
 */
export interface CandidateDraft {
  readonly id: string;
  readonly test_paths: readonly string[];
  readonly remove_paths?: readonly string[];
  readonly retain_paths?: readonly string[];
  readonly rationale: string;
  readonly proposed_action?: CleanupAction;
  readonly obligation_ids?: readonly string[];
  readonly obligation_preservation?: readonly ObligationPreservation[];
  readonly structural_signals?: readonly string[];
  readonly independent_signals?: readonly string[];
  readonly counterfactual?: Counterfactual;
  readonly worktree_validation?: WorktreeValidation;
  readonly human_approval?: HumanApproval;
  readonly protected_checks?: readonly ProtectedCheck[];
  readonly limitations?: readonly string[];
}

export interface CleanupPlanInput {
  readonly plan_id: string;
  readonly generated_at: string;
  readonly repository: CleanupPlanRepository;
  readonly candidates: readonly CandidateDraft[];
  /** Report evidence available for signal-id resolution. */
  readonly evidence?: readonly CleanupEvidenceRecord[];
  readonly protection: ProtectionIndex;
  /** config policy.allow_delete_candidates; defaults to true. */
  readonly allow_delete_candidates?: boolean;
  /** Caller-supplied plan-level limitations. */
  readonly limitations?: readonly string[];
}

export type CleanupEvidenceRecord = Pick<
  EvidenceRecord,
  "id" | "status" | "gate_trust" | "data"
>;

const DEFAULT_COUNTERFACTUAL: Counterfactual = {
  status: "not_run",
  commands_ref: null,
  candidate_id: null,
  remove_paths: [],
  retain_paths: [],
  preserved_obligations: [],
  limitations: ["Counterfactual validation was not run."],
};

const DEFAULT_WORKTREE: WorktreeValidation = {
  status: "not_run",
  worktree_ref: null,
  revision: null,
  cleanup_complete: true,
};

const ACTION_RANK: Record<CleanupAction, number> = {
  DELETE_CANDIDATE: 0,
  MERGE_CANDIDATE: 1,
  MOVE_CANDIDATE: 2,
  INSUFFICIENT_EVIDENCE: 3,
  KEEP: 4,
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function evidenceIndex(
  records: readonly CleanupEvidenceRecord[],
): ReadonlyMap<string, CleanupEvidenceRecord | null> {
  const index = new Map<string, CleanupEvidenceRecord | null>();
  for (const record of records) {
    index.set(record.id, index.has(record.id) ? null : record);
  }
  return index;
}

function isBoundEligibleEvidence(
  record: CleanupEvidenceRecord | null | undefined,
  candidateId: string,
  removePaths: readonly string[],
  retainPaths: readonly string[],
): boolean {
  if (
    record === undefined ||
    record === null ||
    record.status !== "observed" ||
    record.gate_trust !== "eligible" ||
    record.data.candidate_id !== candidateId
  ) {
    return false;
  }
  const boundRemove = record.data.remove_paths;
  const boundRetain = record.data.retain_paths;
  return (
    Array.isArray(boundRemove) &&
    boundRemove.every((value) => typeof value === "string") &&
    sameValues(boundRemove, removePaths) &&
    Array.isArray(boundRetain) &&
    boundRetain.every((value) => typeof value === "string") &&
    sameValues(boundRetain, retainPaths)
  );
}

function draftDetail(
  draft: CandidateDraft,
  source: string,
  passed: boolean,
): string | undefined {
  const supplied = (draft.protected_checks ?? []).find(
    (check) => check.source === source && check.passed === passed,
  );
  return supplied?.detail;
}

function buildCandidate(
  draft: CandidateDraft,
  protection: ProtectionIndex,
  evidence: ReadonlyMap<string, CleanupEvidenceRecord | null>,
  allowDelete: boolean,
  revision: string,
): CleanupCandidate {
  if (draft.id.length === 0 || draft.test_paths.length === 0) {
    throw new Error(`Cleanup candidate draft is missing id or test_paths`);
  }
  const testPaths = unique(draft.test_paths);
  const removePaths = unique(draft.remove_paths ?? []);
  const retainPaths = unique(draft.retain_paths ?? []);
  const directionalPaths = [...removePaths, ...retainPaths];
  if (
    directionalPaths.some((testPath) => !testPaths.includes(testPath)) ||
    removePaths.some((testPath) => retainPaths.includes(testPath))
  ) {
    throw new Error(
      `Cleanup candidate ${draft.id} has invalid remove_paths or retain_paths`,
    );
  }
  const obligationIds = unique(draft.obligation_ids ?? []);
  const obligationPreservation = (draft.obligation_preservation ?? []).map(
    (mapping) => ({
      obligation_id: mapping.obligation_id,
      retained_paths: unique(mapping.retained_paths),
    }),
  );
  const structural = unique(draft.structural_signals ?? []);
  const declaredIndependent = unique(draft.independent_signals ?? []);
  const independent = declaredIndependent.filter(
    (signal) => !structural.includes(signal),
  );
  const discounted = declaredIndependent.filter((signal) =>
    structural.includes(signal),
  );

  const ledgerOk = protection.deletionEligible;
  const counterfactual = draft.counterfactual ?? DEFAULT_COUNTERFACTUAL;
  const worktreeValidation = draft.worktree_validation ?? DEFAULT_WORKTREE;
  const directionComplete =
    removePaths.length > 0 &&
    retainPaths.length > 0 &&
    directionalPaths.length === testPaths.length &&
    testPaths.every((testPath) => directionalPaths.includes(testPath));
  const preservationComplete =
    obligationIds.length > 0 &&
    obligationPreservation.length === obligationIds.length &&
    obligationIds.every((obligationId) => {
      const mappings = obligationPreservation.filter(
        (mapping) => mapping.obligation_id === obligationId,
      );
      return (
        mappings.length === 1 &&
        mappings[0]!.retained_paths.length > 0 &&
        mappings[0]!.retained_paths.every((testPath) =>
          retainPaths.includes(testPath),
        )
      );
    });
  const counterfactualBound =
    counterfactual.status === "passed" &&
    counterfactual.commands_ref !== null &&
    counterfactual.candidate_id === draft.id &&
    sameValues(counterfactual.remove_paths, removePaths) &&
    sameValues(counterfactual.retain_paths, retainPaths) &&
    obligationIds.length > 0 &&
    obligationIds.every((obligationId) =>
      counterfactual.preserved_obligations.includes(obligationId),
    );
  const worktreePassed =
    worktreeValidation.status === "passed" &&
    worktreeValidation.worktree_ref === counterfactual.commands_ref &&
    worktreeValidation.revision === revision &&
    worktreeValidation.cleanup_complete;
  const signalIds = [...structural, ...independent];
  const evidenceResolved =
    signalIds.length > 0 &&
    signalIds.every((signalId) =>
      isBoundEligibleEvidence(
        evidence.get(signalId),
        draft.id,
        removePaths,
        retainPaths,
      ),
    );
  const removalPaths = removePaths.length > 0 ? removePaths : testPaths;
  const removalMatches = matchProtection(
    protection,
    removalPaths,
    obligationIds,
  );

  // Evidence rule, literally.
  const deleteEligible =
    ledgerOk &&
    removalMatches.length === 0 &&
    directionComplete &&
    preservationComplete &&
    structural.length >= 1 &&
    independent.length >= 1 &&
    evidenceResolved &&
    counterfactualBound &&
    worktreePassed &&
    allowDelete;

  const derived: CleanupAction = deleteEligible
    ? "DELETE_CANDIDATE"
    : structural.length >= 1 && testPaths.length >= 2
      ? "MERGE_CANDIDATE"
      : "INSUFFICIENT_EVIDENCE";

  // The proposal is a ceiling: never promote beyond it.
  const proposal = draft.proposed_action;
  let action: CleanupAction;
  if (proposal === "KEEP") {
    action = "KEEP";
  } else if (proposal === "MOVE_CANDIDATE") {
    // Placement advice deletes nothing; the evidence rule does not gate it.
    action = "MOVE_CANDIDATE";
  } else if (proposal === "MERGE_CANDIDATE") {
    action = derived === "DELETE_CANDIDATE" ? "MERGE_CANDIDATE" : derived;
  } else {
    // DELETE_CANDIDATE proposal or no proposal: fully evidence-derived.
    action = derived;
  }

  const attemptedAction = action;
  const protectedPaths =
    attemptedAction === "MERGE_CANDIDATE" ? testPaths : removalPaths;
  const matches = matchProtection(protection, protectedPaths, obligationIds);
  const protectionBlocked = !ledgerOk || matches.length > 0;
  if (
    protectionBlocked &&
    (attemptedAction === "DELETE_CANDIDATE" ||
      attemptedAction === "MERGE_CANDIDATE" ||
      attemptedAction === "MOVE_CANDIDATE")
  ) {
    action = "KEEP";
  }
  const ledgerMatches = matches.filter(
    (record) => record.source === PROTECTED_TESTS_LEDGER,
  );
  const configMatches = matches.filter(
    (record) => record.source === CONFIG_PROTECTION_SOURCE,
  );

  const limitations = [...(draft.limitations ?? [])];
  let rationale = draft.rationale;
  if (discounted.length > 0) {
    limitations.push(
      `Discounted as not independent (also structural): ${discounted.join(", ")}.`,
    );
  }
  if (
    directionComplete &&
    structural.length > 0 &&
    independent.length > 0 &&
    !evidenceResolved
  ) {
    limitations.push(
      "Deletion eligibility withheld: one or more signal IDs do not resolve to observed, eligible evidence bound to this removal hypothesis.",
    );
  }
  if (proposal === "DELETE_CANDIDATE" && action !== "DELETE_CANDIDATE") {
    const reason =
      matches.length > 0
        ? "a protected record retains the test"
        : !ledgerOk
          ? "the protection ledger is unavailable (fail closed)"
          : !directionComplete
            ? "the removal hypothesis does not identify a complete remove/retain partition"
            : !preservationComplete
              ? "the removal hypothesis does not map every obligation to a retained owner"
              : structural.length === 0
                ? "no structural redundancy signal exists"
                : independent.length === 0
                  ? "no independent behavioral or historical signal exists"
                  : !evidenceResolved
                    ? "signal evidence is unresolved, ineligible, or bound to another removal hypothesis"
                    : !counterfactualBound
                      ? "no passing counterfactual is bound to this candidate and removal hypothesis"
                      : !worktreePassed
                        ? "no passing worktree validation is linked to the counterfactual on this revision"
                        : "policy disallows DELETE_CANDIDATE";
    limitations.push(`Demoted from DELETE_CANDIDATE: ${reason}.`);
    rationale = `${rationale} Demoted to ${action}: ${reason}.`;
  }
  if (protectionBlocked && action === "KEEP" && attemptedAction !== "KEEP") {
    const reason =
      matches.length > 0
        ? `protected record retains this test (${matches[0]!.reason})`
        : "the protection ledger is unavailable (fail closed)";
    limitations.push(
      `Protection prevents ${attemptedAction}; retained as KEEP: ${reason}.`,
    );
    rationale = `${rationale} ${reason}.`;
  }

  const checks: ProtectedCheck[] = [];
  const ledgerPassed = ledgerOk && ledgerMatches.length === 0;
  checks.push({
    source: PROTECTED_TESTS_LEDGER,
    passed: ledgerPassed,
    detail: !ledgerOk
      ? (protection.limitations[0] ??
        "Protection ledger unavailable; deletion eligibility withheld (fail closed).")
      : ledgerMatches.length > 0
        ? `Protected record ${ledgerMatches[0]!.path} blocks removal: ${ledgerMatches[0]!.reason}.`
        : (draftDetail(draft, PROTECTED_TESTS_LEDGER, true) ??
          `No protected record references removal paths ${protectedPaths.join(", ")}.`),
  });
  const hasConfigRecords = protection.records.some(
    (record) => record.source === CONFIG_PROTECTION_SOURCE,
  );
  if (hasConfigRecords || configMatches.length > 0) {
    checks.push({
      source: CONFIG_PROTECTION_SOURCE,
      passed: configMatches.length === 0,
      detail:
        configMatches.length > 0
          ? `Config protected_tests record ${configMatches[0]!.path} blocks removal: ${configMatches[0]!.reason}.`
          : (draftDetail(draft, CONFIG_PROTECTION_SOURCE, true) ??
            `No config protected_tests record references removal paths ${protectedPaths.join(", ")}.`),
    });
  }
  const expiryMatches = matchExpiry(protection, protectedPaths);
  if (expiryMatches.length > 0) {
    const record = expiryMatches[0]!;
    checks.push({
      source: EXPIRY_LEDGER,
      passed: true,
      detail: `Expiry record for ${record.testPath} (expires_after ${record.expiresAfter}); removal condition requires human evaluation: ${record.removalCondition}`,
    });
    limitations.push(
      `Expiry removal condition for ${record.testPath} requires human evaluation.`,
    );
  }

  const humanApproval: HumanApproval =
    action === "DELETE_CANDIDATE"
      ? { required: true, status: "pending", approver_ref: null }
      : {
          required: true,
          status: draft.human_approval?.status ?? "not_requested",
          approver_ref: draft.human_approval?.approver_ref ?? null,
        };

  if (action === "DELETE_CANDIDATE" && limitations.length === 0) {
    limitations.push(
      "This is a candidate only; alpha does not apply deletion.",
    );
  }

  return {
    id: draft.id,
    test_paths: testPaths,
    remove_paths: removePaths,
    retain_paths: retainPaths,
    action,
    obligation_ids: obligationIds,
    obligation_preservation: obligationPreservation,
    structural_signals: structural,
    independent_signals: independent,
    protected_checks: checks,
    counterfactual: {
      ...counterfactual,
      preserved_obligations: unique(counterfactual.preserved_obligations),
    },
    worktree_validation: worktreeValidation,
    human_approval: humanApproval,
    rationale,
    limitations,
  };
}

function compareCandidates(a: CleanupCandidate, b: CleanupCandidate): number {
  const byAction = ACTION_RANK[a.action] - ACTION_RANK[b.action];
  if (byAction !== 0) return byAction;
  const byIndependent =
    b.independent_signals.length - a.independent_signals.length;
  if (byIndependent !== 0) return byIndependent;
  const byStructural =
    b.structural_signals.length - a.structural_signals.length;
  if (byStructural !== 0) return byStructural;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the ranked, read-only cleanup plan. Pure: reads nothing and writes
 * nothing; the protection index is loaded separately via `loadProtectionIndex`.
 */
export function buildCleanupPlan(input: CleanupPlanInput): CleanupPlan {
  const allowDelete = input.allow_delete_candidates ?? true;
  const evidence = evidenceIndex(input.evidence ?? []);
  const candidates = input.candidates
    .map((draft) =>
      buildCandidate(
        draft,
        input.protection,
        evidence,
        allowDelete,
        input.repository.revision,
      ),
    )
    .sort(compareCandidates);
  return {
    schema_version: "1.0",
    plan_id: input.plan_id,
    generated_at: input.generated_at,
    repository: input.repository,
    candidates,
    limitations: unique([
      ...(input.limitations ?? []),
      ...input.protection.limitations,
    ]),
  };
}
