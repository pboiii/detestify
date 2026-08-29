// M5 hook-contract addition: the default (core-wired) decider on a Stop event
// with an unmet material declared obligation requests remediation exactly
// once, allows once a passing receipt matches the current diff fingerprint,
// and never executes repository tests from the hook.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHook } from "../../src/hooks/entry.js";
import { coreHookDecider } from "../../src/hooks/decider.js";
import { buildReceipt, writeReceipt } from "../../src/evidence/receipts.js";
import type { RunnerInvocation } from "../../src/evidence/runners/vitest.js";
import { snapshotRepository } from "../../src/repository/git.js";
import { fingerprintDiff } from "../../src/repository/fingerprint.js";
import { stripOwnState } from "../../src/evidence/verdict.js";
import {
  initGitRepo,
  stewardConfig,
  writeConfigFile,
} from "../unit/evidence/helpers.js";

let base: string;
let repo: string;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "test-steward-decider-"));
  repo = path.join(base, "repo");
  await mkdir(path.join(repo, "src", "payments"), { recursive: true });
  await writeFile(
    path.join(repo, "src", "payments", "charge.ts"),
    "export const charge = (cents: number): number => cents;\n",
    "utf8",
  );
  await initGitRepo(repo);
  // Material declared obligation via discovered (inert) repository config.
  await writeConfigFile(
    repo,
    ".test-steward/config.json",
    stewardConfig({
      mode: "balanced",
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
          statement: "A charge is executed exactly once per request.",
          source: "docs/payments-policy.md",
          gate_policy: "balanced",
        },
      ],
    }),
  );
  // The unmet obligation: a critical-path source change with no test change.
  await writeFile(
    path.join(repo, "src", "payments", "charge.ts"),
    "export const charge = (cents: number): number => cents + 1;\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const stopPayload = (sessionId: string) =>
  JSON.stringify({
    session_id: sessionId,
    cwd: repo,
    hook_event_name: "Stop",
    stop_hook_active: false,
  });

describe("default decider on Stop (verify-change core wiring)", () => {
  it("requests remediation once for an unmet material obligation, then discloses without blocking", async () => {
    // No `decide` option: this exercises the wired default decider.
    const first = await runHook(["claude", "turn_stop"], stopPayload("s-1"), {
      repoRoot: repo,
    });
    expect(first.exitCode).toBe(0);
    const decision = JSON.parse(first.stdout ?? "{}") as {
      decision: string;
      reason: string;
    };
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("verify-change");

    const second = await runHook(["claude", "turn_stop"], stopPayload("s-1"), {
      repoRoot: repo,
    });
    expect(second.exitCode).toBe(0);
    expect(second.stdout ?? "").not.toContain('"block"');
    expect(second.stdout ?? "").toContain("already granted");
  }, 30_000);

  it("never blocks in advisory mode for the same gap", async () => {
    await writeConfigFile(
      repo,
      ".test-steward/config.json",
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
    const result = await runHook(["claude", "turn_stop"], stopPayload("s-2"), {
      repoRoot: repo,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout ?? "").not.toContain('"block"');
  }, 30_000);

  it("allows when a passing receipt matches the current diff fingerprint", async () => {
    const fingerprint = (
      await fingerprintDiff(stripOwnState(await snapshotRepository(repo)))
    ).fingerprint;
    const invocation: RunnerInvocation = {
      runner: "vitest",
      version: "3.2.7",
      argv: [process.execPath, "vitest.mjs", "run", "test/charge.test.ts"],
      cwd: repo,
      testFiles: ["test/charge.test.ts"],
      outcome: {
        exitCode: 0,
        timedOut: false,
        outputTruncated: false,
        processGroupKilled: false,
        stdout: "",
        stderr: "",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 50,
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
    await writeReceipt(
      path.join(repo, ".test-steward"),
      buildReceipt({
        invocation,
        repoRoot: repo,
        baseRevision: null,
        headRevision: null,
        timeoutMs: 120_000,
        envKeys: [],
        diffFingerprintStart: fingerprint,
        diffFingerprintEnd: fingerprint,
      }),
    );

    const result = await runHook(["claude", "turn_stop"], stopPayload("s-3"), {
      repoRoot: repo,
    });
    // allow translates to no decision output on Claude.
    expect(result).toEqual({ stdout: null, exitCode: 0 });
  }, 30_000);

  it("a stale or fingerprint-mismatched receipt does not stand in for verification", async () => {
    const decision = await coreHookDecider({
      schema_version: "1.0",
      host: "claude",
      host_version: null,
      event: "turn_stop",
      session_id: "s-4",
      turn_id: null,
      cwd: repo,
      repo_root: repo,
      tool: { name: null, input_ref: null, result_ref: null },
      loop_guard: { already_remediated: false, attempt: 0 },
      raw_payload_ref: null,
    });
    // No receipt matches: the plan-level verdict gates the declared gap.
    expect(decision.action).toBe("request_remediation");
    expect(decision.reason_code).toBe("DECLARED_CRITICAL_PATH_CHANGED");
    expect(
      decision.limitations.some((entry) =>
        entry.includes("No test was executed from the hook"),
      ),
    ).toBe(true);
  }, 30_000);

  it("non-gating lifecycle events always allow", async () => {
    const decision = await coreHookDecider({
      schema_version: "1.0",
      host: "claude",
      host_version: null,
      event: "session_start",
      session_id: "s-5",
      turn_id: null,
      cwd: repo,
      repo_root: repo,
      tool: { name: null, input_ref: null, result_ref: null },
      loop_guard: { already_remediated: false, attempt: 0 },
      raw_payload_ref: null,
    });
    expect(decision.action).toBe("allow");
  });
});
