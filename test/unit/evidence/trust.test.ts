import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConfigInvalidError,
  DISCOVERED_CONFIG_PATH,
  evaluatePlanStage,
  globToRegExp,
  loadTrust,
  stripOwnState,
} from "../../../src/evidence/verdict.js";
import type { RepositorySnapshot } from "../../../src/repository/git.js";
import { stewardConfig, writeConfigFile } from "./helpers.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "test-steward-trust-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("trust gate (TM-003)", () => {
  it("no configuration means untrusted advisory defaults", async () => {
    const trust = await loadTrust(repo);
    expect(trust.runRepositoryCommands).toBe(false);
    expect(trust.mode).toBe("advisory");
    expect(trust.explicit).toBe(false);
    expect(trust.limitations).toEqual([]);
  });

  it("an explicitly passed configuration grants execution trust", async () => {
    await writeConfigFile(repo, "steward.json", stewardConfig());
    const trust = await loadTrust(repo, "steward.json");
    expect(trust.runRepositoryCommands).toBe(true);
    expect(trust.mode).toBe("balanced");
    expect(trust.explicit).toBe(true);
  });

  it("a discovered repository configuration never grants execution", async () => {
    await writeConfigFile(repo, DISCOVERED_CONFIG_PATH, stewardConfig());
    const trust = await loadTrust(repo);
    expect(trust.runRepositoryCommands).toBe(false);
    expect(trust.mutationRequested).toBe(false);
    // Its inert policy data is still honored.
    expect(trust.mode).toBe("balanced");
    expect(
      trust.limitations.some((entry) => entry.includes("cannot grant")),
    ).toBe(true);
  });

  it("an invalid explicit configuration fails with a Configuration error", async () => {
    await writeFile(path.join(repo, "bad.json"), "{not json", "utf8");
    await expect(loadTrust(repo, "bad.json")).rejects.toThrow(
      ConfigInvalidError,
    );
    await expect(loadTrust(repo, "bad.json")).rejects.toThrow(/^Configuration/);
  });

  it("a schema-invalid explicit configuration is rejected", async () => {
    await writeConfigFile(repo, "bad-schema.json", {
      schema_version: "1.0",
      mode: "balanced",
    });
    await expect(loadTrust(repo, "bad-schema.json")).rejects.toThrow(
      /failed schema validation/,
    );
  });

  it("a config path escaping the repository is rejected", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "test-steward-out-"));
    try {
      await writeConfigFile(outside, "escape.json", stewardConfig());
      await symlink(
        path.join(outside, "escape.json"),
        path.join(repo, "link.json"),
      );
      await expect(loadTrust(repo, "link.json")).rejects.toThrow(
        /escapes the repository root/,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("an invalid discovered configuration degrades to a limitation", async () => {
    await writeConfigFile(repo, DISCOVERED_CONFIG_PATH, { broken: true });
    const trust = await loadTrust(repo);
    expect(trust.runRepositoryCommands).toBe(false);
    expect(trust.mode).toBe("advisory");
    expect(trust.limitations[0]).toContain("was ignored");
  });
});

function snapshotOf(
  files: Array<{ path: string; status?: "added" | "modified" }>,
): RepositorySnapshot {
  return {
    root: "/repo",
    baseRevision: "base",
    headRevision: "head",
    changedFiles: files.map((file) => ({
      path: file.path,
      status: file.status ?? "modified",
      binary: false,
    })),
    addedLines: 1,
    deletedLines: 0,
    dirty: true,
    gitVersion: null,
  };
}

const OBSERVED_AT = "2026-08-28T00:00:00Z";

describe("plan-level policy verdict", () => {
  it("documentation-only diffs allow (T0)", async () => {
    const trust = await loadTrust(repo);
    const plan = evaluatePlanStage({
      snapshot: snapshotOf([{ path: "docs/guide.md" }]),
      trust,
      observedAt: OBSERVED_AT,
      changedTestFiles: [],
      idPrefix: "t",
    });
    expect(plan.strongestAction).toBe("allow");
    expect(plan.strongestDecision?.outcome).toBe("NO_TEST_SUPPORTED");
  });

  it("declared critical path with material gap gates in balanced mode", async () => {
    await writeConfigFile(
      repo,
      "steward.json",
      stewardConfig({
        critical_paths: [
          {
            pattern: "src/payments/**",
            obligation_ids: ["OB-PAY-1"],
            materiality_floor: "T2",
          },
        ],
        declared_obligations: [
          {
            id: "OB-PAY-1",
            statement: "A charge is executed at most once.",
            source: "docs/policy.md",
            gate_policy: "balanced",
          },
        ],
      }),
    );
    const trust = await loadTrust(repo, "steward.json");
    const plan = evaluatePlanStage({
      snapshot: snapshotOf([{ path: "src/payments/charge.ts" }]),
      trust,
      observedAt: OBSERVED_AT,
      changedTestFiles: [],
      idPrefix: "t",
    });
    expect(plan.strongestAction).toBe("request_remediation");
    expect(plan.strongestDecision?.remediation).toBeTruthy();
    expect(
      plan.obligations.some(
        (obligation) => obligation.provenance === "declared",
      ),
    ).toBe(true);
  });

  it("the same declared gap only advises in advisory mode", async () => {
    await writeConfigFile(
      repo,
      "steward.json",
      stewardConfig({
        mode: "advisory",
        critical_paths: [
          {
            pattern: "src/payments/**",
            obligation_ids: ["OB-PAY-1"],
            materiality_floor: "T2",
          },
        ],
      }),
    );
    const trust = await loadTrust(repo, "steward.json");
    const plan = evaluatePlanStage({
      snapshot: snapshotOf([{ path: "src/payments/charge.ts" }]),
      trust,
      observedAt: OBSERVED_AT,
      changedTestFiles: [],
      idPrefix: "t",
    });
    expect(plan.strongestAction).toBe("advise");
  });

  it("inferred security naming never gates, even in strict mode", async () => {
    await writeConfigFile(
      repo,
      "steward.json",
      stewardConfig({ mode: "strict" }),
    );
    const trust = await loadTrust(repo, "steward.json");
    const plan = evaluatePlanStage({
      snapshot: snapshotOf([{ path: "src/auth/token.ts" }]),
      trust,
      observedAt: OBSERVED_AT,
      changedTestFiles: [],
      idPrefix: "t",
    });
    expect(plan.strongestAction).not.toBe("request_remediation");
  });
});

describe("state-dir filtering and glob matching", () => {
  it("stripOwnState removes .test-steward paths from the snapshot", () => {
    const stripped = stripOwnState(
      snapshotOf([
        { path: ".test-steward/reports/a.json" },
        { path: "src/a.ts" },
      ]),
    );
    expect(stripped.changedFiles.map((file) => file.path)).toEqual([
      "src/a.ts",
    ]);
  });

  it("globToRegExp interprets ** across directories and * within one", () => {
    expect(globToRegExp("src/**").test("src/a/b.ts")).toBe(true);
    expect(globToRegExp("src/**").test("lib/a.ts")).toBe(false);
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
    expect(globToRegExp("src/a+(b).ts").test("src/a+(b).ts")).toBe(true);
  });
});
