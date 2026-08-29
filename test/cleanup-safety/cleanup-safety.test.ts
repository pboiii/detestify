// ADR-006 safety counterexamples: the planner must never emit destructive
// advice from static-only evidence, for protected tests, or without a readable
// protection ledger.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getValidator } from "../../src/core/schemas/index.js";
import {
  buildCleanupPlan,
  type CandidateDraft,
  type CleanupCandidate,
  type CleanupPlan,
} from "../../src/cleanup/planner.js";
import {
  loadProtectionIndex,
  PROTECTED_TESTS_LEDGER,
} from "../../src/cleanup/protection.js";

const TASK_04_REPO = path.resolve("spec/handoff/fixtures/task-04/repo");
const EXAMPLES_DIR = path.resolve("spec/schemas/examples");
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cleanup-safety-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return dir;
}

const repository = {
  root: "/repo",
  revision: "abc123",
  diff_fingerprint: "sha256:clean",
};

const perfectRedundancyDraft: CandidateDraft = {
  id: "cand-1",
  test_paths: ["test/dup-a.test.ts", "test/dup-b.test.ts"],
  proposed_action: "DELETE_CANDIDATE",
  obligation_ids: ["OBL-DUP"],
  structural_signals: ["ev-byte-identical", "ev-ast-identical"],
  independent_signals: ["ev-isolated-removal"],
  counterfactual: {
    status: "passed",
    commands_ref: "run:counterfactual-1",
    preserved_obligations: ["OBL-DUP"],
    limitations: ["Only the selected suite was run."],
  },
  worktree_validation: {
    status: "passed",
    worktree_ref: "worktree:1",
    revision: "abc123",
    cleanup_complete: true,
  },
  rationale:
    "One test is byte- and AST-identical to a retained test; isolated removal preserved the obligation.",
  limitations: ["This is a candidate only; alpha does not apply deletion."],
};

const emptyLedger = JSON.stringify({ schema_version: "1.0", tests: [] });

describe("cleanup safety counterexamples", () => {
  it("(a) a protected candidate is never deletion-eligible, even with perfect redundancy signals", async () => {
    const repo = await makeRepo({
      [PROTECTED_TESTS_LEDGER]: JSON.stringify({
        schema_version: "1.0",
        tests: [
          {
            path: "test/dup-a.test.ts",
            obligation_id: "OBL-DUP",
            reason: "public contract",
            owner: "api",
          },
        ],
      }),
    });
    const protection = await loadProtectionIndex(repo);
    const plan = buildCleanupPlan({
      plan_id: "safety-a",
      generated_at: "2026-08-28T00:00:00Z",
      repository,
      candidates: [perfectRedundancyDraft],
      protection,
    });
    const candidate = plan.candidates[0]!;
    expect(candidate.action).not.toBe("DELETE_CANDIDATE");
    expect(candidate.action).toBe("KEEP");
    expect(
      candidate.protected_checks.some((check) => check.passed === false),
    ).toBe(true);
  });

  it("(b) static-only evidence yields MERGE_CANDIDATE or INSUFFICIENT_EVIDENCE, never DELETE_CANDIDATE", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: emptyLedger });
    const protection = await loadProtectionIndex(repo);
    const plan = buildCleanupPlan({
      plan_id: "safety-b",
      generated_at: "2026-08-28T00:00:00Z",
      repository,
      candidates: [
        {
          id: "static-pair",
          test_paths: ["test/fmt-a.test.ts", "test/fmt-b.test.ts"],
          proposed_action: "DELETE_CANDIDATE",
          structural_signals: ["ev-structural-duplicate", "ev-similar-ast"],
          rationale: "Structurally similar tests.",
        },
        {
          id: "static-single",
          test_paths: ["test/lonely.test.ts"],
          proposed_action: "DELETE_CANDIDATE",
          structural_signals: ["ev-similar-ast"],
          rationale: "Similarity without a retained twin.",
        },
      ],
      protection,
    });
    const actions = new Map(plan.candidates.map((c) => [c.id, c.action]));
    expect(actions.get("static-pair")).toBe("MERGE_CANDIDATE");
    expect(actions.get("static-single")).toBe("INSUFFICIENT_EVIDENCE");
    for (const candidate of plan.candidates) {
      expect(candidate.action).not.toBe("DELETE_CANDIDATE");
    }
  });

  it("(c) structural + independent behavioral evidence, unprotected: DELETE_CANDIDATE with complete counterfactual fields", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: emptyLedger });
    const protection = await loadProtectionIndex(repo);
    const plan = buildCleanupPlan({
      plan_id: "safety-c",
      generated_at: "2026-08-28T00:00:00Z",
      repository,
      candidates: [perfectRedundancyDraft],
      protection,
    });
    const candidate = plan.candidates[0]!;
    expect(candidate.action).toBe("DELETE_CANDIDATE");
    // The obligation the deleted test appears to protect.
    expect(candidate.obligation_ids).toEqual(["OBL-DUP"]);
    // What else protects it: the counterfactual preserved the obligation.
    expect(candidate.counterfactual).toEqual({
      status: "passed",
      commands_ref: "run:counterfactual-1",
      preserved_obligations: ["OBL-DUP"],
      limitations: ["Only the selected suite was run."],
    });
    // The unique signal lost is stated in the rationale.
    expect(candidate.rationale).toContain("byte- and AST-identical");
    // Independent signals are listed and disjoint from structural ones.
    expect(candidate.independent_signals).toEqual(["ev-isolated-removal"]);
    // Uncertainty is recorded.
    expect(candidate.limitations.length).toBeGreaterThan(0);
    // Human approval is always required.
    expect(candidate.human_approval).toEqual({
      required: true,
      status: "pending",
      approver_ref: null,
    });
    expect(
      candidate.protected_checks.every((check) => check.passed === true),
    ).toBe(true);

    const validate = await getValidator("cleanup-plan.schema.json");
    expect(validate(plan)).toBe(true);
  });

  it("(d) a corrupt protection file removes deletion eligibility and records a limitation", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: "corrupt {" });
    const protection = await loadProtectionIndex(repo);
    const plan = buildCleanupPlan({
      plan_id: "safety-d",
      generated_at: "2026-08-28T00:00:00Z",
      repository,
      candidates: [perfectRedundancyDraft],
      protection,
    });
    const candidate = plan.candidates[0]!;
    expect(candidate.action).not.toBe("DELETE_CANDIDATE");
    expect(candidate.limitations.some((l) => l.includes("fail closed"))).toBe(
      true,
    );
    expect(plan.limitations.some((l) => l.includes("fail closed"))).toBe(true);

    const validate = await getValidator("cleanup-plan.schema.json");
    expect(validate(plan)).toBe(true);
  });

  it("(e) generated plans validate against cleanup-plan.schema.json", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: emptyLedger });
    const protection = await loadProtectionIndex(repo);
    const plan = buildCleanupPlan({
      plan_id: "safety-e",
      generated_at: "2026-08-28T00:00:00Z",
      repository,
      candidates: [
        perfectRedundancyDraft,
        {
          id: "keep-1",
          test_paths: ["test/keep.test.ts"],
          proposed_action: "KEEP",
          rationale: "Owner of a unique obligation.",
        },
        {
          id: "move-1",
          test_paths: ["test/slow.test.ts"],
          proposed_action: "MOVE_CANDIDATE",
          structural_signals: ["ev-slow"],
          rationale: "Slow test better placed on a nightly cadence.",
        },
      ],
      protection,
      limitations: ["Mutation evidence was unavailable and not required."],
    });
    const validate = await getValidator("cleanup-plan.schema.json");
    const valid = validate(plan);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe("packaged example reproduction", () => {
  async function reproduce(exampleFile: string): Promise<{
    example: CleanupPlan;
    plan: CleanupPlan;
  }> {
    const example = JSON.parse(
      await readFile(path.join(EXAMPLES_DIR, exampleFile), "utf8"),
    ) as CleanupPlan;
    const protection = await loadProtectionIndex(TASK_04_REPO);
    const drafts = example.candidates.map(
      (candidate: CleanupCandidate): CandidateDraft => {
        const { action, ...rest } = candidate;
        return { ...rest, proposed_action: action };
      },
    );
    const plan = buildCleanupPlan({
      plan_id: example.plan_id,
      generated_at: example.generated_at,
      repository: example.repository,
      candidates: drafts,
      protection,
      limitations: example.limitations,
    });
    return { example, plan };
  }

  it("(f) reproduces cleanup-delete-candidate.json from its inputs", async () => {
    const { example, plan } = await reproduce("cleanup-delete-candidate.json");
    expect(plan).toEqual(example);
    const validate = await getValidator("cleanup-plan.schema.json");
    expect(validate(plan)).toBe(true);
  });

  it("(f) reproduces cleanup-static-only-merge.json from its inputs", async () => {
    const { example, plan } = await reproduce("cleanup-static-only-merge.json");
    expect(plan).toEqual(example);
    const validate = await getValidator("cleanup-plan.schema.json");
    expect(validate(plan)).toBe(true);
  });
});
