import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHook, type HookDecider } from "../../src/hooks/entry.js";
import {
  inspectLoopState,
  loopKey,
  recordRemediation,
} from "../../src/hooks/loop-state.js";
import { buildDecision } from "../../src/hooks/normalized.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(tmpdir(), "test-steward-loop-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

/** A core that always wants remediation: the guard must still stop the loop. */
const alwaysRemediate: HookDecider = (invocation) =>
  buildDecision({
    action: "request_remediation",
    confidence: "high",
    reason_code: "MATERIAL_BOUNDARY_EVIDENCE_GAP",
    summary: "Boundary retry changed without a retry guard test.",
    remediation:
      "Add one focused integration test proving exactly one side effect.",
    report_path: ".test-steward/reports/stop-001.json",
    limitations: [],
    loop_guard: { next_attempt: 1 },
  }).then((decision) => {
    void invocation;
    return decision;
  });

const claudeStopPayload = (stopHookActive: boolean) =>
  JSON.stringify({
    session_id: "s-loop",
    cwd: "/tmp",
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
  });

const codexStopPayload = (stopHookActive: boolean) =>
  JSON.stringify({
    session_id: "s-loop",
    turn_id: "t-1",
    cwd: "/tmp",
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
  });

function parseOutput(stdout: string | null): {
  decision: string;
  reason?: string;
} {
  return JSON.parse(stdout ?? "{}") as { decision: string; reason?: string };
}

describe("one-shot stop loop proof", () => {
  it("claude: first Stop requests at most one remediation, second allows", async () => {
    const first = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(first.exitCode).toBe(0);
    expect(parseOutput(first.stdout)).toMatchObject({ decision: "block" });

    const second = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(second.exitCode).toBe(0);
    const secondOut = second.stdout ?? "";
    expect(secondOut).not.toContain('"block"');
    expect(secondOut).toContain("already granted");

    const third = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(third.stdout ?? "").not.toContain('"block"');
  });

  it("claude: stop_hook_active=true never blocks again", async () => {
    const result = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(true),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(result.stdout ?? "").not.toContain('"block"');
    expect(result.stdout ?? "").toContain("already granted");
  });

  it("codex: first Stop blocks once, second Stop allows", async () => {
    const first = await runHook(
      ["codex", "turn_stop"],
      codexStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(parseOutput(first.stdout)).toMatchObject({ decision: "block" });

    const second = await runHook(
      ["codex", "turn_stop"],
      codexStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    const parsed = parseOutput(second.stdout);
    expect(parsed.decision).toBe("allow");
    expect(second.stdout).toContain("already granted");
  });

  it("codex: stop_hook_active=true resolves to allow/advise", async () => {
    const result = await runHook(
      ["codex", "turn_stop"],
      codexStopPayload(true),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(parseOutput(result.stdout).decision).not.toBe("block");
  });

  it("a new session key gets its own single remediation", async () => {
    await runHook(["codex", "turn_stop"], codexStopPayload(false), {
      decide: alwaysRemediate,
      stateDir,
      repoRoot: "/tmp",
    });
    const other = await runHook(
      ["codex", "turn_stop"],
      JSON.stringify({
        session_id: "s-other",
        turn_id: "t-2",
        cwd: "/tmp",
        hook_event_name: "Stop",
      }),
      { decide: alwaysRemediate, stateDir, repoRoot: "/tmp" },
    );
    expect(parseOutput(other.stdout)).toMatchObject({ decision: "block" });
  });

  it("advise/allow decisions never touch loop state", async () => {
    const allowOnce: HookDecider = () =>
      buildDecision({
        action: "allow",
        confidence: "high",
        reason_code: "VERIFIED_WITH_RECEIPT",
        summary: "ok",
        remediation: null,
        report_path: null,
        limitations: [],
        loop_guard: { next_attempt: 0 },
      });
    await runHook(["claude", "turn_stop"], claudeStopPayload(false), {
      decide: allowOnce,
      stateDir,
      repoRoot: "/tmp",
    });
    const stateFile = path.join(stateDir, "hooks", "loop-state.json");
    await expect(readFile(stateFile, "utf8")).rejects.toThrow();
  });
});

describe("loop-state unit behavior", () => {
  it("recordRemediation grants exactly once per key", async () => {
    const key = {
      host: "claude",
      sessionId: "s1",
      repoFingerprint: "f1",
      agentId: null,
    };
    const options = { alreadyRemediated: false, repoRoot: null, stateDir };
    expect(await recordRemediation(key, options)).toBe(true);
    expect(await recordRemediation(key, options)).toBe(false);
    const status = await inspectLoopState(key, options);
    expect(status.alreadyRemediated).toBe(true);
    expect(status.nextAttempt).toBe(1);
  });

  it("host already-continued flag forces allow regardless of state", async () => {
    const key = {
      host: "claude",
      sessionId: "s2",
      repoFingerprint: "f2",
      agentId: null,
    };
    const status = await inspectLoopState(key, {
      alreadyRemediated: true,
      repoRoot: null,
      stateDir,
    });
    expect(status.alreadyRemediated).toBe(true);
  });

  it("subagent keys are independent from the main thread", async () => {
    const main = {
      host: "claude",
      sessionId: "s3",
      repoFingerprint: "f3",
      agentId: null,
    };
    const subagent = { ...main, agentId: "agent-9" };
    const options = { alreadyRemediated: false, repoRoot: null, stateDir };
    expect(await recordRemediation(main, options)).toBe(true);
    expect(await recordRemediation(subagent, options)).toBe(true);
    expect((await inspectLoopState(subagent, options)).alreadyRemediated).toBe(
      true,
    );
    expect((await inspectLoopState(main, options)).alreadyRemediated).toBe(
      true,
    );
  });

  it("corrupt state degrades with a limitation instead of failing", async () => {
    const stateFile = path.join(stateDir, "hooks", "loop-state.json");
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, "{not json", "utf8");
    const key = {
      host: "claude",
      sessionId: "s4",
      repoFingerprint: "f4",
      agentId: null,
    };
    const status = await inspectLoopState(key, {
      alreadyRemediated: false,
      repoRoot: null,
      stateDir,
    });
    expect(status.limitations.length).toBe(1);
    expect(status.limitations[0]).toContain("corrupt");
    expect(status.alreadyRemediated).toBe(false);
    // A remediation can still be granted once, and only once.
    expect(
      await recordRemediation(key, {
        alreadyRemediated: false,
        repoRoot: null,
        stateDir,
      }),
    ).toBe(true);
  });

  it("loopKey binds host, session, repository snapshot, and agent", () => {
    const invocation = {
      schema_version: "1.0" as const,
      host: "claude" as const,
      host_version: null,
      event: "turn_stop" as const,
      session_id: "s",
      turn_id: null,
      cwd: "/repo",
      repo_root: "/repo",
      tool: { name: null, input_ref: null, result_ref: null },
      loop_guard: { already_remediated: false, attempt: 0 },
      raw_payload_ref: null,
    };
    const key = loopKey(invocation);
    expect(key).toEqual({
      host: "claude",
      sessionId: "s",
      repoFingerprint: expect.any(String),
      agentId: null,
    });
  });
});

describe("entry failure modes", () => {
  it("unparseable stdin fails open", async () => {
    const result = await runHook(["claude", "turn_stop"], "not json", {
      stateDir,
      repoRoot: "/tmp",
    });
    expect(result).toEqual({ stdout: null, exitCode: 0 });
  });

  it("unknown host or event exits 2 without output", async () => {
    expect(
      await runHook(["unknown", "turn_stop"], "{}", {
        stateDir,
        repoRoot: "/tmp",
      }),
    ).toEqual({ stdout: null, exitCode: 2 });
  });

  it("task_complete through the codex production adapter is refused", async () => {
    const result = await runHook(
      ["codex", "task_complete"],
      JSON.stringify({ session_id: "s", cwd: "/tmp" }),
      { stateDir, repoRoot: "/tmp" },
    );
    expect(result).toEqual({ stdout: null, exitCode: 0 });
  });
});
