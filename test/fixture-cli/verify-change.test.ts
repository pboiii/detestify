// Fixture-CLI proof for M5 (task-03): trusted verify-change runs the
// fixture's own Vitest tests with focused selection, records a failing
// receipt on the buggy committed baseline, and records a passing receipt
// after the documented fix (release a failed claim) is applied.

import { CommanderError } from "commander";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materializeFixture } from "../../scripts/materialize-fixtures.js";
import { run as runVerifyChange } from "../../src/cli/commands/verify-change.js";
import { latestReceipt, stateDirectory } from "../../src/evidence/receipts.js";
import { getValidator } from "../../src/core/schemas/index.js";
import {
  initGitRepo,
  stewardConfig,
  writeConfigFile,
} from "../unit/evidence/helpers.js";

const execFileAsync = promisify(execFile);

/**
 * The retry contract the completed change adds: a failed handler must release
 * its claim so one retry processes and later duplicates are suppressed. This
 * fails on the buggy baseline (the claim is never released) and passes after
 * the documented fix.
 */
const RETRY_TEST = `import { describe, expect, it, vi } from 'vitest';
import { MemoryEventStore } from '../src/event-store.js';
import { processWebhook } from '../src/webhook.js';

const payload = JSON.stringify({ id: 'evt-retry', value: 7 });

describe('webhook retry contract', () => {
  it('releases a failed claim so one retry can process', async () => {
    const store = new MemoryEventStore();
    await expect(processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: vi.fn().mockRejectedValue(new Error('temporary failure')),
    })).rejects.toThrow('temporary failure');
    expect(store.isClaimed('evt-retry')).toBe(false);

    await expect(processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: vi.fn().mockResolvedValue(undefined),
    })).resolves.toEqual({ status: 'processed' });
  });
});
`;

/** The documented fix: release the claim when the handler fails. */
const BUGGY_HANDLE_BLOCK = `  await dependencies.handle(event);
  await dependencies.store.markProcessed(event.id);
  return { status: 'processed' };`;
const FIXED_HANDLE_BLOCK = `  try {
    await dependencies.handle(event);
  } catch (error) {
    await dependencies.store.release(event.id);
    throw error;
  }
  await dependencies.store.markProcessed(event.id);
  return { status: 'processed' };`;

let base: string;
let repoDir: string;
let configPath: string;

interface Report {
  readonly command: string;
  readonly repository: { readonly diff_fingerprint: string };
  readonly capabilities: {
    readonly runner: string;
    readonly coverage: string;
    readonly mutation: string;
    readonly repository_commands_trusted: boolean;
    readonly network_used: boolean;
  };
  readonly change: { readonly test_paths: readonly string[] };
  readonly evidence: ReadonlyArray<{
    readonly kind: string;
    readonly id: string;
    readonly findings?: ReadonlyArray<{ readonly code: string }>;
    readonly gate_trust?: string;
  }>;
  readonly decisions: ReadonlyArray<{
    readonly gate_action: string;
    readonly reason_code: string;
    readonly outcome: string;
  }>;
  readonly limitations: readonly string[];
}

async function verifyChange(): Promise<{
  exitCode: number;
  report: Report;
}> {
  const reportPath = path.join(
    base,
    `report-${Date.now()}-${Math.random()}.json`,
  );
  let exitCode = 0;
  try {
    await runVerifyChange({
      repo: repoDir,
      config: configPath,
      report: reportPath,
    });
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }
    exitCode = error.exitCode;
  }
  const report = JSON.parse(await readFile(reportPath, "utf8")) as Report;
  return { exitCode, report };
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "test-steward-vc-t03-"));
  const materialized = await materializeFixture({
    taskId: "task-03",
    targetDir: path.join(base, "repo"),
  });
  repoDir = materialized.repoDir;

  // Keep dependency resolution out of the diff, then commit the ignore file
  // into the baseline so the analyzed change stays the agent's change.
  await writeFile(path.join(repoDir, ".gitignore"), "node_modules\n", "utf8");
  await execFileAsync("git", ["add", ".gitignore"], { cwd: repoDir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=f@x",
      "-c",
      "user.name=f",
      "commit",
      "-q",
      "-m",
      "ignore",
    ],
    { cwd: repoDir },
  );

  // The fixture declares vitest but fixtures are never installed; link the
  // project's own installation the way a real repo would have one.
  await symlink(
    path.resolve("node_modules"),
    path.join(repoDir, "node_modules"),
  );

  configPath = await writeConfigFile(
    repoDir,
    ".detestify/config.json",
    stewardConfig({ mode: "balanced" }),
  );

  // The completed change under verification: the new retry contract test.
  await writeFile(
    path.join(repoDir, "test", "webhook-retry.test.ts"),
    RETRY_TEST,
    "utf8",
  );
}, 120_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("task-03 trusted verify-change", () => {
  it("produces a failing receipt on the buggy baseline and requests remediation", async () => {
    const { exitCode, report } = await verifyChange();

    expect(exitCode).toBe(20); // REMEDIATION_REQUIRED
    expect(report.command).toBe("verify-change");
    expect(report.capabilities.runner).toBe("vitest");
    expect(report.capabilities.repository_commands_trusted).toBe(true);
    expect(report.capabilities.network_used).toBe(true);

    const verdict = report.decisions[0];
    expect(verdict).toMatchObject({
      reason_code: "VERIFICATION_FAILED",
      gate_action: "request_remediation",
      outcome: "EXISTING_TEST_UPDATE_CANDIDATE",
    });

    const found = await latestReceipt(stateDirectory(repoDir));
    expect(found).not.toBeNull();
    const receipt = found!.receipt;
    expect(receipt.runner).toBe("vitest");
    expect(receipt.stale).toBe(false);
    expect(receipt.passed).toBe(false);
    expect(receipt.results?.failed).toBeGreaterThan(0);
    expect(
      receipt.results?.failures.some((failure) =>
        failure.name.includes("releases a failed claim"),
      ),
    ).toBe(true);
    // Focused selection: only the changed test file ran.
    expect(receipt.selected_test_files).toEqual(["test/webhook-retry.test.ts"]);
    expect(receipt.command.argv.join(" ")).toContain("vitest.mjs run");
    expect(receipt.diff_fingerprint_start).toBe(
      report.repository.diff_fingerprint,
    );

    // The report carries the receipt as runtime evidence and validates.
    expect(report.evidence.some((record) => record.kind === "runtime")).toBe(
      true,
    );
    const validate = await getValidator("report.schema.json");
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  }, 120_000);

  it("passes after the documented fix patch and allows with a receipt", async () => {
    const webhookPath = path.join(repoDir, "src", "webhook.ts");
    const source = await readFile(webhookPath, "utf8");
    expect(source).toContain(BUGGY_HANDLE_BLOCK);
    await writeFile(
      webhookPath,
      source.replace(BUGGY_HANDLE_BLOCK, FIXED_HANDLE_BLOCK),
      "utf8",
    );

    const { exitCode, report } = await verifyChange();

    expect(exitCode).toBe(0);
    const verdict = report.decisions[0];
    expect(verdict).toMatchObject({
      reason_code: "VERIFIED_WITH_RECEIPT",
      gate_action: "allow",
      outcome: "NO_TEST_SUPPORTED",
    });

    const found = await latestReceipt(stateDirectory(repoDir));
    const receipt = found!.receipt;
    expect(receipt.passed).toBe(true);
    expect(receipt.stale).toBe(false);
    expect(receipt.results?.failed).toBe(0);
    // Affected selection now includes the source's importing tests too.
    expect(receipt.selected_test_files).toEqual([
      "test/webhook-retry.test.ts",
      "test/webhook.test.ts",
    ]);

    // Optional evidence stayed absent-by-request, disclosed, not inferred.
    expect(report.capabilities.coverage).toBe("not_requested");
    expect(report.capabilities.mutation).toBe("not_requested");
  }, 120_000);

  it("treats a capped affected-test selection as insufficient evidence", async () => {
    const cappedTests = path.join(repoDir, "test", "capped");
    await mkdir(cappedTests);
    await Promise.all(
      Array.from({ length: 201 }, (_, index) =>
        writeFile(
          path.join(cappedTests, `affected-${index}.test.ts`),
          `import { describe, expect, it } from 'vitest';\nimport { processWebhook } from '../../src/webhook.js';\ndescribe('affected ${index}', () => it('passes', () => expect(processWebhook).toBeTypeOf('function')));\n`,
          "utf8",
        ),
      ),
    );

    const { exitCode, report } = await verifyChange();

    expect(exitCode).toBe(0);
    expect(report.decisions[0]).toMatchObject({
      reason_code: "SELECTION_CAPPED",
      gate_action: "advise",
      outcome: "INSUFFICIENT_EVIDENCE",
    });

    const receipt = (await latestReceipt(stateDirectory(repoDir)))!.receipt;
    expect(receipt.selected_test_files).toHaveLength(200);
    expect(receipt.selection_complete).toBe(false);
    expect(receipt.results?.failed).toBe(0);
    expect(receipt.passed).toBe(false);
    expect(receipt.limitations.some((entry) => entry.includes("capped"))).toBe(
      true,
    );
  }, 120_000);

  it("without explicit trust the same repo is report-only and runs nothing", async () => {
    const reportPath = path.join(base, "report-untrusted.json");
    let exitCode = 0;
    try {
      // No --config: the discovered .detestify/config.json cannot grant
      // execution trust (TM-003).
      await runVerifyChange({ repo: repoDir, report: reportPath });
    } catch (error) {
      exitCode = (error as CommanderError).exitCode;
    }
    expect(exitCode).toBe(0);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Report;
    expect(report.capabilities.repository_commands_trusted).toBe(false);
    expect(report.capabilities.network_used).toBe(false);
    expect(report.evidence.some((record) => record.kind === "runtime")).toBe(
      false,
    );
    expect(
      report.limitations.some((entry) => entry.includes("report-only")),
    ).toBe(true);
  }, 60_000);
});

describe("workspace-local verify-change evidence", () => {
  it("runs from the selected package and rejects an omitted selected file", async () => {
    const workspaceRepo = path.join(base, "workspace-repo");
    const workspace = path.join(workspaceRepo, "apps", "api");
    await mkdir(path.join(workspace, "node_modules", "vitest"), {
      recursive: true,
    });
    await writeFile(path.join(workspaceRepo, ".gitignore"), "node_modules\n");
    await writeFile(path.join(workspaceRepo, "package.json"), "{}");
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({
        type: "module",
        devDependencies: { vitest: "1.0.0" },
      }),
    );
    await writeFile(
      path.join(workspace, "node_modules", "vitest", "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    await writeFile(
      path.join(workspace, "node_modules", "vitest", "vitest.mjs"),
      `import { writeFileSync } from "node:fs";
import path from "node:path";
const output = process.argv.find((arg) => arg.startsWith("--outputFile="))?.slice("--outputFile=".length);
if (output === undefined) throw new Error("missing output");
writeFileSync(output, JSON.stringify({
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  success: true,
  testResults: [{ name: path.resolve("test/a.test.ts"), assertionResults: [] }],
}));
`,
    );
    await initGitRepo(workspaceRepo);
    await mkdir(path.join(workspace, "test"));
    await writeFile(
      path.join(workspace, "test", "a.test.ts"),
      "import { test } from 'vitest';\ntest('a');\n",
    );
    await writeFile(
      path.join(workspace, "test", "b.test.ts"),
      "import { test } from 'vitest';\ntest('b');\n",
    );
    const workspaceConfig = await writeConfigFile(
      workspaceRepo,
      "steward.json",
      stewardConfig(),
    );
    const reportPath = path.join(base, "workspace-report.json");

    await runVerifyChange({
      repo: workspaceRepo,
      config: workspaceConfig,
      report: reportPath,
    });

    const report = JSON.parse(await readFile(reportPath, "utf8")) as Report;
    expect(report.decisions[0]).toMatchObject({
      outcome: "INSUFFICIENT_EVIDENCE",
      gate_action: "advise",
      reason_code: "SELECTED_TEST_FILES_NOT_EXECUTED",
    });
    const runtime = report.evidence.find(
      (record) => record.id === "verify-change-receipt",
    );
    expect(runtime?.findings?.[0]?.code).toBe("VERIFICATION_INCOMPLETE");
    expect(runtime?.gate_trust).toBe("advisory_only");
    const receipt = (await latestReceipt(stateDirectory(workspaceRepo)))!
      .receipt;
    expect(receipt.passed).toBe(false);
    expect(receipt.command.cwd).toBe(await realpath(workspace));
    expect(receipt.selected_test_files).toEqual([
      "apps/api/test/a.test.ts",
      "apps/api/test/b.test.ts",
    ]);
    expect(receipt.command.argv).toContain("test/a.test.ts");
    expect(receipt.command.argv).toContain("test/b.test.ts");
    expect(
      receipt.limitations.some((entry) =>
        entry.includes("did not exactly cover every selected test file"),
      ),
    ).toBe(true);
  }, 30_000);
});

describe("node:test verify-change evidence", () => {
  it("runs and receipts the exact selected file without a package script", async () => {
    const nodeRepo = path.join(base, "node-test-repo");
    await mkdir(path.join(nodeRepo, "src"), { recursive: true });
    await mkdir(path.join(nodeRepo, "test"));
    await writeFile(
      path.join(nodeRepo, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: { test: "node scripts/run-tests.mjs" },
      }),
    );
    await writeFile(
      path.join(nodeRepo, "src/math.js"),
      "export const add = (left, right) => left + right;\n",
    );
    await writeFile(
      path.join(nodeRepo, "test/math.test.js"),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/math.js';\ntest('adds', () => assert.equal(add(2, 3), 5));\n",
    );
    await initGitRepo(nodeRepo);
    await writeFile(
      path.join(nodeRepo, "src/math.js"),
      "export const add = (left, right) => left + right;\n// verified change\n",
    );
    const nodeConfig = await writeConfigFile(
      nodeRepo,
      ".detestify/config.json",
      stewardConfig(),
    );
    const reportPath = path.join(base, "node-test-report.json");

    await runVerifyChange({
      repo: nodeRepo,
      config: nodeConfig,
      report: reportPath,
    });

    const report = JSON.parse(await readFile(reportPath, "utf8")) as Report;
    expect(report.capabilities.runner).toBe("node:test");
    const receipt = (await latestReceipt(stateDirectory(nodeRepo)))!.receipt;
    expect(receipt).toMatchObject({
      runner: "node:test",
      passed: true,
      selected_test_files: ["test/math.test.js"],
    });
    expect(receipt.command.argv).toEqual([
      process.execPath,
      "--test",
      "--test-reporter=junit",
      "test/math.test.js",
    ]);
  }, 30_000);
});
