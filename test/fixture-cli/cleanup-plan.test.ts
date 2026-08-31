// Fixture-CLI acceptance: `cleanup-plan` against the materialized task-04
// repo — schema validity, ranking, ADR-006 safety, byte-determinism, and
// the task-04 hidden oracle via the fixtures harness.

import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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
import { stewardConfig, writeConfigFile } from "../unit/evidence/helpers.js";

const execFileAsync = promisify(execFile);

const ORACLE_DIR = fileURLToPath(
  new URL("../../spec/handoff/fixtures/task-04/oracle", import.meta.url),
);
const PROTECTED_PATH = "test/webhook-contract.test.ts";

interface Candidate {
  id: string;
  test_paths: string[];
  remove_paths: string[];
  retain_paths: string[];
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

const EMAIL_SOURCE = `export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
`;

const EMAIL_REPLAY_TEST = `import { describe, it } from 'vitest';
import { normalizeEmail } from '../src/email.js';

function fail(message: string): never {
  const error = new Error(message);
  error.stack = \`Error: \${message}\`;
  throw error;
}

describe('normalizeEmail', () => {
  it('trims and lowercases an email', () => {
    if (normalizeEmail('  Ada@Example.COM  ') !== 'ada@example.com') {
      fail('email normalization fault');
    }
  });
});
`;

const REPLAY_MODE_SOURCE = `export function replayMode(): string {
  return "clean";
}
`;

const REPLAY_MODE_TEST = `import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { normalizeEmail } from '../src/email.js';
import { replayMode } from '../src/replay-mode.js';

const testFile = fileURLToPath(import.meta.url);
const isExcludedTest = path.basename(testFile) === 'email-normalize-copy.test.ts';
const excludedTest = path.join(process.cwd(), 'test/email-normalize-copy.test.ts');
const dependencyMarker = path.join(
  process.cwd(),
  'node_modules/vitest/__DEPENDENCY_MARKER__',
);
const dependencyWriteLeaked = !isExcludedTest && existsSync(dependencyMarker);
if (!isExcludedTest) writeFileSync(dependencyMarker, 'scratch', 'utf8');
const mode = replayMode();

function fail(message: string): never {
  const error = new Error(message);
  error.stack = \`Error: \${message}\`;
  throw error;
}

describe('normalizeEmail', () => {
  it('trims and lowercases an email', () => {
    if (normalizeEmail('  Ada@Example.COM  ') !== 'ada@example.com') {
      fail('email normalization fault');
    }
  });

  it('uses an isolated retained scratch', () => {
    if (existsSync(excludedTest) !== isExcludedTest) {
      fail('retained scratch still contains the excluded test');
    }
    if (dependencyWriteLeaked) fail('dependency write leaked between scratches');
  });

  it('replays the historical fault', () => {
    if (mode === 'clean') return;
    if (mode === 'scratch') fail('scratch fault');

    if (mode === 'message') {
      fail('same heading ' + (isExcludedTest ? 'candidate' : 'retained'));
    }
  });
});
`;

const SERIAL_VITEST_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fileParallelism: false } });
`;

async function commitPaths(
  repository: string,
  message: string,
  paths: readonly string[],
): Promise<string> {
  await execFileAsync("git", ["-C", repository, "add", "-A", "--", ...paths]);
  await execFileAsync("git", ["-C", repository, "commit", "-q", "-m", message]);
  const { stdout } = await execFileAsync("git", [
    "-C",
    repository,
    "rev-parse",
    "HEAD",
  ]);
  return stdout.trim();
}

async function commitHistoricalFix(
  repository: string,
  changes: readonly {
    path: string;
    buggy: string;
    fixed: string;
  }[],
  label: string,
): Promise<{ fixCommit: string; parentCommit: string }> {
  await Promise.all(
    changes.map((change) =>
      writeFile(path.join(repository, change.path), change.buggy, "utf8"),
    ),
  );
  const paths = changes.map((change) => change.path);
  const parentCommit = await commitPaths(repository, `${label}: bug`, paths);
  await Promise.all(
    changes.map((change) =>
      writeFile(path.join(repository, change.path), change.fixed, "utf8"),
    ),
  );
  const fixCommit = await commitPaths(repository, `${label}: fix`, paths);
  return { fixCommit, parentCommit };
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
      "detestify",
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

  it("keeps static duplicate pairs nondirectional when ownership is unknown", () => {
    const duplicate = plan.candidates.find(
      (candidate) =>
        candidate.test_paths.includes("test/email-normalize-copy.test.ts") &&
        candidate.test_paths.includes("test/email-normalize.test.ts"),
    );
    expect(duplicate).toBeDefined();
    expect(duplicate?.remove_paths).toEqual([]);
    expect(duplicate?.retain_paths).toEqual([]);
  });

  it("preserves placement direction from covered to covering test", () => {
    const placement = plan.candidates.find(
      (candidate) =>
        candidate.test_paths.includes("test/webhook-unit.test.ts") &&
        candidate.test_paths.includes(PROTECTED_PATH),
    );
    expect(placement).toMatchObject({
      action: "MOVE_CANDIDATE",
      remove_paths: ["test/webhook-unit.test.ts"],
      retain_paths: [PROTECTED_PATH],
    });
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
        "detestify",
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

  it("derives a source-only replay from an ancestral fix commit", async () => {
    const emailSourcePath = "src/email.ts";
    const emailTestPaths = [
      "test/email-normalize-copy.test.ts",
      "test/email-normalize.test.ts",
    ];
    const fixedSource = await readFile(
      path.join(repoDir, emailSourcePath),
      "utf8",
    );
    const history = await commitHistoricalFix(
      repoDir,
      [
        {
          path: emailSourcePath,
          buggy: fixedSource.replace(
            "return value.trim().toLowerCase();",
            "return value.toLowerCase();",
          ),
          fixed: fixedSource,
        },
        ...emailTestPaths.map((testPath) => ({
          path: testPath,
          buggy: EMAIL_REPLAY_TEST.replace(
            "  Ada@Example.COM  ",
            "Ada@Example.COM",
          ),
          fixed: EMAIL_REPLAY_TEST,
        })),
      ],
      "email trim regression",
    );
    await symlink(
      path.resolve("node_modules"),
      path.join(repoDir, "node_modules"),
      "dir",
    );
    await mkdir(path.join(repoDir, ".detestify"), { recursive: true });
    await writeFile(
      path.join(repoDir, ".detestify", "protected-tests.json"),
      `${JSON.stringify({ schema_version: "1.0", tests: [] })}\n`,
    );
    const configPath = await writeConfigFile(
      repoDir,
      ".detestify/historical-config.json",
      stewardConfig({
        trusted_operations: {
          run_repository_commands: true,
          evaluate_repository_config: true,
          install_dependencies: false,
          network_access: true,
          mutation: true,
          create_hooks: false,
        },
        policy: { elevated_rule_ids: [], allow_delete_candidates: true },
      }),
    );
    const manifestPath = path.join(
      repoDir,
      ".detestify",
      "historical-faults.json",
    );
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        version: "1.0",
        faults: [
          {
            id: "EMAIL-TRIM-REGRESSION",
            obligation_ids: ["OBL-EMAIL-NORMALIZATION"],
            fix_commit: history.fixCommit,
            source_paths: [emailSourcePath],
            expected_failure_substring: "email normalization fault",
          },
        ],
      })}\n`,
      "utf8",
    );
    const statusBefore = await execFileAsync(
      "git",
      ["-C", repoDir, "status", "--porcelain=v1", "--untracked-files=all"],
      {},
    );
    const replayPlanPath = path.join(workDir, "cleanup-plan.historical.json");
    const replayReportPath = path.join(workDir, "report.historical.json");
    const duplicate = plan.candidates.find(
      (candidate) =>
        candidate.test_paths.includes("test/email-normalize-copy.test.ts") &&
        candidate.test_paths.includes("test/email-normalize.test.ts"),
    );
    expect(duplicate).toBeDefined();

    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let replayExit: number;
    try {
      replayExit = await main([
        "node",
        "detestify",
        "cleanup-plan",
        "--repo",
        repoDir,
        "--config",
        configPath,
        "--historical-faults",
        manifestPath,
        "--candidate",
        duplicate!.id,
        "--exclude-test",
        "test/email-normalize-copy.test.ts",
        "--json",
        replayPlanPath,
        "--report",
        replayReportPath,
      ]);
    } finally {
      spy.mockRestore();
    }

    const replayPlan = JSON.parse(
      await readFile(replayPlanPath, "utf8"),
    ) as Plan;
    const replayReport = JSON.parse(
      await readFile(replayReportPath, "utf8"),
    ) as {
      evidence: Array<{
        kind: string;
        status: string;
        source: { tool: string };
        data: {
          source_unchanged?: boolean;
          faults?: Array<{
            fix_commit: string;
            parent_commit: string;
            source_paths: string[];
            ignored_test_paths: string[];
            matching_expected_observable_keys: string[];
            source_binding: {
              candidate_only_paths: string[];
              retained_only_paths: string[];
              passed: boolean;
            };
            candidate_only: { expected_signature_observed: boolean };
            retained_only: { expected_signature_observed: boolean };
            preserved_by_replacement: boolean;
          }>;
        };
      }>;
    };
    const promoted = replayPlan.candidates.find(
      (candidate) => candidate.id === duplicate!.id,
    );
    const historical = replayReport.evidence.find(
      (evidence) => evidence.kind === "historical_fault",
    );
    const statusAfter = await execFileAsync(
      "git",
      ["-C", repoDir, "status", "--porcelain=v1", "--untracked-files=all"],
      {},
    );

    expect(replayExit).toBe(EXIT_CODES.OK);
    expect(
      promoted?.action,
      JSON.stringify({ promoted, historical }, null, 2),
    ).toBe("DELETE_CANDIDATE");
    expect(promoted?.independent_signals).toContainEqual(
      expect.stringMatching(/^ev-current-suite-reverse-patch:/),
    );
    expect(historical).toMatchObject({
      status: "observed",
      source: { tool: "detestify current-suite reverse-patch replay" },
      data: { source_unchanged: true },
    });
    expect(historical?.data.faults?.[0]).toMatchObject({
      fix_commit: history.fixCommit,
      parent_commit: history.parentCommit,
      source_paths: [emailSourcePath],
      ignored_test_paths: emailTestPaths,
      source_binding: {
        candidate_only_paths: [emailSourcePath],
        retained_only_paths: [emailSourcePath],
        passed: true,
      },
      candidate_only: { expected_signature_observed: true },
      retained_only: { expected_signature_observed: true },
      preserved_by_replacement: true,
    });
    expect(
      historical?.data.faults?.[0]?.matching_expected_observable_keys,
    ).toHaveLength(1);
    expect(JSON.stringify(historical)).not.toContain("diff --git");
    expect(historical?.data.faults?.[0]).not.toHaveProperty("patch");
    expect(statusAfter.stdout).toBe(statusBefore.stdout);
  }, 180_000);

  it("rejects different candidate-only and retained-only observables", async () => {
    const replayRepo = path.join(workDir, "replay-regression-repo");
    const appRoot = path.join(replayRepo, "packages", "app");
    const dependencyMarkerName = `.detestify-historical-replay-${path.basename(workDir)}`;
    const replayModeTest = REPLAY_MODE_TEST.replace(
      "__DEPENDENCY_MARKER__",
      dependencyMarkerName,
    );
    const replaySourcePath = "packages/app/src/replay-mode.ts";
    const replayTestPaths = [
      "packages/app/test/email-normalize-copy.test.ts",
      "packages/app/test/email-normalize.test.ts",
    ];
    await Promise.all([
      mkdir(path.join(appRoot, "src"), { recursive: true }),
      mkdir(path.join(appRoot, "test"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(replayRepo, ".gitignore"), "node_modules\n", "utf8"),
      writeFile(
        path.join(replayRepo, "package.json"),
        `${JSON.stringify({ name: "replay-workspace", private: true, workspaces: ["packages/*"] })}\n`,
        "utf8",
      ),
      writeFile(
        path.join(appRoot, "package.json"),
        `${JSON.stringify({ name: "replay-app", private: true, type: "module", devDependencies: { vitest: "3.2.7" } })}\n`,
        "utf8",
      ),
      writeFile(path.join(appRoot, "src", "email.ts"), EMAIL_SOURCE, "utf8"),
      writeFile(
        path.join(replayRepo, replaySourcePath),
        REPLAY_MODE_SOURCE,
        "utf8",
      ),
      writeFile(
        path.join(replayRepo, replayTestPaths[0]!),
        replayModeTest,
        "utf8",
      ),
      writeFile(
        path.join(replayRepo, replayTestPaths[1]!),
        replayModeTest,
        "utf8",
      ),
      writeFile(
        path.join(appRoot, "vitest.config.ts"),
        SERIAL_VITEST_CONFIG,
        "utf8",
      ),
    ]);
    await execFileAsync("git", ["-C", replayRepo, "init", "-q"]);
    await execFileAsync("git", [
      "-C",
      replayRepo,
      "config",
      "user.email",
      "fixture@detestify.local",
    ]);
    await execFileAsync("git", [
      "-C",
      replayRepo,
      "config",
      "user.name",
      "Fixture Materializer",
    ]);
    await commitPaths(replayRepo, "add replay regression fixture", [
      ".gitignore",
      "package.json",
      "packages/app/package.json",
      "packages/app/src/email.ts",
      replaySourcePath,
      ...replayTestPaths,
      "packages/app/vitest.config.ts",
    ]);
    const replayHistories = new Map<
      string,
      { fixCommit: string; parentCommit: string }
    >();
    for (const mode of ["scratch", "message"] as const) {
      replayHistories.set(
        mode,
        await commitHistoricalFix(
          replayRepo,
          [
            {
              path: replaySourcePath,
              buggy: REPLAY_MODE_SOURCE.replace('"clean"', `"${mode}"`),
              fixed: REPLAY_MODE_SOURCE,
            },
          ],
          `${mode} replay regression`,
        ),
      );
    }
    await symlink(
      path.resolve("node_modules"),
      path.join(appRoot, "node_modules"),
      "dir",
    );

    const candidatePlanPath = path.join(workDir, "replay-candidates.json");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let candidateExit: number;
    try {
      candidateExit = await main([
        "node",
        "detestify",
        "cleanup-plan",
        "--repo",
        replayRepo,
        "--json",
        candidatePlanPath,
      ]);
    } finally {
      stdout.mockRestore();
    }
    expect(candidateExit).toBe(EXIT_CODES.OK);
    const candidatePlan = JSON.parse(
      await readFile(candidatePlanPath, "utf8"),
    ) as Plan;
    const duplicate = candidatePlan.candidates.find(
      (candidate) =>
        candidate.test_paths.includes(replayTestPaths[0]!) &&
        candidate.test_paths.includes(replayTestPaths[1]!),
    );
    expect(duplicate).toBeDefined();

    const configPath = await writeConfigFile(
      replayRepo,
      ".detestify/historical-config.json",
      stewardConfig({
        trusted_operations: {
          run_repository_commands: true,
          evaluate_repository_config: true,
          install_dependencies: false,
          network_access: true,
          mutation: true,
          create_hooks: false,
        },
        policy: { elevated_rule_ids: [], allow_delete_candidates: true },
      }),
    );
    const manifestPath = path.join(
      replayRepo,
      ".detestify",
      "replay-regressions.json",
    );
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        version: "1.0",
        faults: [
          {
            id: "SCRATCH-ISOLATION",
            obligation_ids: ["OBL-SCRATCH-ISOLATION"],
            fix_commit: replayHistories.get("scratch")!.fixCommit,
            source_paths: [replaySourcePath],
            expected_failure_substring: "scratch fault",
          },
          {
            id: "DIFFERENT-OBSERVABLE",
            obligation_ids: ["OBL-DIFFERENT-OBSERVABLE"],
            fix_commit: replayHistories.get("message")!.fixCommit,
            source_paths: [replaySourcePath],
            expected_failure_substring: "same heading",
          },
        ],
      })}\n`,
      "utf8",
    );

    const replayPlanPath = path.join(workDir, "replay-regression-plan.json");
    const replayReportPath = path.join(
      workDir,
      "replay-regression-report.json",
    );
    const replayStdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const sourceDependencyMarker = path.join(
      path.resolve("node_modules"),
      "vitest",
      dependencyMarkerName,
    );
    await rm(sourceDependencyMarker, { force: true });
    let replayExit: number;
    let dependencyWriteLeaked = false;
    try {
      replayExit = await main([
        "node",
        "detestify",
        "cleanup-plan",
        "--repo",
        replayRepo,
        "--config",
        configPath,
        "--historical-faults",
        manifestPath,
        "--candidate",
        duplicate!.id,
        "--exclude-test",
        replayTestPaths[0]!,
        "--json",
        replayPlanPath,
        "--report",
        replayReportPath,
      ]);
    } finally {
      replayStdout.mockRestore();
      dependencyWriteLeaked = await readFile(
        sourceDependencyMarker,
        "utf8",
      ).then(
        () => true,
        () => false,
      );
      await rm(sourceDependencyMarker, { force: true });
    }

    const replayPlan = JSON.parse(
      await readFile(replayPlanPath, "utf8"),
    ) as Plan;
    const replayReport = JSON.parse(
      await readFile(replayReportPath, "utf8"),
    ) as {
      evidence: Array<{
        kind: string;
        status: string;
        data: {
          baseline?: {
            candidate_only: { passed: boolean };
            retained_only: { passed: boolean };
          };
          faults?: Array<{
            id: string;
            candidate_only: { detected: boolean };
            retained_only: { detected: boolean };
            matching_expected_observable_keys: string[];
            preserved_by_replacement: boolean;
          }>;
        };
      }>;
    };
    const historical = replayReport.evidence.find(
      (evidence) => evidence.kind === "historical_fault",
    );
    const faults = new Map(
      historical?.data.faults?.map((fault) => [fault.id, fault]),
    );

    expect(replayExit).toBe(EXIT_CODES.OK);
    expect(dependencyWriteLeaked).toBe(false);
    expect(
      replayPlan.candidates.find((candidate) => candidate.id === duplicate!.id)
        ?.action,
    ).not.toBe("DELETE_CANDIDATE");
    expect(historical).toMatchObject({
      status: "partial",
      data: {
        baseline: {
          candidate_only: { passed: true },
          retained_only: { passed: true },
        },
      },
    });
    expect(faults.size).toBe(2);
    expect(faults.get("SCRATCH-ISOLATION")).toMatchObject({
      candidate_only: { detected: true },
      retained_only: { detected: true },
      source_binding: {
        candidate_only_paths: [replaySourcePath],
        retained_only_paths: [replaySourcePath],
        passed: true,
      },
      preserved_by_replacement: true,
    });
    expect(
      faults.get("SCRATCH-ISOLATION")?.matching_expected_observable_keys,
    ).toHaveLength(1);
    expect(faults.get("DIFFERENT-OBSERVABLE")).toMatchObject({
      candidate_only: {
        detected: true,
        expected_signature_observed: true,
      },
      retained_only: {
        detected: true,
        expected_signature_observed: true,
      },
      matching_expected_observable_keys: [],
      preserved_by_replacement: false,
    });
    expect(JSON.stringify(historical)).not.toContain("retained detail");
  }, 180_000);

  it("rejects hand-written patches and non-full commit ids", async () => {
    const manifestPath = path.join(
      repoDir,
      ".detestify",
      "historical-faults-invalid.json",
    );
    const duplicate = plan.candidates.find(
      (candidate) =>
        candidate.test_paths.includes("test/email-normalize-copy.test.ts") &&
        candidate.test_paths.includes("test/email-normalize.test.ts"),
    )!;
    const invalidFaults = [
      {
        id: "HAND-WRITTEN-PATCH",
        obligation_ids: ["OBL-EMAIL-NORMALIZATION"],
        patch: "diff --git a/src/email.ts b/src/email.ts\n",
      },
      {
        id: "ABBREVIATED-COMMIT",
        obligation_ids: ["OBL-EMAIL-NORMALIZATION"],
        fix_commit: "a".repeat(12),
      },
      {
        id: "UPPERCASE-COMMIT",
        obligation_ids: ["OBL-EMAIL-NORMALIZATION"],
        fix_commit: "A".repeat(40),
      },
    ];
    for (const fault of invalidFaults) {
      await writeFile(
        manifestPath,
        `${JSON.stringify({ version: "1.0", faults: [fault] })}\n`,
        "utf8",
      );
      const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      let rejected: number;
      try {
        rejected = await main([
          "node",
          "detestify",
          "cleanup-plan",
          "--repo",
          repoDir,
          "--config",
          path.join(repoDir, ".detestify", "historical-config.json"),
          "--historical-faults",
          manifestPath,
          "--candidate",
          duplicate.id,
          "--exclude-test",
          "test/email-normalize-copy.test.ts",
        ]);
      } finally {
        stderr.mockRestore();
      }
      expect(rejected).toBe(EXIT_CODES.CONFIG_INVALID);
    }
  });
});
