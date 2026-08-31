// Policy engine (M3 core): turn a rule determination into an obligation
// candidate with explicit provenance, a schema-shaped evidence record with
// limitations always present, and one of the five change-plan outcomes —
// applying the ordinal materiality tables and the ADR-004 gate rules
// literally. Semantic and non-automatable rules degrade to advisory
// INSUFFICIENT_EVIDENCE unless declared or observed provenance backs the
// determination; they never guess.

import {
  allowedGateAction,
  assignTier,
  isGateEligible,
} from "../materiality/index.js";
import type {
  Decision,
  DecisionConfidence,
  DecisionTarget,
  EvidenceGap,
  EvidenceKind,
  EvidenceRecord,
  MaterialityAxes,
  MaterialityConfidence,
  ObligationCandidate,
  PolicyMode,
  Provenance,
} from "../model/index.js";
import {
  POLICY_RULES_BY_ID,
  type PolicyRule,
  type RuleAction,
  type RuleTarget,
} from "./rules.js";

export type RuleApplicability = "applies" | "not_applies" | "ambiguous";

/** One rule's evaluated relationship to the change set under decision. */
export interface RuleDetermination {
  readonly ruleId: string;
  readonly applicability: RuleApplicability;
  /** Fact text describing the observed situation (fixture example or classifier rationale). */
  readonly statement: string;
  /** Repository-relative paths involved. */
  readonly paths: readonly string[];
  /** Declared obligation references (config, contracts) backing the determination. */
  readonly declaredRefs?: readonly string[];
  /** Observed evidence references (reproductions, failing tests) backing it. */
  readonly observedRefs?: readonly string[];
  /** Provenance when neither declared nor observed evidence backs it. */
  readonly fallbackProvenance?: Extract<Provenance, "derived" | "inferred">;
  /** Existing covering test path; selects EXISTING_TEST_UPDATE_CANDIDATE. */
  readonly existingTestPath?: string;
  /** Evidence target resolved from the observed failure mechanism and boundary. */
  readonly resolvedTarget?: RuleTarget;
  /** Existing test proven sufficient without an edit. */
  readonly sufficientExistingTestPath?: string;
  /** Obligation or observed-failure references explicitly covered by that test. */
  readonly sufficientExistingObligationRefs?: readonly string[];
  /** Failure class explicitly covered by that test. */
  readonly sufficientExistingFailureClass?: string;
  /** Override for the evidence gap axis (defaults: recommend "material", no_test "none"). */
  readonly evidenceGap?: EvidenceGap;
  /** Extra decision limitations already known to the caller. */
  readonly limitations?: readonly string[];
}

export interface PolicyIds {
  readonly decision: string;
  readonly obligation: string;
  readonly evidence: string;
}

export interface PolicyPresentation {
  readonly reasonCode: string;
  readonly summary: string;
  readonly rationale: string;
}

export interface PolicyOptions {
  readonly mode?: PolicyMode;
  readonly elevatedRuleIds?: readonly string[];
  /** RFC 3339 timestamp stamped on the evidence record. */
  readonly observedAt: string;
  readonly ids: PolicyIds;
  readonly presentation: PolicyPresentation;
}

export interface PolicyEvaluation {
  readonly decision: Decision;
  /** Null when no credible obligation can be identified (unknown provenance). */
  readonly obligation: ObligationCandidate | null;
  readonly evidence: EvidenceRecord;
}

const NULL_TARGET: DecisionTarget = {
  scope: null,
  purpose: null,
  technique: null,
  cadence: null,
  failure_class: null,
  test_path: null,
};

const PROVENANCE_TO_AXIS: Readonly<Record<Provenance, MaterialityConfidence>> =
  {
    declared: "explicit",
    observed: "observed",
    derived: "derived",
    inferred: "inferred",
    unknown: "unknown",
  };

const PROVENANCE_TO_DECISION_CONFIDENCE: Readonly<
  Record<Provenance, DecisionConfidence>
> = {
  declared: "high",
  observed: "high",
  derived: "medium",
  inferred: "low",
  unknown: "low",
};

function getRule(ruleId: string): PolicyRule {
  const rule = POLICY_RULES_BY_ID.get(ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown policy rule: ${ruleId}`);
  }
  return rule;
}

function deriveProvenance(det: RuleDetermination): Provenance {
  if ((det.declaredRefs?.length ?? 0) > 0) return "declared";
  if ((det.observedRefs?.length ?? 0) > 0) return "observed";
  if (det.applicability === "ambiguous") return "unknown";
  return det.fallbackProvenance ?? "derived";
}

function buildEvidence(
  det: RuleDetermination,
  provenance: Provenance,
  options: PolicyOptions,
): EvidenceRecord {
  const kind: EvidenceKind =
    provenance === "declared"
      ? "declared_policy"
      : provenance === "observed"
        ? "failing_test"
        : "user_context";
  return {
    schema_version: "1.0",
    id: options.ids.evidence,
    kind,
    status: provenance === "observed" ? "observed" : "available",
    source: {
      tool: "test-steward-policy",
      version: null,
      path: null,
      command_fingerprint: null,
      observed_at: options.observedAt,
    },
    findings: [
      {
        code: "RULE_DETERMINATION",
        summary: det.statement,
        paths: [...new Set(det.paths)].sort(),
      },
    ],
    data: {
      rule_id: det.ruleId,
      applicability: det.applicability,
    },
    gate_trust:
      provenance === "declared" || provenance === "observed"
        ? "eligible"
        : "advisory_only",
    limitations: [
      "Facts were supplied to the policy engine; no repository command was executed.",
    ],
  };
}

function targetMatchesConstraints(
  target: RuleTarget,
  constraints: Partial<RuleTarget> | undefined,
): boolean {
  if (constraints === undefined) return true;
  return Object.entries(constraints).every(
    ([key, value]) => target[key as keyof RuleTarget] === value,
  );
}

/**
 * Decide one rule determination. Returns the decision plus the obligation
 * candidate and evidence record it references.
 */
export function decideRule(
  det: RuleDetermination,
  options: PolicyOptions,
): PolicyEvaluation {
  if (
    det.existingTestPath !== undefined &&
    det.sufficientExistingTestPath !== undefined
  ) {
    throw new Error(
      "A rule determination cannot require an existing-test update and mark existing evidence sufficient",
    );
  }
  if (
    det.sufficientExistingTestPath !== undefined &&
    det.evidenceGap !== undefined &&
    det.evidenceGap !== "none"
  ) {
    throw new Error(
      "Sufficient existing evidence requires evidenceGap to be none",
    );
  }

  const rule = getRule(det.ruleId);
  const mode = options.mode ?? "advisory";
  const elevatedRuleIds = options.elevatedRuleIds ?? [];
  const provenance = deriveProvenance(det);
  const evidence = buildEvidence(det, provenance, options);
  const baseLimitations = det.limitations ?? [];
  const obligationRefs = new Set([
    ...(det.declaredRefs ?? []),
    ...(det.observedRefs ?? []),
  ]);
  const sufficientObligationRefs = new Set(
    det.sufficientExistingObligationRefs ?? [],
  );
  const resolvedTarget = det.resolvedTarget ?? rule.target;
  const targetMismatch =
    resolvedTarget !== null &&
    !targetMatchesConstraints(resolvedTarget, rule.targetConstraints);
  const recommendTarget = targetMismatch ? null : resolvedTarget;

  // Semantic and non-automatable rules must not act on their own judgment:
  // without declared or observed provenance the documented degraded outcome
  // is advisory INSUFFICIENT_EVIDENCE (rules.md low-confidence behavior).
  const semanticWithoutSupport =
    (rule.classification === "semantic" ||
      rule.classification === "non-automatable") &&
    provenance !== "declared" &&
    provenance !== "observed";

  const unresolved =
    det.applicability === "ambiguous" ||
    provenance === "unknown" ||
    semanticWithoutSupport;

  const action: RuleAction | "unresolved" = unresolved
    ? "unresolved"
    : det.applicability === "applies"
      ? rule.appliesAction
      : rule.notAppliesAction;
  const sufficientExistingEvidence =
    action === "recommend" &&
    det.sufficientExistingTestPath !== undefined &&
    det.sufficientExistingFailureClass !== undefined &&
    recommendTarget !== null &&
    det.sufficientExistingFailureClass === recommendTarget.failure_class &&
    obligationRefs.size > 0 &&
    [...obligationRefs].every((reference) =>
      sufficientObligationRefs.has(reference),
    ) &&
    (provenance === "declared" || provenance === "observed");
  const existingTestPath =
    det.existingTestPath ??
    (sufficientExistingEvidence ? undefined : det.sufficientExistingTestPath);

  const confidenceAxis = PROVENANCE_TO_AXIS[provenance];
  let axes: MaterialityAxes;
  let distinctChangedObligation: boolean;
  if (action === "recommend") {
    if (rule.obligationAxes === null) {
      throw new Error(`Rule ${rule.id} recommends but declares no obligation`);
    }
    axes = {
      ...rule.obligationAxes,
      evidence_gap:
        recommendTarget === null
          ? "unknown"
          : sufficientExistingEvidence
            ? "none"
            : det.sufficientExistingTestPath === undefined
              ? (det.evidenceGap ?? "material")
              : "material",
      confidence: confidenceAxis,
    };
    distinctChangedObligation = recommendTarget !== null;
  } else if (action === "no_test") {
    axes = {
      consequence: "negligible",
      exposure: "internal",
      change_mechanism:
        det.applicability === "applies" ? "no_behavior" : "pure_behavior",
      evidence_gap: "none",
      confidence: confidenceAxis,
    };
    distinctChangedObligation = false;
  } else {
    axes = {
      consequence: "negligible",
      exposure: "internal",
      change_mechanism: "pure_behavior",
      evidence_gap: "unknown",
      confidence: confidenceAxis,
    };
    distinctChangedObligation = false;
  }

  const tier = assignTier({ axes, distinctChangedObligation });
  const gateEligible = isGateEligible({
    provenance,
    executableGapDemonstrated:
      axes.evidence_gap === "material" || axes.evidence_gap === "partial",
    ruleId: rule.id,
    elevatedRuleIds,
  });
  const materialityGateAction = allowedGateAction({
    tier,
    provenance,
    mode,
    gateEligible,
  });

  const outcome = sufficientExistingEvidence
    ? "EXISTING_EVIDENCE_SUFFICIENT"
    : action === "recommend" && recommendTarget === null
      ? "INSUFFICIENT_EVIDENCE"
      : tier === "TU"
        ? "INSUFFICIENT_EVIDENCE"
        : tier === "T0"
          ? "NO_TEST_SUPPORTED"
          : existingTestPath !== undefined
            ? "EXISTING_TEST_UPDATE_CANDIDATE"
            : "NEW_TEST_CANDIDATE";

  const gateAction =
    outcome === "EXISTING_EVIDENCE_SUFFICIENT"
      ? "allow"
      : materialityGateAction;

  const target: DecisionTarget =
    outcome === "EXISTING_EVIDENCE_SUFFICIENT"
      ? recommendTarget === null
        ? {
            ...NULL_TARGET,
            technique: "existing_evidence",
            cadence: "completion",
            test_path: det.sufficientExistingTestPath ?? null,
          }
        : {
            ...recommendTarget,
            technique: "existing_evidence",
            test_path: det.sufficientExistingTestPath ?? null,
          }
      : (outcome === "NEW_TEST_CANDIDATE" ||
            outcome === "EXISTING_TEST_UPDATE_CANDIDATE") &&
          recommendTarget !== null
        ? { ...recommendTarget, test_path: existingTestPath ?? null }
        : NULL_TARGET;

  const limitations = [...baseLimitations];
  if (action === "recommend" && recommendTarget === null) {
    limitations.push(
      targetMismatch
        ? "The supplied evidence target conflicts with the policy rule constraints."
        : "The observed failure mechanism and boundary do not resolve a minimum sufficient evidence target.",
    );
  }
  if (
    det.sufficientExistingTestPath !== undefined &&
    !sufficientExistingEvidence
  ) {
    limitations.push(
      "Existing evidence was not marked sufficient because it was not explicitly bound to this obligation and failure class.",
    );
  }
  if (outcome === "INSUFFICIENT_EVIDENCE") {
    limitations.push(rule.lowConfidenceBehavior);
  }

  const remediation =
    gateAction === "request_remediation" && target.scope !== null
      ? outcome === "EXISTING_TEST_UPDATE_CANDIDATE" &&
        target.test_path !== null
        ? `Inspect and update ${target.test_path} for ${target.failure_class ?? "the changed obligation"} (${rule.id}); do not add a separate test unless it detects a distinct failure mechanism.`
        : `Add ${target.scope}-scope ${target.purpose ?? "functional"} evidence covering ${target.failure_class ?? "the changed obligation"} (${rule.id}).`
      : null;

  // ADR-004 unknown provenance: no credible obligation can be identified, so
  // no candidate is emitted; the decision reports the uncertainty instead.
  const obligation: ObligationCandidate | null =
    provenance === "unknown"
      ? null
      : {
          schema_version: "1.0",
          id: options.ids.obligation,
          title: rule.title,
          statement: det.statement,
          provenance,
          source_refs: [
            ...new Set([
              ...(det.declaredRefs ?? []),
              ...(det.observedRefs ?? []),
              options.ids.evidence,
            ]),
          ],
          materiality: { ...axes, tier },
          gate_eligible: gateEligible,
          rationale: options.presentation.rationale,
          limitations: [...limitations],
        };

  const decision: Decision = {
    schema_version: "1.0",
    id: options.ids.decision,
    domain: "change",
    outcome,
    gate_action: gateAction,
    confidence: PROVENANCE_TO_DECISION_CONFIDENCE[provenance],
    reason_code: options.presentation.reasonCode,
    summary: options.presentation.summary,
    rationale: options.presentation.rationale,
    remediation,
    obligation_candidate_ids: obligation === null ? [] : [obligation.id],
    evidence_ids: [evidence.id],
    target,
    cleanup_requirements: null,
    limitations,
  };

  return { decision, obligation, evidence };
}

export {
  POLICY_RULES,
  POLICY_RULES_BY_ID,
  type PolicyRule,
  type RuleAction,
  type RuleClassification,
} from "./rules.js";
