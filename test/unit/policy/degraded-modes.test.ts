// Degraded behavior: semantic and non-automatable rules never guess — with
// no declared or observed provenance they emit advisory
// INSUFFICIENT_EVIDENCE (the documented low-confidence behavior), while
// deterministic and heuristic rules proceed on structural facts.

import { describe, expect, it } from "vitest";
import {
  decideRule,
  type PolicyOptions,
  type RuleDetermination,
} from "../../../src/core/policy/index.js";

const baseOptions: PolicyOptions = {
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
};

function det(overrides: Partial<RuleDetermination>): RuleDetermination {
  return {
    ruleId: "TST-001",
    applicability: "applies",
    statement: "An exported behavior changed.",
    paths: ["src/example.ts"],
    ...overrides,
  };
}

describe("degraded modes", () => {
  it("semantic rule without declared/observed support degrades to INSUFFICIENT_EVIDENCE", () => {
    const { decision } = decideRule(det({}), baseOptions); // derived fallback
    expect(decision.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.gate_action).toBe("advise");
    expect(decision.limitations).toContain(
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    );
    expect(decision.target.scope).toBeNull();
  });

  it("semantic rule degrades even when it claims not to apply", () => {
    const { decision } = decideRule(
      det({ applicability: "not_applies" }),
      baseOptions,
    );
    expect(decision.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("non-automatable rule (TST-007) degrades without declared/observed support", () => {
    const { decision } = decideRule(det({ ruleId: "TST-007" }), baseOptions);
    expect(decision.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.gate_action).toBe("advise");
  });

  it.each(["TST-003", "TST-007", "PLC-001", "PLC-002"])(
    "%s waits for the observed failure boundary before selecting a target",
    (ruleId) => {
      const unresolved = decideRule(
        det({ ruleId, declaredRefs: [`policy:${ruleId}`] }),
        baseOptions,
      ).decision;
      expect(unresolved.outcome).toBe("INSUFFICIENT_EVIDENCE");
      expect(unresolved.target.scope).toBeNull();
      expect(unresolved.limitations).toContainEqual(
        expect.stringContaining("do not resolve"),
      );
    },
  );

  it("uses a target resolved from the observed regression boundary", () => {
    const { decision } = decideRule(
      det({
        ruleId: "TST-003",
        observedRefs: ["reproduction:retry-after-claim"],
        resolvedTarget: {
          scope: "integration",
          purpose: "regression",
          technique: "example",
          cadence: "pull_request",
          failure_class: "retry-after-failed-claim",
        },
      }),
      baseOptions,
    );
    expect(decision.outcome).toBe("NEW_TEST_CANDIDATE");
    expect(decision.target).toMatchObject({
      scope: "integration",
      purpose: "regression",
      failure_class: "retry-after-failed-claim",
    });
  });

  it("semantic rule proceeds when declared provenance backs it", () => {
    const { decision } = decideRule(
      det({ declaredRefs: ["golden:TST-001"] }),
      baseOptions,
    );
    expect(decision.outcome).toBe("NEW_TEST_CANDIDATE");
    expect(decision.gate_action).toBe("advise");
    expect(decision.confidence).toBe("high");
  });

  it("heuristic rule proceeds on derived structural facts, advisory", () => {
    const { decision, obligation } = decideRule(
      det({ ruleId: "CHG-006" }),
      baseOptions,
    );
    expect(decision.outcome).toBe("NEW_TEST_CANDIDATE");
    expect(decision.gate_action).toBe("advise");
    expect(decision.confidence).toBe("medium");
    expect(obligation?.provenance).toBe("derived");
  });

  it("deterministic rule that applies supports NO_TEST with allow", () => {
    const { decision } = decideRule(
      det({ ruleId: "CHG-001", statement: "README wording only." }),
      baseOptions,
    );
    expect(decision.outcome).toBe("NO_TEST_SUPPORTED");
    expect(decision.gate_action).toBe("allow");
  });

  it("ambiguous determinations yield INSUFFICIENT_EVIDENCE with no obligation candidate", () => {
    const { decision, obligation, evidence } = decideRule(
      det({ ruleId: "CHG-006", applicability: "ambiguous" }),
      baseOptions,
    );
    expect(decision.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.gate_action).toBe("advise");
    expect(decision.confidence).toBe("low");
    expect(obligation).toBeNull();
    expect(decision.obligation_candidate_ids).toEqual([]);
    expect(evidence.gate_trust).toBe("advisory_only");
  });

  it("never emits deny_tool for semantic uncertainty in any mode", () => {
    for (const mode of ["advisory", "balanced", "strict"] as const) {
      const { decision } = decideRule(det({ applicability: "ambiguous" }), {
        ...baseOptions,
        mode,
      });
      expect(decision.gate_action).toBe("advise");
    }
  });
});
