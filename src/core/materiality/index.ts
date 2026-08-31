// Ordinal materiality and allowed-action tables from
// spec/policy/materiality-tables.md and the ADR-004 gate table. Rows are
// applied first-match in tier order; no axis is multiplied, summed, or
// converted into a scalar score.

import type {
  GateAction,
  MaterialityAxes,
  MaterialityTier,
  PolicyMode,
  Provenance,
} from "../model/index.js";

export interface TierInput {
  readonly axes: MaterialityAxes;
  /**
   * Whether the diff changes a distinct repository-owned obligation. The T0
   * row's second clause ("evidence gap `none` with no distinct changed
   * obligation") needs this flag; axes alone cannot express it.
   */
  readonly distinctChangedObligation: boolean;
}

/** Materiality decision table: apply the first matching row. */
export function assignTier(input: TierInput): MaterialityTier {
  const { axes, distinctChangedObligation } = input;
  const { consequence, exposure, change_mechanism, evidence_gap, confidence } =
    axes;

  // T0: `no_behavior`, or evidence gap `none` with no distinct changed obligation.
  if (change_mechanism === "no_behavior") return "T0";
  if (evidence_gap === "none" && !distinctChangedObligation) return "T0";

  const known = evidence_gap !== "unknown" && confidence !== "unknown";

  if (known) {
    // T1: Negligible/internal pure behavior, or partial low-consequence gap.
    if (
      (consequence === "negligible" &&
        exposure === "internal" &&
        change_mechanism === "pure_behavior") ||
      (evidence_gap === "partial" && consequence === "negligible")
    ) {
      return "T1";
    }

    // T2: Degraded user-facing behavior, meaningful pure invariant, or
    // bounded boundary gap (a boundary gap not crossing systems or exposed
    // to adversaries — those escalate to T3/T4).
    if (
      (consequence === "degraded" && exposure === "user_facing") ||
      (change_mechanism === "pure_behavior" &&
        (evidence_gap === "partial" || evidence_gap === "material")) ||
      (change_mechanism === "boundary" &&
        (evidence_gap === "partial" || evidence_gap === "material") &&
        (exposure === "internal" || exposure === "user_facing"))
    ) {
      return "T2";
    }

    // T3: Cross-system boundary (including an already-covered obligation),
    // or cross-system/stateful behavior with a material gap.
    if (
      (exposure === "cross_system" && change_mechanism === "boundary") ||
      ((exposure === "cross_system" ||
        change_mechanism === "stateful_or_irreversible") &&
        evidence_gap === "material")
    ) {
      return "T3";
    }

    // T4: Explicit/observed regulated, safety, security, privacy, or
    // adversarial obligation with material gap.
    if (
      (consequence === "regulated_or_safety_critical" ||
        exposure === "adversarial") &&
      evidence_gap === "material" &&
      (confidence === "explicit" || confidence === "observed")
    ) {
      return "T4";
    }
  }

  // TU: evidence gap or confidence is unknown, or no row establishes the
  // decision — the decision depends on missing intent/evidence.
  return "TU";
}

/** Maximum gate behavior column of the materiality decision table. */
export function maximumGateBehavior(tier: MaterialityTier): GateAction {
  switch (tier) {
    case "T0":
      return "allow";
    case "T1":
    case "TU":
      return "advise";
    case "T2":
    case "T3":
    case "T4":
      // Remediation ceiling; `deny_tool` is reserved for concrete unsafe
      // tool actions and is never produced by materiality alone.
      return "request_remediation";
  }
}

export interface GateEligibilityInput {
  readonly provenance: Provenance;
  /** Whether a concrete executable evidence gap is demonstrated (ADR-004 declared row). */
  readonly executableGapDemonstrated: boolean;
  /** Rule under evaluation, e.g. "CHG-006". */
  readonly ruleId: string;
  /** Rules repository policy explicitly elevates (config `policy.elevated_rule_ids`). */
  readonly elevatedRuleIds: readonly string[];
}

/**
 * ADR-004 gate eligibility, literally: declared may gate only with a
 * demonstrated executable gap, observed may gate, derived is advisory unless
 * repository policy elevates the exact rule, inferred and unknown NEVER gate.
 */
export function isGateEligible(input: GateEligibilityInput): boolean {
  switch (input.provenance) {
    case "declared":
      return input.executableGapDemonstrated;
    case "observed":
      return true;
    case "derived":
      return input.elevatedRuleIds.includes(input.ruleId);
    case "inferred":
    case "unknown":
      return false;
  }
}

export interface AllowedActionInput {
  readonly tier: MaterialityTier;
  readonly provenance: Provenance;
  readonly mode: PolicyMode;
  readonly gateEligible: boolean;
}

/**
 * Allowed gate action: the tier's maximum gate behavior, capped by the
 * ADR-004 provenance/mode table. Advisory (default) mode never exceeds
 * advise; T0 allows.
 */
export function allowedGateAction(input: AllowedActionInput): GateAction {
  const ceiling = maximumGateBehavior(input.tier);
  if (ceiling === "allow") return "allow";
  if (ceiling === "advise") return "advise";

  // ceiling === "request_remediation" (T2–T4)
  if (input.mode === "advisory") return "advise";
  if (!input.gateEligible) return "advise";

  switch (input.tier) {
    case "T2":
    case "T4":
      // T2: declared/observed support only. T4: strict targeted remediation,
      // also declared/observed only (elevated derived never reaches T4).
      return input.provenance === "declared" || input.provenance === "observed"
        ? "request_remediation"
        : "advise";
    case "T3":
      // T3: any gate-eligible provenance; elevated derived rules gate only
      // in strict mode (ADR-004 gate table, derived row).
      if (input.provenance === "derived" && input.mode !== "strict") {
        return "advise";
      }
      return "request_remediation";
    default:
      return "advise";
  }
}
