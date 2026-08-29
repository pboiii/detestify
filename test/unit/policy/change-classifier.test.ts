// Deterministic change classifier: path and boundary facts map to CHG
// change classes with explicit confidence; what this layer cannot establish
// is reported as a limitation, never asserted.

import { describe, expect, it } from "vitest";
import {
  classifyChangeSet,
  type ChangeClassifierInput,
} from "../../../src/analysis/change-classifier.js";
import type { ChangedFile } from "../../../src/repository/git.js";
import type { BoundariesAnalysis } from "../../../src/analysis/boundaries.js";

function changed(
  path: string,
  status: ChangedFile["status"] = "modified",
): ChangedFile {
  return { path, status, binary: false };
}

function boundaries(
  facts: BoundariesAnalysis["boundaries"],
): BoundariesAnalysis {
  return { boundaries: facts, unreadableFiles: [] };
}

function ruleIds(input: ChangeClassifierInput): string[] {
  return classifyChangeSet(input).classes.map((c) => c.ruleId);
}

describe("classifyChangeSet", () => {
  it("classifies documentation-only change sets as CHG-001 with high confidence", () => {
    const result = classifyChangeSet({
      changedFiles: [changed("README.md"), changed("docs/guide.md")],
    });
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toMatchObject({
      ruleId: "CHG-001",
      provenance: "derived",
      confidence: "high",
      paths: ["README.md", "docs/guide.md"],
    });
  });

  it("maps boundary facts onto CHG-006/007/010/011", () => {
    const ids = ruleIds({
      changedFiles: [
        changed("db/migrations/001-users.sql"),
        changed("generated/client.ts"),
        changed(".github/workflows/ci.yml"),
        changed("src/routes/users.ts"),
      ],
      boundaries: boundaries([
        { file: "db/migrations/001-users.sql", kind: "migration" },
        { file: "generated/client.ts", kind: "generated-code" },
        { file: ".github/workflows/ci.yml", kind: "config" },
        { file: "src/routes/users.ts", kind: "route-registration" },
      ]),
    });
    expect(ids).toEqual(
      expect.arrayContaining(["CHG-006", "CHG-007", "CHG-010", "CHG-011"]),
    );
  });

  it("treats dependency manifest changes as CHG-006 boundary changes", () => {
    expect(ruleIds({ changedFiles: [changed("package.json")] })).toContain(
      "CHG-006",
    );
  });

  it("classifies added non-boundary source files as CHG-004 with a purity limitation", () => {
    const result = classifyChangeSet({
      changedFiles: [changed("src/discount.ts", "added")],
    });
    expect(result.classes.map((c) => c.ruleId)).toContain("CHG-004");
    expect(result.limitations).toContain(
      "Purity of new behavior is not proven; hidden I/O is possible.",
    );
  });

  it("marks name-only security and concurrency signals as inferred low confidence", () => {
    const result = classifyChangeSet({
      changedFiles: [
        changed("src/auth/session.ts"),
        changed("src/queue/worker.ts"),
      ],
    });
    const security = result.classes.find((c) => c.ruleId === "CHG-009");
    const concurrency = result.classes.find((c) => c.ruleId === "CHG-008");
    expect(security).toMatchObject({
      provenance: "inferred",
      confidence: "low",
    });
    expect(concurrency).toMatchObject({
      provenance: "inferred",
      confidence: "low",
    });
  });

  it("asserts CHG-005 only when a reproduced failure is supplied", () => {
    const without = classifyChangeSet({
      changedFiles: [changed("src/parser.ts")],
    });
    expect(without.classes.map((c) => c.ruleId)).not.toContain("CHG-005");
    expect(without.limitations.some((l) => l.startsWith("CHG-005"))).toBe(true);

    const withFailure = classifyChangeSet({
      changedFiles: [changed("src/parser.ts")],
      observedFailurePaths: ["src/parser.ts"],
    });
    const chg005 = withFailure.classes.find((c) => c.ruleId === "CHG-005");
    expect(chg005).toMatchObject({
      provenance: "observed",
      confidence: "high",
    });
  });

  it("reports CHG-002/CHG-003 as unsupported for source changes instead of guessing", () => {
    const result = classifyChangeSet({
      changedFiles: [changed("src/format.ts")],
    });
    expect(result.classes.map((c) => c.ruleId)).not.toContain("CHG-002");
    expect(result.classes.map((c) => c.ruleId)).not.toContain("CHG-003");
    expect(result.limitations.join("\n")).toMatch(/CHG-002/);
    expect(result.limitations.join("\n")).toMatch(/CHG-003/);
  });

  it("reports an empty change set as a limitation", () => {
    expect(classifyChangeSet({ changedFiles: [] })).toEqual({
      classes: [],
      limitations: ["The change set is empty."],
    });
  });
});
