import {
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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { runHook, type HookDecider } from "../../src/hooks/entry.js";
import {
  inspectLoopState,
  loopKey,
  recordRemediation,
} from "../../src/hooks/loop-state.js";
import { buildDecision } from "../../src/hooks/normalized.js";
import { runGit } from "../../src/repository/git.js";

let stateDir: string;
let repoDir: string;

beforeAll(async () => {
  repoDir = await mkdtemp(path.join(tmpdir(), "test-steward-loop-repo-"));
  await runGit(repoDir, ["init", "-q"]);
  await writeFile(path.join(repoDir, "work.ts"), "export const value = 1;\n");
});

afterAll(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

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
    report_path: ".detestify/reports/stop-001.json",
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
  decision?: string;
  reason?: string;
  systemMessage?: string;
} {
  return JSON.parse(stdout ?? "{}") as {
    decision?: string;
    reason?: string;
    systemMessage?: string;
  };
}

describe("one-shot stop loop proof", () => {
  it("claude: first Stop requests at most one remediation, second allows", async () => {
    const first = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: repoDir,
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
        repoRoot: repoDir,
      },
    );
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBeNull();
    expect(parseOutput(second.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });

    const third = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: repoDir,
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
        repoRoot: repoDir,
      },
    );
    expect(result.exitCode).toBe(0);
    expect(parseOutput(result.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("MATERIAL_BOUNDARY_EVIDENCE_GAP"),
    });
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
    expect(second.exitCode).toBe(0);
    expect(parseOutput(second.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });
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

  it("a new turn in the same session cannot request another remediation", async () => {
    await runHook(["codex", "turn_stop"], codexStopPayload(false), {
      decide: alwaysRemediate,
      stateDir,
      repoRoot: "/tmp",
    });
    const other = await runHook(
      ["codex", "turn_stop"],
      JSON.stringify({
        session_id: "s-loop",
        turn_id: "t-2",
        cwd: "/tmp",
        hook_event_name: "Stop",
      }),
      { decide: alwaysRemediate, stateDir, repoRoot: "/tmp" },
    );
    expect(parseOutput(other.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });
    expect(parseOutput(other.stdout).decision).not.toBe("block");
  });

  it("a changed Claude diff cannot request another remediation", async () => {
    const first = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(parseOutput(first.stdout)).toMatchObject({ decision: "block" });

    await writeFile(path.join(repoDir, "work.ts"), "export const value = 2;\n");
    const changed = await runHook(
      ["claude", "turn_stop"],
      claudeStopPayload(false),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(parseOutput(changed.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });
    expect(parseOutput(changed.stdout).decision).not.toBe("block");
  });

  it("subagents get one remediation per normalized identity", async () => {
    const payload = (agentId: string) =>
      JSON.stringify({
        session_id: "s-loop",
        turn_id: "t-subagent",
        cwd: "/tmp",
        hook_event_name: "SubagentStop",
        stop_hook_active: false,
        agent_id: agentId,
      });

    const first = await runHook(
      ["codex", "subagent_stop"],
      payload("agent-1"),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(parseOutput(first.stdout)).toMatchObject({ decision: "block" });

    const repeat = await runHook(
      ["codex", "subagent_stop"],
      payload("  agent-1  "),
      { decide: alwaysRemediate, stateDir, repoRoot: "/tmp" },
    );
    expect(repeat.exitCode).toBe(0);
    expect(parseOutput(repeat.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });

    const other = await runHook(
      ["codex", "subagent_stop"],
      payload("agent-2"),
      {
        decide: alwaysRemediate,
        stateDir,
        repoRoot: "/tmp",
      },
    );
    expect(parseOutput(other.stdout)).toMatchObject({ decision: "block" });
  });

  it("task completions and main Stop have independent identities", async () => {
    const taskPayload = (taskId: string) =>
      JSON.stringify({
        session_id: "s-task",
        cwd: "/tmp",
        hook_event_name: "TaskCompleted",
        stop_hook_active: false,
        task_id: taskId,
      });

    const first = await runHook(
      ["claude", "task_complete"],
      taskPayload("task-1"),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(first.exitCode).toBe(2);

    const repeat = await runHook(
      ["claude", "task_complete"],
      taskPayload("task-1"),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(repeat.exitCode).toBe(0);
    expect(parseOutput(repeat.stdout)).toMatchObject({
      systemMessage: expect.stringContaining("detestify verify-change"),
    });

    const other = await runHook(
      ["claude", "task_complete"],
      taskPayload("task-2"),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(other.exitCode).toBe(2);

    const main = await runHook(
      ["claude", "turn_stop"],
      JSON.stringify({
        session_id: "s-task",
        cwd: "/tmp",
        hook_event_name: "Stop",
        stop_hook_active: false,
      }),
      { decide: alwaysRemediate, stateDir, repoRoot: repoDir },
    );
    expect(parseOutput(main.stdout)).toMatchObject({ decision: "block" });
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

  it("concurrent record calls grant exactly one remediation", async () => {
    const key = {
      host: "claude",
      sessionId: "concurrent",
      repoFingerprint: "same-tree",
      agentId: null,
    };
    const options = { alreadyRemediated: false, repoRoot: null, stateDir };
    const grants = await Promise.all(
      Array.from({ length: 16 }, () => recordRemediation(key, options)),
    );
    expect(grants.filter(Boolean)).toHaveLength(1);
    expect((await inspectLoopState(key, options)).alreadyRemediated).toBe(true);
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

  it("corrupt state is unavailable and never overwritten", async () => {
    const stateFile = path.join(stateDir, "hooks", "loop-state.json");
    await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    await writeFile(stateFile, "{not json", { encoding: "utf8", mode: 0o600 });
    expect((await stat(stateDir)).mode & 0o777).toBe(0o700);
    expect((await stat(path.dirname(stateFile))).mode & 0o777).toBe(0o700);
    expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
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
    expect(status.alreadyRemediated).toBe(true);
    expect(status.nextAttempt).toBe(0);
    expect(
      await recordRemediation(key, {
        alreadyRemediated: false,
        repoRoot: null,
        stateDir,
      }),
    ).toBe(false);
    expect(await readFile(stateFile, "utf8")).toBe("{not json");
  });

  it("fails open when the state parent is a symlink", async () => {
    const outside = path.join(stateDir, "outside");
    const linked = path.join(stateDir, "linked");
    await mkdir(outside, { mode: 0o700 });
    await symlink(outside, linked);
    expect(
      await recordRemediation(
        {
          host: "claude",
          sessionId: "unsafe",
          repoFingerprint: "tree",
          agentId: null,
        },
        { alreadyRemediated: false, repoRoot: null, stateDir: linked },
      ),
    ).toBe(false);
  });

  it("loopKey stays stable across turns and diff changes while separating agents", () => {
    const invocation = {
      schema_version: "1.0" as const,
      host: "claude" as const,
      host_version: null,
      event: "turn_stop" as const,
      session_id: "s",
      turn_id: "turn-1",
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
    expect(loopKey({ ...invocation, turn_id: "turn-2" })).toEqual(key);
    expect(loopKey({ ...invocation, turn_id: null })).toEqual(key);
    expect(loopKey(invocation, " agent-1 ")).toEqual(
      loopKey(invocation, "agent-1"),
    );
    expect(loopKey(invocation, "agent-1")).not.toEqual(key);
  });
});

describe("entry failure modes", () => {
  it("unparseable stdin fails open", async () => {
    const result = await runHook(["claude", "turn_stop"], "not json", {
      stateDir,
      repoRoot: "/tmp",
    });
    expect(result).toEqual({ stdout: null, stderr: null, exitCode: 0 });
  });

  it("unknown host or event exits 2 without output", async () => {
    expect(
      await runHook(["unknown", "turn_stop"], "{}", {
        stateDir,
        repoRoot: "/tmp",
      }),
    ).toEqual({
      stdout: null,
      stderr: "detestify-hook: expected <claude|codex> <event>\n",
      exitCode: 2,
    });
  });

  it("task_complete through the codex production adapter is refused", async () => {
    const result = await runHook(
      ["codex", "task_complete"],
      JSON.stringify({ session_id: "s", cwd: "/tmp" }),
      { stateDir, repoRoot: "/tmp" },
    );
    expect(result).toEqual({ stdout: null, stderr: null, exitCode: 0 });
  });
});
