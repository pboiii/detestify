// Runner security proofs (TM-003, TM-009, TM-015, TM-016): hostile
// package.json scripts never execute, a timed-out runner's whole process
// group is killed, and a mid-run worktree mutation is detected as a stale
// receipt fingerprint.

import { CommanderError } from "commander";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run as runVerifyChange } from "../../src/cli/commands/verify-change.js";
import { runJest } from "../../src/evidence/runners/jest.js";
import { runFixedArgv } from "../../src/evidence/runners/process.js";
import { buildReceipt, stateDirectory } from "../../src/evidence/receipts.js";
import { runVitest } from "../../src/evidence/runners/vitest.js";
import type { RunnerInvocation } from "../../src/evidence/runners/vitest.js";
import { snapshotRepository } from "../../src/repository/git.js";
import { fingerprintDiff } from "../../src/repository/fingerprint.js";
import { stripOwnState } from "../../src/evidence/verdict.js";
import {
  initGitRepo,
  stewardConfig,
  writeConfigFile,
} from "../unit/evidence/helpers.js";

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "test-steward-runner-sec-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
}

async function runResultFileAttack(
  runner: "vitest" | "jest",
  attack: "oversized" | "escaping-symlink",
): Promise<RunnerInvocation> {
  const repo = path.join(scratch, `${runner}-${attack}`);
  const entry = path.join(
    repo,
    runner === "vitest"
      ? "node_modules/vitest/vitest.mjs"
      : "node_modules/jest/bin/jest.js",
  );
  await mkdir(path.dirname(entry), { recursive: true });
  await mkdir(path.join(repo, "test"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), "{}", "utf8");
  await writeFile(path.join(repo, "test", "a.test.ts"), "", "utf8");
  const outputSetup =
    runner === "vitest"
      ? 'import { symlinkSync, writeFileSync } from "node:fs";'
      : 'const { symlinkSync, writeFileSync } = require("node:fs");';
  const resultFileAction =
    attack === "oversized"
      ? "writeFileSync(output, Buffer.alloc(8 * 1024 * 1024 + 1, 0x61));"
      : 'symlinkSync("/dev/zero", output);';
  await writeFile(
    entry,
    `${outputSetup}
const outputArg = process.argv.find((arg) => arg.startsWith("--outputFile="));
if (outputArg === undefined) throw new Error("missing output file");
const output = outputArg.slice("--outputFile=".length);
${resultFileAction}
`,
    "utf8",
  );
  const options = {
    repoRoot: repo,
    testFiles: ["test/a.test.ts"],
    timeoutMs: 5_000,
  };
  return runner === "vitest" ? runVitest(options) : runJest(options);
}

describe("hostile package.json scripts never run (TM-003/TM-009)", () => {
  it("an explicit partial grant cannot launch repository code", async () => {
    const repo = path.join(scratch, "partial-grant");
    const canary = path.join(scratch, "partial-grant-ran");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await mkdir(path.join(repo, "test"), { recursive: true });
    await mkdir(path.join(repo, "node_modules", "vitest"), {
      recursive: true,
    });
    await writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({
        name: "partial-grant",
        private: true,
        devDependencies: { vitest: "1.0.0" },
      }),
    );
    await writeFile(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(
      path.join(repo, "test", "a.test.ts"),
      "test('a', () => {});\n",
    );
    await writeFile(
      path.join(repo, "node_modules", "vitest", "vitest.mjs"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(canary)}, "ran");\n`,
    );
    await initGitRepo(repo);
    await writeFile(path.join(repo, "src", "a.ts"), "export const a = 2;\n");

    const baseConfig = stewardConfig({ mode: "advisory" });
    const configPath = await writeConfigFile(repo, "steward.json", {
      ...baseConfig,
      trusted_operations: {
        ...(baseConfig["trusted_operations"] as Record<string, unknown>),
        evaluate_repository_config: false,
      },
    });
    const reportPath = path.join(scratch, "partial-grant-report.json");
    await runVerifyChange({ repo, config: configPath, report: reportPath });

    await expect(access(canary)).rejects.toThrow();
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      capabilities: {
        repository_commands_trusted: boolean;
        network_used: boolean;
      };
      limitations: string[];
    };
    expect(report.capabilities.repository_commands_trusted).toBe(false);
    expect(report.capabilities.network_used).toBe(false);
    expect(
      report.limitations.some((entry) => entry.includes("report-only")),
    ).toBe(true);
  }, 30_000);

  it("trusted verify-change never falls back to npm scripts", async () => {
    const repo = path.join(scratch, "hostile");
    const canary = path.join(scratch, "canary-pwned");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await mkdir(path.join(repo, "test"), { recursive: true });
    await writeFile(
      path.join(repo, "package.json"),
      JSON.stringify(
        {
          name: "hostile-fixture",
          private: true,
          type: "module",
          scripts: {
            preinstall: `node -e "require('node:fs').writeFileSync(${JSON.stringify(canary)}, 'pwned')"`,
            pretest: `node -e "require('node:fs').writeFileSync(${JSON.stringify(canary)}, 'pwned')"`,
            test: `node -e "require('node:fs').writeFileSync(${JSON.stringify(canary)}, 'pwned')"`,
          },
          devDependencies: { vitest: "^3.0.0" },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(repo, "src", "adder.ts"),
      "export const add = (a: number, b: number): number => a + b;\n",
      "utf8",
    );
    await writeFile(
      path.join(repo, "test", "adder.test.ts"),
      "import { it } from 'vitest';\nit('adds', () => {});\n",
      "utf8",
    );
    await initGitRepo(repo);
    // A change after the baseline so there is something to verify.
    await writeFile(
      path.join(repo, "src", "adder.ts"),
      "export const add = (a: number, b: number): number => b + a;\n",
      "utf8",
    );
    const configPath = await writeConfigFile(
      repo,
      "steward.json",
      stewardConfig(),
    );

    // Vitest is declared but not installed: the fixed-argv adapter reports
    // the tool unavailable instead of ever invoking `npm test`.
    let exitCode: number | null = null;
    try {
      await runVerifyChange({ repo, config: configPath });
    } catch (error) {
      expect(error).toBeInstanceOf(CommanderError);
      exitCode = (error as CommanderError).exitCode;
    }
    expect(exitCode).toBe(7); // EXTERNAL_TOOL_UNAVAILABLE

    await expect(access(canary)).rejects.toThrow();

    // The report still exists and discloses the limitation.
    const reportsDir = path.join(stateDirectory(repo), "reports");
    const { readdir } = await import("node:fs/promises");
    const reports = (await readdir(reportsDir)).filter(
      (name) => name.endsWith(".json") && !name.startsWith("."),
    );
    expect(reports.length).toBe(1);
    const report = JSON.parse(
      await readFile(path.join(reportsDir, reports[0]!), "utf8"),
    ) as { limitations: string[] };
    expect(
      report.limitations.some((entry) => entry.includes("workspace-local")),
    ).toBe(true);
  }, 30_000);
});

describe("runner result files stay bounded and contained", () => {
  for (const runner of ["vitest", "jest"] as const) {
    for (const attack of ["oversized", "escaping-symlink"] as const) {
      it(`${runner} returns no results for an ${attack} result file`, async () => {
        const invocation = await runResultFileAttack(runner, attack);

        expect(invocation.outcome.exitCode).toBe(0);
        expect(invocation.results).toBeNull();
      }, 30_000);
    }
  }
});

describe("runner timeout kills the whole process group (TM-016)", () => {
  it("SIGKILLs the runner and its spawned descendants", async () => {
    const pidFile = path.join(scratch, "descendant.pid");
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
      "fs.writeFileSync(process.argv[1], String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join("\n");

    const outcome = await runFixedArgv({
      file: process.execPath,
      args: ["-e", script, pidFile],
      cwd: scratch,
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 1_000,
    });

    expect(outcome.timedOut).toBe(true);
    expect(outcome.processGroupKilled).toBe(true);
    expect(outcome.spawnError).toBeNull();

    const descendantPid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
    expect(Number.isInteger(descendantPid)).toBe(true);
    const descendantDead = await waitFor(() => !isAlive(descendantPid), 3_000);
    expect(descendantDead).toBe(true);
  }, 15_000);
});

describe("stale fingerprint detection (TM-004/TM-015)", () => {
  it("a worktree mutation between start and end invalidates the receipt", async () => {
    const repo = path.join(scratch, "stale");
    await mkdir(repo, { recursive: true });
    await writeFile(path.join(repo, "a.ts"), "export const a = 1;\n", "utf8");
    await initGitRepo(repo);
    await writeFile(path.join(repo, "a.ts"), "export const a = 2;\n", "utf8");

    const startFp = (
      await fingerprintDiff(stripOwnState(await snapshotRepository(repo)))
    ).fingerprint;

    // TOCTOU mutation while "verification" runs.
    await writeFile(path.join(repo, "a.ts"), "export const a = 3;\n", "utf8");
    const endFp = (
      await fingerprintDiff(stripOwnState(await snapshotRepository(repo)))
    ).fingerprint;
    expect(endFp).not.toBe(startFp);

    const invocation: RunnerInvocation = {
      runner: "vitest",
      version: null,
      argv: [process.execPath, "vitest.mjs", "run"],
      cwd: repo,
      testFiles: [],
      outcome: {
        exitCode: 0,
        timedOut: false,
        outputTruncated: false,
        processGroupKilled: false,
        stdout: "",
        stderr: "",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 10,
        spawnError: null,
      },
      results: {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        failures: [],
        success: true,
      },
    };
    const receipt = buildReceipt({
      invocation,
      repoRoot: repo,
      baseRevision: null,
      headRevision: null,
      timeoutMs: 1_000,
      envKeys: [],
      policyFingerprint: startFp,
      diffFingerprintStart: startFp,
      diffFingerprintEnd: endFp,
      selectionComplete: true,
    });
    // A fully passing run still may not claim verification on a mutated tree.
    expect(receipt.stale).toBe(true);
    expect(receipt.passed).toBe(false);

    const unchanged = buildReceipt({
      invocation,
      repoRoot: repo,
      baseRevision: null,
      headRevision: null,
      timeoutMs: 1_000,
      envKeys: [],
      policyFingerprint: startFp,
      diffFingerprintStart: endFp,
      diffFingerprintEnd: endFp,
      selectionComplete: true,
    });
    expect(unchanged.stale).toBe(false);
    expect(unchanged.passed).toBe(true);
  }, 30_000);
});
