// Provenance labeling: obligation candidates carry exactly one primary
// provenance class derived from what backs the determination, evidence
// records always carry limitations, and existing evidence distinguishes an
// unchanged sufficient test from one that needs an update.

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
    ruleId: "CHG-006",
    applicability: "applies",
    statement: "A boundary changed.",
    paths: ["src/webhook.ts"],
    ...overrides,
  };
}

describe("provenance labeling", () => {
  it("declared refs produce a declared candidate with explicit confidence", () => {
    const { obligation, evidence } = decideRule(
      det({
        declaredRefs: ["policy:webhook-retry", "docs/contracts/webhook.md"],
      }),
      baseOptions,
    );
    expect(obligation?.provenance).toBe("declared");
    expect(obligation?.materiality.confidence).toBe("explicit");
    expect(obligation?.source_refs).toEqual([
      "policy:webhook-retry",
      "docs/contracts/webhook.md",
      "evidence-t",
    ]);
    expect(evidence.kind).toBe("declared_policy");
    expect(evidence.gate_trust).toBe("eligible");
  });

  it("observed refs produce an observed candidate and observed evidence", () => {
    const { obligation, evidence } = decideRule(
      det({ observedRefs: ["reproduction:duplicate-side-effect"] }),
      baseOptions,
    );
    expect(obligation?.provenance).toBe("observed");
    expect(obligation?.materiality.confidence).toBe("observed");
    expect(evidence.kind).toBe("failing_test");
    expect(evidence.status).toBe("observed");
    expect(evidence.gate_trust).toBe("eligible");
  });

  it("structural facts fall back to derived provenance with advisory evidence", () => {
    const { obligation, evidence } = decideRule(det({}), baseOptions);
    expect(obligation?.provenance).toBe("derived");
    expect(obligation?.materiality.confidence).toBe("derived");
    expect(evidence.kind).toBe("user_context");
    expect(evidence.gate_trust).toBe("advisory_only");
  });

  it("inferred determinations are labeled inferred and never gate eligible", () => {
    const { obligation } = decideRule(
      det({ fallbackProvenance: "inferred" }),
      baseOptions,
    );
    expect(obligation?.provenance).toBe("inferred");
    expect(obligation?.materiality.confidence).toBe("inferred");
    expect(obligation?.gate_eligible).toBe(false);
  });

  it("evidence limitations are always present", () => {
    for (const overrides of [
      {},
      { declaredRefs: ["policy:x"] },
      { applicability: "ambiguous" as const },
    ]) {
      const { evidence } = decideRule(det(overrides), baseOptions);
      expect(evidence.limitations.length).toBeGreaterThan(0);
    }
  });

  it("an existing covering test selects EXISTING_TEST_UPDATE_CANDIDATE", () => {
    const { decision } = decideRule(
      det({
        declaredRefs: ["policy:webhook-retry"],
        existingTestPath: "test/integration/webhook.test.ts",
      }),
      baseOptions,
    );
    expect(decision.outcome).toBe("EXISTING_TEST_UPDATE_CANDIDATE");
    expect(decision.target.test_path).toBe("test/integration/webhook.test.ts");
    expect(decision.target.scope).toBe("integration");
  });

  it("marks proven existing evidence sufficient without requesting a test edit", () => {
    const { decision, obligation } = decideRule(
      det({
        observedRefs: ["reproduction:retry-after-claim"],
        sufficientExistingTestPath: "test/integration/webhook.test.ts",
        sufficientExistingObligationRefs: ["reproduction:retry-after-claim"],
        sufficientExistingFailureClass: "boundary-regression",
      }),
      { ...baseOptions, mode: "strict" },
    );
    expect(obligation?.materiality.evidence_gap).toBe("none");
    expect(decision).toMatchObject({
      outcome: "EXISTING_EVIDENCE_SUFFICIENT",
      gate_action: "allow",
      remediation: null,
      target: {
        scope: "integration",
        purpose: "regression",
        technique: "existing_evidence",
        test_path: "test/integration/webhook.test.ts",
      },
    });
  });

  it("does not accept unbound existing evidence as sufficient", () => {
    const { decision, obligation } = decideRule(
      det({
        observedRefs: ["reproduction:retry-after-claim"],
        sufficientExistingTestPath: "test/integration/webhook.test.ts",
      }),
      { ...baseOptions, mode: "strict" },
    );
    expect(decision.outcome).toBe("EXISTING_TEST_UPDATE_CANDIDATE");
    expect(decision.target.test_path).toBe("test/integration/webhook.test.ts");
    expect(decision.limitations).toContainEqual(
      expect.stringContaining("not explicitly bound"),
    );
    expect(obligation?.materiality.evidence_gap).not.toBe("none");
  });

  it("rejects contradictory existing-evidence dispositions", () => {
    expect(() =>
      decideRule(
        det({
          existingTestPath: "test/integration/webhook.test.ts",
          sufficientExistingTestPath: "test/integration/webhook.test.ts",
        }),
        baseOptions,
      ),
    ).toThrow(/cannot require an existing-test update/);
  });
});
