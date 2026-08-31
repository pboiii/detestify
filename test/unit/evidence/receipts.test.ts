import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildReceipt,
  latestReceipt,
  receiptEvidence,
  receiptsDirectory,
  stateDirectory,
  writeReceipt,
} from "../../../src/evidence/receipts.js";
import type { RunnerInvocation } from "../../../src/evidence/runners/vitest.js";
import { getValidator } from "../../../src/core/schemas/index.js";

let stateDir: string;
const FINGERPRINT_A = `sha256:${"a".repeat(64)}`;
const FINGERPRINT_B = `sha256:${"b".repeat(64)}`;
const POLICY_FINGERPRINT = `sha256:${"c".repeat(64)}`;
const ORIGINAL_STATE_DIR = process.env.DETESTIFY_STATE_DIR;
const ORIGINAL_XDG_STATE_HOME = process.env.XDG_STATE_HOME;

function restoreEnvironment(): void {
  if (ORIGINAL_STATE_DIR === undefined) {
    delete process.env.DETESTIFY_STATE_DIR;
  } else {
    process.env.DETESTIFY_STATE_DIR = ORIGINAL_STATE_DIR;
  }
  if (ORIGINAL_XDG_STATE_HOME === undefined) {
    delete process.env.XDG_STATE_HOME;
  } else {
    process.env.XDG_STATE_HOME = ORIGINAL_XDG_STATE_HOME;
  }
}

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(tmpdir(), "test-steward-receipts-"));
});

afterEach(async () => {
  restoreEnvironment();
  await rm(stateDir, { recursive: true, force: true });
});

function invocationOf(
  overrides: Partial<{
    failed: number;
    exitCode: number | null;
    timedOut: boolean;
    outputTruncated: boolean;
    processGroupKilled: boolean;
    results: RunnerInvocation["results"];
  }> = {},
): RunnerInvocation {
  const failed = overrides.failed ?? 0;
  return {
    runner: "vitest",
    version: "3.2.7",
    argv: [process.execPath, "vitest.mjs", "run", "test/a.test.ts"],
    cwd: "/repo",
    testFiles: ["test/a.test.ts"],
    outcome: {
      exitCode:
        "exitCode" in overrides
          ? (overrides.exitCode ?? null)
          : failed > 0
            ? 1
            : 0,
      timedOut: overrides.timedOut ?? false,
      outputTruncated: overrides.outputTruncated ?? false,
      processGroupKilled:
        overrides.processGroupKilled ?? overrides.timedOut ?? false,
      stdout: "",
      stderr: "",
      startedAt: "2026-08-28T00:00:00.000Z",
      finishedAt: "2026-08-28T00:00:01.000Z",
      durationMs: 1000,
      spawnError: null,
    },
    results:
      "results" in overrides
        ? (overrides.results ?? null)
        : {
            total: 2,
            passed: 2 - failed,
            failed,
            skipped: 0,
            failures:
              failed > 0
                ? [
                    {
                      name: "fails",
                      message: "expected",
                      file: "test/a.test.ts",
                      identityDigest: "d".repeat(64),
                    },
                  ]
                : [],
            success: failed === 0,
          },
  };
}

function receiptOf(
  invocation: RunnerInvocation,
  start = FINGERPRINT_A,
  end = FINGERPRINT_A,
  selectionComplete = true,
) {
  return buildReceipt({
    invocation,
    repoRoot: "/repo",
    baseRevision: "base",
    headRevision: "head",
    timeoutMs: 120_000,
    envKeys: ["CI", "HOME", "NO_COLOR", "PATH"],
    policyFingerprint: POLICY_FINGERPRINT,
    diffFingerprintStart: start,
    diffFingerprintEnd: end,
    selectionComplete,
  });
}

describe("verification receipts (TM-004)", () => {
  it("records command, revisions, duration, results, and both fingerprints", () => {
    const receipt = receiptOf(invocationOf());
    expect(receipt.command.argv).toContain("run");
    expect(receipt.base_revision).toBe("base");
    expect(receipt.head_revision).toBe("head");
    expect(receipt.duration_ms).toBe(1000);
    expect(receipt.results?.passed).toBe(2);
    expect(receipt.policy_fingerprint).toBe(POLICY_FINGERPRINT);
    expect(receipt.diff_fingerprint_start).toBe(FINGERPRINT_A);
    expect(receipt.diff_fingerprint_end).toBe(FINGERPRINT_A);
    expect(receipt.stale).toBe(false);
    expect(receipt.selection_complete).toBe(true);
    expect(receipt.passed).toBe(true);
  });

  it("a changed fingerprint marks the receipt stale and never passing", () => {
    const receipt = receiptOf(invocationOf(), FINGERPRINT_A, FINGERPRINT_B);
    expect(receipt.stale).toBe(true);
    expect(receipt.passed).toBe(false);
    expect(receipt.limitations.some((entry) => entry.includes("stale"))).toBe(
      true,
    );
  });

  it("requires complete selection and output, no process kill, successful non-empty results, and exit zero", () => {
    const incompleteSelection = receiptOf(
      invocationOf(),
      FINGERPRINT_A,
      FINGERPRINT_A,
      false,
    );
    expect(incompleteSelection.passed).toBe(false);
    expect(
      incompleteSelection.limitations.some((entry) => entry.includes("capped")),
    ).toBe(true);
    expect(receiptOf(invocationOf({ failed: 1 })).passed).toBe(false);
    expect(receiptOf(invocationOf({ exitCode: 1 })).passed).toBe(false);
    expect(receiptOf(invocationOf({ outputTruncated: true })).passed).toBe(
      false,
    );
    expect(receiptOf(invocationOf({ processGroupKilled: true })).passed).toBe(
      false,
    );
    expect(
      receiptOf(
        invocationOf({
          results: {
            total: 2,
            passed: 2,
            failed: 0,
            skipped: 0,
            failures: [],
            success: false,
          },
        }),
      ).passed,
    ).toBe(false);
    expect(
      receiptOf(
        invocationOf({
          results: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            failures: [],
            success: true,
          },
        }),
      ).passed,
    ).toBe(false);
    const allSkipped = receiptOf(
      invocationOf({
        results: {
          total: 2,
          passed: 0,
          failed: 0,
          skipped: 2,
          failures: [],
          success: true,
        },
      }),
    );
    expect(allSkipped.passed).toBe(false);
    expect(allSkipped.limitations).toContainEqual(
      expect.stringContaining("passed no tests"),
    );
    expect(
      receiptOf(
        invocationOf({
          results: {
            total: 2,
            passed: 1,
            failed: 0,
            skipped: 1,
            failures: [],
            success: true,
          },
        }),
      ).passed,
    ).toBe(true);
    const timedOut = receiptOf(
      invocationOf({ timedOut: true, exitCode: null, results: null }),
    );
    expect(timedOut.passed).toBe(false);
    expect(
      timedOut.limitations.some((entry) => entry.includes("process group")),
    ).toBe(true);
  });

  it("writes under the report dir and loads the latest receipt back", async () => {
    const first = receiptOf(invocationOf({ failed: 1 }));
    const firstPath = await writeReceipt(stateDir, first);
    expect(firstPath.startsWith(receiptsDirectory(stateDir))).toBe(true);

    // A later receipt (lexicographically newer stamp) wins.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = receiptOf(invocationOf());
    await writeReceipt(stateDir, second);

    const loaded = await latestReceipt(stateDir);
    expect(loaded?.receipt.receipt_id).toBe(second.receipt_id);
    expect(loaded?.receipt.passed).toBe(true);
  });

  it("returns null when no receipts exist", async () => {
    expect(await latestReceipt(stateDir)).toBeNull();
  });

  it("uses an external repository-keyed state root and rejects unsafe env overrides", async () => {
    const repo = path.join(stateDir, "repo");
    const otherRepo = path.join(stateDir, "other-repo");
    const xdg = path.join(stateDir, "xdg");
    await mkdir(repo);
    await mkdir(otherRepo);
    delete process.env.DETESTIFY_STATE_DIR;
    process.env.XDG_STATE_HOME = xdg;

    const first = stateDirectory(repo);
    expect(first.startsWith(path.join(xdg, "detestify") + path.sep)).toBe(true);
    expect(first).not.toContain(".test-steward");
    expect(stateDirectory(otherRepo)).not.toBe(first);

    process.env.DETESTIFY_STATE_DIR = "relative-state";
    expect(() => stateDirectory(repo)).toThrow(/absolute path/);
    process.env.DETESTIFY_STATE_DIR = path.join(repo, "state");
    expect(() => stateDirectory(repo)).toThrow(/outside the repository/);
  });

  it("writes private files and skips forged, public, and symlink receipts", async () => {
    const original = receiptOf(invocationOf({ failed: 1 }));
    const originalPath = await writeReceipt(stateDir, original);
    expect((await stat(originalPath)).mode & 0o777).toBe(0o600);
    expect((await stat(receiptsDirectory(stateDir))).mode & 0o777).toBe(0o700);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const forged = receiptOf(invocationOf());
    const forgedPath = await writeReceipt(stateDir, forged);
    const document = JSON.parse(await readFile(forgedPath, "utf8")) as Record<
      string,
      unknown
    >;
    (document.results as Record<string, unknown>).success = false;
    await writeFile(forgedPath, `${JSON.stringify(document)}\n`, {
      mode: 0o600,
    });
    expect((await latestReceipt(stateDir))?.receipt.receipt_id).toBe(
      original.receipt_id,
    );

    await chmod(originalPath, 0o644);
    expect(await latestReceipt(stateDir)).toBeNull();
    await chmod(originalPath, 0o600);
    await symlink(
      originalPath,
      path.join(receiptsDirectory(stateDir), "zz.json"),
    );
    expect((await latestReceipt(stateDir))?.receipt.receipt_id).toBe(
      original.receipt_id,
    );
  });

  it("strict loading recomputes truncated-output and process-kill failures", async () => {
    const original = receiptOf(invocationOf({ failed: 1 }));
    await writeReceipt(stateDir, original);

    for (const field of ["output_truncated", "process_group_killed"] as const) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const forgedPath = await writeReceipt(
        stateDir,
        receiptOf(invocationOf()),
      );
      const document = JSON.parse(await readFile(forgedPath, "utf8")) as Record<
        string,
        unknown
      >;
      document[field] = true;
      await writeFile(forgedPath, `${JSON.stringify(document)}\n`, {
        mode: 0o600,
      });
    }

    expect((await latestReceipt(stateDir))?.receipt.receipt_id).toBe(
      original.receipt_id,
    );
  });

  it("refuses receipt writes through a symlink state parent", async () => {
    const outside = path.join(stateDir, "outside");
    const linked = path.join(stateDir, "linked");
    await mkdir(outside);
    await symlink(outside, linked);
    await expect(
      writeReceipt(linked, receiptOf(invocationOf())),
    ).rejects.toThrow(/symlink parent|regular directory/);
  });
});

describe("receipt evidence records", () => {
  it("shapes a schema-valid runtime evidence record", async () => {
    const validate = await getValidator("evidence.schema.json");
    for (const receipt of [
      receiptOf(invocationOf()),
      receiptOf(invocationOf({ failed: 1 })),
      receiptOf(invocationOf(), FINGERPRINT_A, FINGERPRINT_B),
    ]) {
      const record = receiptEvidence(receipt, {
        id: "e-1",
        observedAt: "2026-08-28T00:00:02Z",
        receiptPath: ".detestify/reports/receipts/r.json",
      });
      expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("stale or incomplete selections are advisory only; clean runs are gate-eligible", () => {
    const clean = receiptEvidence(receiptOf(invocationOf()), {
      id: "e-1",
      observedAt: "2026-08-28T00:00:02Z",
      receiptPath: null,
    });
    expect(clean.gate_trust).toBe("eligible");
    expect(clean.status).toBe("observed");

    const stale = receiptEvidence(
      receiptOf(invocationOf(), FINGERPRINT_A, FINGERPRINT_B),
      { id: "e-2", observedAt: "2026-08-28T00:00:02Z", receiptPath: null },
    );
    expect(stale.gate_trust).toBe("advisory_only");
    expect(stale.status).toBe("partial");

    const incomplete = receiptEvidence(
      receiptOf(invocationOf(), FINGERPRINT_A, FINGERPRINT_A, false),
      { id: "e-3", observedAt: "2026-08-28T00:00:02Z", receiptPath: null },
    );
    expect(incomplete.gate_trust).toBe("advisory_only");
    expect(incomplete.status).toBe("partial");
  });

  it("failing runs surface bounded failure findings", () => {
    const record = receiptEvidence(receiptOf(invocationOf({ failed: 1 })), {
      id: "e-3",
      observedAt: "2026-08-28T00:00:02Z",
      receiptPath: null,
    });
    const failureFindings = record.findings.filter(
      (finding) => finding.code === "TEST_FAILURE",
    );
    expect(failureFindings).toHaveLength(1);
    expect(failureFindings[0]?.summary).toContain("fails");
  });
});
