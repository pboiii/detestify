import { describe, expect, it } from "vitest";
import {
  buildCleanupPlan,
  type CandidateDraft,
  type CleanupPlanInput,
} from "../../../src/cleanup/planner.js";
import type { ProtectionIndex } from "../../../src/cleanup/protection.js";
import { PROTECTED_TESTS_LEDGER } from "../../../src/cleanup/protection.js";

const openIndex: ProtectionIndex = {
  records: [],
  expiry: [],
  deletionEligible: true,
  limitations: [],
};

const repository = {
  root: "/repo",
  revision: "abc123",
  diff_fingerprint: "sha256:clean",
};

function draft(
  overrides: Partial<CandidateDraft> & { id: string },
): CandidateDraft {
  return {
    test_paths: ["test/a.test.ts", "test/b.test.ts"],
    rationale: "detector rationale",
    ...overrides,
  };
}

function plan(
  candidates: CandidateDraft[],
  overrides: Partial<CleanupPlanInput> = {},
) {
  return buildCleanupPlan({
    plan_id: "plan-1",
    generated_at: "2026-08-28T00:00:00Z",
    repository,
    candidates,
    protection: openIndex,
    ...overrides,
  });
}

describe("buildCleanupPlan ranking", () => {
  const deleteDraft = draft({
    id: "c-delete",
    proposed_action: "DELETE_CANDIDATE",
    structural_signals: ["ev-ast"],
    independent_signals: ["ev-counterfactual"],
  });
  const mergeDraft = draft({
    id: "c-merge",
    proposed_action: "MERGE_CANDIDATE",
    structural_signals: ["ev-similar"],
  });
  const keepDraft = draft({ id: "c-keep", proposed_action: "KEEP" });
  const insufficientDraft = draft({
    id: "c-insufficient",
    test_paths: ["test/only.test.ts"],
  });

  it("orders by action severity then id, deterministically across input order", () => {
    const forward = plan([
      keepDraft,
      mergeDraft,
      deleteDraft,
      insufficientDraft,
    ]);
    const reversed = plan([
      insufficientDraft,
      deleteDraft,
      mergeDraft,
      keepDraft,
    ]);
    expect(forward.candidates.map((c) => c.id)).toEqual([
      "c-delete",
      "c-merge",
      "c-insufficient",
      "c-keep",
    ]);
    expect(reversed).toEqual(forward);
  });

  it("breaks ties within an action by signal counts then id", () => {
    const a = draft({
      id: "c-b",
      proposed_action: "DELETE_CANDIDATE",
      structural_signals: ["s1"],
      independent_signals: ["i1"],
    });
    const b = draft({
      id: "c-a",
      proposed_action: "DELETE_CANDIDATE",
      structural_signals: ["s1"],
      independent_signals: ["i1"],
    });
    const c = draft({
      id: "c-strong",
      proposed_action: "DELETE_CANDIDATE",
      structural_signals: ["s1", "s2"],
      independent_signals: ["i1", "i2"],
    });
    expect(plan([a, b, c]).candidates.map((x) => x.id)).toEqual([
      "c-strong",
      "c-a",
      "c-b",
    ]);
  });
});

describe("buildCleanupPlan evidence rule", () => {
  it("derives DELETE_CANDIDATE without a proposal when all conditions hold", () => {
    const result = plan([
      draft({
        id: "c1",
        structural_signals: ["ev-ast"],
        independent_signals: ["ev-removal"],
      }),
    ]);
    expect(result.candidates[0]!.action).toBe("DELETE_CANDIDATE");
    expect(result.candidates[0]!.human_approval).toEqual({
      required: true,
      status: "pending",
      approver_ref: null,
    });
  });

  it("never promotes past the detector proposal", () => {
    const result = plan([
      draft({
        id: "c1",
        proposed_action: "MERGE_CANDIDATE",
        structural_signals: ["ev-ast"],
        independent_signals: ["ev-removal"],
      }),
    ]);
    expect(result.candidates[0]!.action).toBe("MERGE_CANDIDATE");
  });

  it("discounts an independent signal that is also structural", () => {
    const result = plan([
      draft({
        id: "c1",
        proposed_action: "DELETE_CANDIDATE",
        structural_signals: ["ev-ast"],
        independent_signals: ["ev-ast"],
      }),
    ]);
    const candidate = result.candidates[0]!;
    expect(candidate.action).toBe("MERGE_CANDIDATE");
    expect(candidate.independent_signals).toEqual([]);
    expect(
      candidate.limitations.some((l) => l.includes("not independent")),
    ).toBe(true);
  });

  it("demotes when policy disallows delete candidates", () => {
    const result = plan(
      [
        draft({
          id: "c1",
          proposed_action: "DELETE_CANDIDATE",
          structural_signals: ["ev-ast"],
          independent_signals: ["ev-removal"],
        }),
      ],
      { allow_delete_candidates: false },
    );
    const candidate = result.candidates[0]!;
    expect(candidate.action).toBe("MERGE_CANDIDATE");
    expect(
      candidate.limitations.some((l) =>
        l.includes("Demoted from DELETE_CANDIDATE"),
      ),
    ).toBe(true);
  });

  it("rejects drafts without test paths", () => {
    expect(() => plan([draft({ id: "c1", test_paths: [] })])).toThrow(
      /test_paths/,
    );
  });
});

describe("buildCleanupPlan identity matching", () => {
  const protectedIndex: ProtectionIndex = {
    records: [
      {
        source: PROTECTED_TESTS_LEDGER,
        path: "test/contract/*.test.ts",
        obligationIds: ["OBL-CONTRACT"],
        reason: "public contract",
      },
    ],
    expiry: [],
    deletionEligible: true,
    limitations: [],
  };

  it("matches protected records by path pattern", () => {
    const result = plan(
      [
        draft({
          id: "c1",
          proposed_action: "DELETE_CANDIDATE",
          test_paths: ["./test/contract/ack.test.ts", "test/other.test.ts"],
          structural_signals: ["ev-ast"],
          independent_signals: ["ev-removal"],
        }),
      ],
      { protection: protectedIndex },
    );
    const candidate = result.candidates[0]!;
    expect(candidate.action).toBe("KEEP");
    expect(candidate.protected_checks[0]).toMatchObject({
      source: PROTECTED_TESTS_LEDGER,
      passed: false,
    });
  });

  it("matches protected records by obligation id even on other paths", () => {
    const result = plan(
      [
        draft({
          id: "c1",
          proposed_action: "DELETE_CANDIDATE",
          test_paths: ["test/unrelated.test.ts", "test/unrelated2.test.ts"],
          obligation_ids: ["OBL-CONTRACT"],
          structural_signals: ["ev-ast"],
          independent_signals: ["ev-removal"],
        }),
      ],
      { protection: protectedIndex },
    );
    expect(result.candidates[0]!.action).toBe("KEEP");
  });
});

describe("buildCleanupPlan limitation propagation", () => {
  it("propagates protection limitations to the plan and keeps caller limitations", () => {
    const blockedIndex: ProtectionIndex = {
      records: [],
      expiry: [],
      deletionEligible: false,
      limitations: ["Protected-test ledger is unreadable; fail closed."],
    };
    const result = plan(
      [
        draft({
          id: "c1",
          proposed_action: "DELETE_CANDIDATE",
          structural_signals: ["ev-ast"],
          independent_signals: ["ev-removal"],
        }),
      ],
      {
        protection: blockedIndex,
        limitations: ["Mutation evidence was unavailable and not required."],
      },
    );
    expect(result.limitations).toEqual([
      "Mutation evidence was unavailable and not required.",
      "Protected-test ledger is unreadable; fail closed.",
    ]);
    expect(result.candidates[0]!.action).not.toBe("DELETE_CANDIDATE");
    expect(
      result.candidates[0]!.limitations.some((l) => l.includes("fail closed")),
    ).toBe(true);
  });
});
