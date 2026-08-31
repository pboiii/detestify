// Fixture-CLI acceptance: `inventory` against the materialized task-04 repo.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materializeFixture } from "../../scripts/materialize-fixtures.js";
import { main } from "../../src/cli/main.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";
import {
  formatSchemaErrors,
  getValidator,
} from "../../src/core/schemas/index.js";

const execFileAsync = promisify(execFile);

const EXPECTED_TEST_FILES = [
  "test/email-normalize-copy.test.ts",
  "test/email-normalize-similar.test.ts",
  "test/email-normalize.test.ts",
  "test/legacy-v1.test.ts",
  "test/webhook-contract.test.ts",
  "test/webhook-unit.test.ts",
];

interface Report {
  command: string;
  change: { test_paths: string[] };
  capabilities: { runner: string; network_used: boolean };
  evidence: Array<{
    id: string;
    kind: string;
    findings: Array<{ code: string; paths: string[] }>;
    data: Record<string, unknown>;
  }>;
  decisions: Array<{ domain: string; gate_action: string }>;
}

let workDir: string;
let repoDir: string;
let exitCode: number;
let report: Report;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "fixture-cli-inventory-"));
  ({ repoDir } = await materializeFixture({
    taskId: "task-04",
    targetDir: path.join(workDir, "repo"),
  }));
  const jsonPath = path.join(workDir, "inventory.json");
  exitCode = await main([
    "node",
    "detestify",
    "inventory",
    "--repo",
    repoDir,
    "--json",
    jsonPath,
  ]);
  report = JSON.parse(await readFile(jsonPath, "utf8")) as Report;
}, 120_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
});

describe("inventory on task-04", () => {
  it("exits OK and validates against report.schema.json", async () => {
    expect(exitCode).toBe(EXIT_CODES.OK);
    const validate = await getValidator("report.schema.json");
    expect(validate(report), formatSchemaErrors(validate.errors)).toBe(true);
    expect(report.command).toBe("inventory");
  });

  it("finds all 6 fixture test files", () => {
    expect([...report.change.test_paths].sort()).toEqual(EXPECTED_TEST_FILES);
    const inventory = report.evidence.find(
      (record) => record.id === "ev-test-inventory",
    );
    const files = (
      inventory?.data["test_files"] as Array<{ file: string }>
    ).map((entry) => entry.file);
    expect(files.sort()).toEqual(EXPECTED_TEST_FILES);
  });

  it("records suites, imports, and framework markers", () => {
    const inventory = report.evidence.find(
      (record) => record.id === "ev-test-inventory",
    );
    const files = inventory?.data["test_files"] as Array<{
      file: string;
      suites: number;
      tests: number;
      imports: Array<{ specifier: string; to: string | null }>;
    }>;
    const normalize = files.find(
      (entry) => entry.file === "test/email-normalize.test.ts",
    );
    expect(normalize?.suites).toBe(1);
    expect(normalize?.tests).toBe(1);
    expect(normalize?.imports.some((edge) => edge.to === "src/email.ts")).toBe(
      true,
    );

    expect(report.capabilities.runner).toBe("vitest");
    const runner = report.evidence.find(
      (record) => record.id === "ev-runner-inventory",
    );
    expect(runner?.kind).toBe("runner_inventory");
    expect(
      runner?.findings.some(
        (finding) =>
          finding.code === "RUNNER_MARKER" &&
          finding.paths.includes("package.json"),
      ),
    ).toBe(true);
  });

  it("is read-only and offline", async () => {
    expect(report.capabilities.network_used).toBe(false);
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoDir, "status", "--porcelain=v1"],
      {},
    );
    expect(stdout.trim()).toBe("");
  });
});
