// ADR-004 gate eligibility, implemented literally: declared/observed may
// gate in configured modes with a demonstrated gap, derived is advisory
// unless the exact rule is elevated (and then only in strict mode at T3),
// inferred and unknown NEVER gate — even at maximum materiality in strict
// mode.

import { describe, expect, it } from "vitest";
import { isGateEligible } from "../../../src/core/materiality/index.js";
import {
  decideRule,
  type PolicyOptions,
  type RuleDetermination,
} from "../../../src/core/policy/index.js";

function options(overrides: Partial<PolicyOptions> = {}): PolicyOptions {
  return {
    observedAt: "2026-08-28T00:00:00Z",
    ids: {
      decision: "decision-t",
      obligation: "obligation-t",
      evidence: "evidence-t",
    },
    presentation: {
      reasonCode: "TEST_CASE",
      summary: "Test case.",
      rationale: "Test rationale.",
    },
    ...overrides,
  };
}

function determination(
  overrides: Partial<RuleDetermination> = {},
): RuleDetermination {
  return {
    ruleId: "CHG-006",
    applicability: "applies",
    statement: "Webhook claim/release lifecycle changed.",
    paths: ["src/webhook.ts"],
    ...overrides,
  };
}

describe("gate eligibility (ADR-004)", () => {
  it("inferred never gates, even at maximum materiality in strict mode", () => {
    // CHG-009 axes are adversarial; with inferred confidence no T4 row
    // matches, and gate eligibility is categorically false.
    const { decision, obligation } = decideRule(
      determination({
        ruleId: "CHG-009",
        fallbackProvenance: "inferred",
      }),
      options({ mode: "strict", elevatedRuleIds: ["CHG-009"] }),
    );
    expect(obligation?.provenance).toBe("inferred");
    expect(obligation?.gate_eligible).toBe(false);
    expect(decision.gate_action).toBe("advise");
    expect(decision.gate_action).not.toBe("request_remediation");

    expect(
      isGateEligible({
        provenance: "inferred",
        executableGapDemonstrated: true,
        ruleId: "CHG-009",
        elevatedRuleIds: ["CHG-009"],
      }),
    ).toBe(false);
    expect(
      isGateEligible({
        provenance: "unknown",
        executableGapDemonstrated: true,
        ruleId: "CHG-009",
        elevatedRuleIds: ["CHG-009"],
      }),
    ).toBe(false);
  });

  it("inferred T3-shaped obligation still only advises in strict mode", () => {
    // TST-004 (heuristic) axes reach T3; inferred provenance must cap at advise.
    const { decision, obligation } = decideRule(
      determination({ ruleId: "TST-004", fallbackProvenance: "inferred" }),
      options({ mode: "strict", elevatedRuleIds: ["TST-004"] }),
    );
    expect(obligation?.materiality.tier).toBe("T3");
    expect(obligation?.gate_eligible).toBe(false);
    expect(decision.gate_action).toBe("advise");
  });

  it("declared with a material gap gates in balanced and strict, not advisory", () => {
    const declared = determination({ declaredRefs: ["policy:webhook-retry"] });

    const advisory = decideRule(declared, options({ mode: "advisory" }));
    expect(advisory.decision.gate_action).toBe("advise");
    expect(advisory.decision.remediation).toBeNull();

    for (const mode of ["balanced", "strict"] as const) {
      const { decision, obligation } = decideRule(declared, options({ mode }));
      expect(obligation?.gate_eligible).toBe(true);
      expect(decision.gate_action).toBe("request_remediation");
      expect(decision.remediation).toMatch(/CHG-006/);
    }
  });

  it("observed gates targeted remediation in balanced mode", () => {
    const { decision, obligation } = decideRule(
      determination({
        ruleId: "TST-003",
        observedRefs: ["reproduction:retry-after-claim"],
      }),
      options({ mode: "balanced" }),
    );
    expect(obligation?.provenance).toBe("observed");
    expect(obligation?.materiality.tier).toBe("T2");
    expect(decision.gate_action).toBe("request_remediation");
  });

  it("derived is advisory unless the exact rule is elevated, and then strict-only", () => {
    const derived = determination(); // no refs -> derived fallback

    expect(
      decideRule(derived, options({ mode: "strict" })).decision.gate_action,
    ).toBe("advise");
    expect(
      decideRule(
        derived,
        options({ mode: "balanced", elevatedRuleIds: ["CHG-006"] }),
      ).decision.gate_action,
    ).toBe("advise");

    const elevatedStrict = decideRule(
      derived,
      options({ mode: "strict", elevatedRuleIds: ["CHG-006"] }),
    );
    expect(elevatedStrict.obligation?.materiality.tier).toBe("T3");
    expect(elevatedStrict.obligation?.gate_eligible).toBe(true);
    expect(elevatedStrict.decision.gate_action).toBe("request_remediation");

    const otherRuleElevated = decideRule(
      derived,
      options({ mode: "strict", elevatedRuleIds: ["CHG-007"] }),
    );
    expect(otherRuleElevated.decision.gate_action).toBe("advise");
  });

  it("declared without a demonstrated gap does not gate", () => {
    // Rule not applying -> gap none -> T0, allow, not gate eligible.
    const { decision, obligation } = decideRule(
      determination({
        applicability: "not_applies",
        declaredRefs: ["policy:webhook-retry"],
      }),
      options({ mode: "strict" }),
    );
    expect(obligation?.materiality.tier).toBe("T0");
    expect(obligation?.gate_eligible).toBe(false);
    expect(decision.outcome).toBe("NO_TEST_SUPPORTED");
    expect(decision.gate_action).toBe("allow");
  });

  it("T4 remediation is reserved for declared/observed provenance", () => {
    const declaredSecurity = decideRule(
      determination({
        ruleId: "CHG-009",
        declaredRefs: ["policy:webhook-signature"],
      }),
      options({ mode: "strict" }),
    );
    expect(declaredSecurity.obligation?.materiality.tier).toBe("T4");
    expect(declaredSecurity.decision.gate_action).toBe("request_remediation");
  });
});
