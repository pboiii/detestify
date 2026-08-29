import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildReceipt,
  latestReceipt,
  receiptEvidence,
  receiptsDirectory,
  writeReceipt,
} from "../../../src/evidence/receipts.js";
import type { RunnerInvocation } from "../../../src/evidence/runners/vitest.js";
import { getValidator } from "../../../src/core/schemas/index.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(tmpdir(), "test-steward-receipts-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

function invocationOf(
  overrides: Partial<{
    failed: number;
    exitCode: number | null;
    timedOut: boolean;
    results: null;
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
      outputTruncated: false,
      processGroupKilled: overrides.timedOut ?? false,
      stdout: "",
      stderr: "",
      startedAt: "2026-08-28T00:00:00.000Z",
      finishedAt: "2026-08-28T00:00:01.000Z",
      durationMs: 1000,
      spawnError: null,
    },
    results:
      "results" in overrides
        ? null
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
                    },
                  ]
                : [],
            success: failed === 0,
          },
  };
}

function receiptOf(
  invocation: RunnerInvocation,
  start = "sha256:aaa",
  end = "sha256:aaa",
) {
  return buildReceipt({
    invocation,
    repoRoot: "/repo",
    baseRevision: "base",
    headRevision: "head",
    timeoutMs: 120_000,
    envKeys: ["CI", "HOME", "NO_COLOR", "PATH"],
    diffFingerprintStart: start,
    diffFingerprintEnd: end,
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
    expect(receipt.diff_fingerprint_start).toBe("sha256:aaa");
    expect(receipt.diff_fingerprint_end).toBe("sha256:aaa");
    expect(receipt.stale).toBe(false);
    expect(receipt.passed).toBe(true);
  });

  it("a changed fingerprint marks the receipt stale and never passing", () => {
    const receipt = receiptOf(invocationOf(), "sha256:aaa", "sha256:bbb");
    expect(receipt.stale).toBe(true);
    expect(receipt.passed).toBe(false);
    expect(receipt.limitations.some((entry) => entry.includes("stale"))).toBe(
      true,
    );
  });

  it("failing and timed-out runs never pass", () => {
    expect(receiptOf(invocationOf({ failed: 1 })).passed).toBe(false);
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
});

describe("receipt evidence records", () => {
  it("shapes a schema-valid runtime evidence record", async () => {
    const validate = await getValidator("evidence.schema.json");
    for (const receipt of [
      receiptOf(invocationOf()),
      receiptOf(invocationOf({ failed: 1 })),
      receiptOf(invocationOf(), "sha256:aaa", "sha256:bbb"),
    ]) {
      const record = receiptEvidence(receipt, {
        id: "e-1",
        observedAt: "2026-08-28T00:00:02Z",
        receiptPath: ".test-steward/reports/receipts/r.json",
      });
      expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("stale receipts are advisory only; clean runs are gate-eligible", () => {
    const clean = receiptEvidence(receiptOf(invocationOf()), {
      id: "e-1",
      observedAt: "2026-08-28T00:00:02Z",
      receiptPath: null,
    });
    expect(clean.gate_trust).toBe("eligible");
    expect(clean.status).toBe("observed");

    const stale = receiptEvidence(
      receiptOf(invocationOf(), "sha256:aaa", "sha256:bbb"),
      { id: "e-2", observedAt: "2026-08-28T00:00:02Z", receiptPath: null },
    );
    expect(stale.gate_trust).toBe("advisory_only");
    expect(stale.status).toBe("partial");
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
