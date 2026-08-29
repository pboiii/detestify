// Fixture-CLI acceptance: `cleanup-plan` against the materialized task-04
// repo — schema validity, ranking, ADR-006 safety, byte-determinism, and
// the task-04 hidden oracle via the fixtures harness.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { materializeFixture } from "../../scripts/materialize-fixtures.js";
import { cleanupExecDir, runHiddenVitest } from "../fixtures/harness.js";
import { main } from "../../src/cli/main.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";
import {
  formatSchemaErrors,
  getValidator,
} from "../../src/core/schemas/index.js";

const execFileAsync = promisify(execFile);

const ORACLE_DIR = fileURLToPath(
  new URL("../../spec/handoff/fixtures/task-04/oracle", import.meta.url),
);
const PROTECTED_PATH = "test/webhook-contract.test.ts";

interface Candidate {
  id: string;
  test_paths: string[];
  action: string;
  structural_signals: string[];
  independent_signals: string[];
  protected_checks: Array<{ passed: boolean }>;
  human_approval: { required: boolean };
}

interface Plan {
  plan_id: string;
  candidates: Candidate[];
}

let workDir: string;
let repoDir: string;
let exitCode: number;
let planPath: string;
let plan: Plan;
let report: { command: string; decisions: Array<{ outcome: string }> };
let stdoutText = "";

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "fixture-cli-cleanup-"));
  ({ repoDir } = await materializeFixture({
    taskId: "task-04",
    targetDir: path.join(workDir, "repo"),
  }));
  planPath = path.join(workDir, "cleanup-plan.json");
  const reportPath = path.join(workDir, "report.json");
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      stdoutText += String(chunk);
      return true;
    });
  try {
    exitCode = await main([
      "node",
      "test-steward",
      "cleanup-plan",
      "--repo",
      repoDir,
      "--json",
      planPath,
      "--report",
      reportPath,
    ]);
  } finally {
    spy.mockRestore();
  }
  plan = JSON.parse(await readFile(planPath, "utf8")) as Plan;
  report = JSON.parse(await readFile(reportPath, "utf8")) as typeof report;
}, 120_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
});

describe("cleanup-plan on task-04", () => {
  it("exits OK and the plan validates against cleanup-plan.schema.json", async () => {
    expect(exitCode).toBe(EXIT_CODES.OK);
    const validate = await getValidator("cleanup-plan.schema.json");
    expect(validate(plan), formatSchemaErrors(validate.errors)).toBe(true);
  });

  it("emits a valid report envelope for the command", async () => {
    const validate = await getValidator("report.schema.json");
    expect(validate(report), formatSchemaErrors(validate.errors)).toBe(true);
    expect(report.command).toBe("cleanup-plan");
  });

  it("ranks the exact duplicate as the strongest candidate", () => {
    const first = plan.candidates[0];
    expect(first?.test_paths).toEqual([
      "test/email-normalize-copy.test.ts",
      "test/email-normalize.test.ts",
    ]);
    expect(first?.structural_signals.length).toBeGreaterThanOrEqual(2);
  });

  it("never marks the protected test deletion-eligible", () => {
    const protectedCandidates = plan.candidates.filter((candidate) =>
      candidate.test_paths.includes(PROTECTED_PATH),
    );
    expect(protectedCandidates.length).toBeGreaterThan(0);
    for (const candidate of protectedCandidates) {
      expect(candidate.action).not.toBe("DELETE_CANDIDATE");
    }
  });

  it("never marks a static-only candidate deletion-eligible (ADR-006)", () => {
    for (const candidate of plan.candidates) {
      if (candidate.independent_signals.length === 0) {
        expect(candidate.action).not.toBe("DELETE_CANDIDATE");
      }
      if (candidate.action === "DELETE_CANDIDATE") {
        expect(candidate.structural_signals.length).toBeGreaterThan(0);
        expect(candidate.independent_signals.length).toBeGreaterThan(0);
        expect(candidate.protected_checks.every((check) => check.passed)).toBe(
          true,
        );
      }
      expect(candidate.human_approval.required).toBe(true);
    }
    for (const decision of report.decisions) {
      expect(decision.outcome).not.toBe("DELETE_CANDIDATE");
    }
  });

  it("prints the ranked summary with the human-approval banner", () => {
    expect(stdoutText).toContain("HUMAN APPROVAL REQUIRED");
    expect(stdoutText).toContain("no apply command");
    expect(stdoutText).toContain("test/email-normalize-copy.test.ts");
  });

  it("has no destructive capability: the fixture tree is untouched", async () => {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoDir, "status", "--porcelain=v1"],
      {},
    );
    expect(stdout.trim()).toBe("");
  });

  it("is byte-identical across repeated runs on an unchanged tree", async () => {
    const secondPath = path.join(workDir, "cleanup-plan.second.json");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let secondExit: number;
    try {
      secondExit = await main([
        "node",
        "test-steward",
        "cleanup-plan",
        "--repo",
        repoDir,
        "--json",
        secondPath,
      ]);
    } finally {
      spy.mockRestore();
    }
    expect(secondExit).toBe(EXIT_CODES.OK);
    const [first, second] = await Promise.all([
      readFile(planPath),
      readFile(secondPath),
    ]);
    expect(first.equals(second)).toBe(true);
  }, 120_000);

  it("satisfies the task-04 hidden oracle via the fixtures harness", async () => {
    const result = await runHiddenVitest(
      repoDir,
      ORACLE_DIR,
      ["cleanup-plan.hidden.test.ts"],
      { env: { TEST_STEWARD_CLEANUP_PLAN: planPath }, timeoutMs: 120_000 },
    );
    try {
      expect(
        result.passed,
        `${result.stdout.slice(-2000)}\n${result.stderr.slice(-2000)}`,
      ).toBe(true);
    } finally {
      await cleanupExecDir(result.execDir);
    }
  }, 180_000);
});
