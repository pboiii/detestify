import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getValidator } from "../../src/core/schemas/index.js";
import {
  buildDecision,
  buildInvocation,
  emitEnvelope,
  parseDecision,
  parseEnvelope,
  parseInvocation,
} from "../../src/hooks/normalized.js";
import {
  normalizeClaudeInput,
  translateClaudeDecision,
} from "../../src/hooks/claude/adapter.js";
import {
  CODEX_SUPPORTED_EVENTS,
  normalizeCodexInput,
  translateCodexDecision,
} from "../../src/hooks/codex/adapter.js";

const fixturesDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "spec",
  "hosts",
  "codex-fixtures",
);

const storeRef = async (data: unknown, label: string) =>
  `raw://test/${label}/${Buffer.from(JSON.stringify(data)).length}`;

const claudeContext = {
  hostVersion: "1.0.99",
  repoRoot: "/tmp/test-steward-fixture",
  cwd: "/tmp/test-steward-fixture",
  store: storeRef,
};

const codexContext = {
  hostVersion: "0.170.0",
  repoRoot: "/tmp/test-steward-fixture",
  cwd: "/tmp/test-steward-fixture",
  store: storeRef,
};

describe("codex fixtures normalize into schema-valid envelopes", () => {
  it("loads the fixture inventory", async () => {
    const files = (await readdir(fixturesDirectory)).sort();
    expect(files).toEqual([
      "after-tool.json",
      "before-tool.json",
      "session-end.json",
      "session-start.json",
      "subagent-stop.json",
      "task-complete.synthetic.json",
      "turn-stop.json",
    ]);
  });

  for (const file of [
    "after-tool.json",
    "before-tool.json",
    "session-end.json",
    "session-start.json",
    "subagent-stop.json",
    "task-complete.synthetic.json",
    "turn-stop.json",
  ]) {
    it(`normalizes ${file}`, async () => {
      const fixture: unknown = JSON.parse(
        await readFile(path.join(fixturesDirectory, file), "utf8"),
      );
      const invocation = await parseInvocation(fixture);
      expect(invocation.schema_version).toBe("1.0");
      expect(invocation.host).toBe("codex");
      // Round-trip: emit + re-parse stays schema-valid.
      const reparsed = await parseEnvelope(
        JSON.parse(emitEnvelope(invocation)),
      );
      expect(reparsed.kind).toBe("invocation");
    });
  }
});

describe("packaged hook examples validate", () => {
  it("validates the invocation and decision examples", async () => {
    const validate = await getValidator("hook-io.schema.json");
    const examples = path.resolve("schemas/examples");
    for (const file of [
      "hook-invocation-stop.json",
      "hook-decision-remediate.json",
    ]) {
      const value: unknown = JSON.parse(
        await readFile(path.join(examples, file), "utf8"),
      );
      expect(validate(value), file).toBe(true);
    }
  });
});

describe("claude payload normalization", () => {
  const claudeStop = {
    session_id: "claude-session-1",
    transcript_path: "/Users/alice/.claude/transcripts/t1.jsonl",
    cwd: "/tmp/test-steward-fixture",
    hook_event_name: "Stop",
    stop_hook_active: false,
  };

  const claudePreTool = {
    session_id: "claude-session-1",
    cwd: "/tmp/test-steward-fixture",
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: {
      file_path: "/tmp/test-steward-fixture/src/a.ts",
      old_string: "a",
      new_string: "b",
    },
  };

  it("normalizes a Stop payload with stop_hook_active", async () => {
    const invocation = await normalizeClaudeInput(
      claudeStop,
      "turn_stop",
      claudeContext,
    );
    expect(invocation.event).toBe("turn_stop");
    expect(invocation.loop_guard).toEqual({
      already_remediated: false,
      attempt: 0,
    });
    expect(invocation.tool).toEqual({
      name: null,
      input_ref: null,
      result_ref: null,
    });
    const active = await normalizeClaudeInput(
      { ...claudeStop, stop_hook_active: true },
      "turn_stop",
      claudeContext,
    );
    expect(active.loop_guard).toEqual({ already_remediated: true, attempt: 1 });
  });

  it("normalizes a PreToolUse payload with tool references", async () => {
    const invocation = await normalizeClaudeInput(
      claudePreTool,
      "before_tool",
      claudeContext,
    );
    expect(invocation.event).toBe("before_tool");
    expect(invocation.tool.name).toBe("Edit");
    expect(invocation.tool.input_ref).toMatch(/^raw:\/\/test\//);
    expect(invocation.tool.result_ref).toBeNull();
  });

  it("rejects a payload whose event disagrees with the hook event", async () => {
    await expect(
      normalizeClaudeInput(claudeStop, "before_tool", claudeContext),
    ).rejects.toThrow(/does not match hook event/);
  });

  it("rejects a payload from an unmapped Claude event", async () => {
    await expect(
      normalizeClaudeInput(
        { ...claudeStop, hook_event_name: "FileChanged" },
        "turn_stop",
        claudeContext,
      ),
    ).rejects.toThrow(/Unknown Claude hook event/);
  });

  it("maps every Claude lifecycle event used by the package", async () => {
    const pairs: readonly (readonly [string, string, object])[] = [
      ["SessionStart", "session_start", { source: "startup" }],
      [
        "PreToolUse",
        "before_tool",
        { tool_name: "Write", tool_input: { x: 1 } },
      ],
      ["PostToolUse", "after_tool", { tool_name: "Edit", tool_response: "ok" }],
      ["TaskCompleted", "task_complete", {}],
      ["SubagentStop", "subagent_stop", { agent_id: "agent-1" }],
      ["Stop", "turn_stop", {}],
      ["SessionEnd", "session_end", { reason: "clear" }],
    ];
    for (const [rawName, normalized, extra] of pairs) {
      const invocation = await normalizeClaudeInput(
        {
          session_id: "s",
          cwd: "/tmp/test-steward-fixture",
          hook_event_name: rawName,
          ...extra,
        },
        normalized as never,
        claudeContext,
      );
      expect(invocation.event).toBe(normalized);
    }
  });
});

describe("codex payload normalization", () => {
  const codexStop = {
    session_id: "codex-session-1",
    turn_id: "turn-9",
    cwd: "/tmp/test-steward-fixture",
    hook_event_name: "Stop",
    stop_hook_active: false,
  };

  it("normalizes a Stop payload", async () => {
    const invocation = await normalizeCodexInput(
      codexStop,
      "turn_stop",
      codexContext,
    );
    expect(invocation.event).toBe("turn_stop");
    expect(invocation.turn_id).toBe("turn-9");
    expect(invocation.loop_guard).toEqual({
      already_remediated: false,
      attempt: 0,
    });
  });

  it("normalizes every production-emittable event", async () => {
    for (const event of CODEX_SUPPORTED_EVENTS) {
      const invocation = await normalizeCodexInput(
        { ...codexStop, hook_event_name: undefined },
        event,
        codexContext,
      );
      expect(invocation.host).toBe("codex");
    }
  });

  it("refuses task_complete (TM-018)", async () => {
    await expect(
      normalizeCodexInput(codexStop, "task_complete", codexContext),
    ).rejects.toThrow(/does not support event: task_complete/);
    expect(CODEX_SUPPORTED_EVENTS).not.toContain("task_complete");
  });

  it("rejects a payload whose event disagrees with the hook event", async () => {
    await expect(
      normalizeCodexInput(codexStop, "after_tool", codexContext),
    ).rejects.toThrow(/does not match hook event/);
  });
});

describe("decision envelope construction", () => {
  it("builds a valid remediation decision and validates the branch", async () => {
    const decision = await buildDecision({
      action: "request_remediation",
      confidence: "high",
      reason_code: "MATERIAL_BOUNDARY_EVIDENCE_GAP",
      summary: "Boundary retry behavior changed without a retry guard test.",
      remediation:
        "Add or update one focused integration test that fails the first attempt and proves exactly one eventual side effect.",
      report_path: ".test-steward/reports/stop-001.json",
      limitations: ["Mutation evidence was not requested."],
      loop_guard: { next_attempt: 1 },
    });
    expect(decision.loop_guard).toEqual({ next_attempt: 1, max_attempts: 2 });
    const reparsed = await parseEnvelope(JSON.parse(emitEnvelope(decision)));
    expect(reparsed.kind).toBe("decision");
    await expect(parseDecision(decision)).resolves.toBeDefined();
  });

  it("rejects request_remediation without remediation text", async () => {
    await expect(
      parseDecision({
        schema_version: "1.0",
        action: "request_remediation",
        confidence: "high",
        reason_code: "X_GAP",
        summary: "s",
        remediation: null,
        report_path: null,
        limitations: [],
        loop_guard: { next_attempt: 1, max_attempts: 2 },
      }),
    ).rejects.toThrow(/failed schema validation/);
  });

  it("rejects a bad schema_version", async () => {
    await expect(
      parseInvocation({
        schema_version: "2.0",
        host: "codex",
        host_version: null,
        event: "turn_stop",
        session_id: null,
        turn_id: null,
        cwd: "/tmp/x",
        repo_root: null,
        tool: { name: null, input_ref: null, result_ref: null },
        loop_guard: { already_remediated: false, attempt: 0 },
        raw_payload_ref: null,
      }),
    ).rejects.toThrow(/failed schema validation/);
  });

  it("clamps next_attempt into the schema range", async () => {
    const decision = await buildDecision({
      action: "allow",
      confidence: "high",
      reason_code: "VERIFIED",
      summary: "ok",
      remediation: null,
      report_path: null,
      loop_guard: { next_attempt: 5 },
    });
    expect(decision.loop_guard.next_attempt).toBe(1);
  });
});

describe("host translation matrix", () => {
  const remediate = {
    schema_version: "1.0" as const,
    action: "request_remediation" as const,
    confidence: "high" as const,
    reason_code: "MATERIAL_BOUNDARY_EVIDENCE_GAP",
    summary: "Boundary retry changed without a retry guard test.",
    remediation:
      "Add one focused integration test proving exactly one side effect.",
    report_path: ".test-steward/reports/stop-001.json",
    limitations: ["Mutation evidence was not requested."],
    loop_guard: { next_attempt: 1, max_attempts: 2 as const },
  };

  const allow = {
    schema_version: "1.0" as const,
    action: "allow" as const,
    confidence: "high" as const,
    reason_code: "VERIFIED_WITH_RECEIPT",
    summary: "Verified.",
    remediation: null,
    report_path: null,
    limitations: [],
    loop_guard: { next_attempt: 0, max_attempts: 2 as const },
  };

  const advise = {
    schema_version: "1.0" as const,
    action: "advise" as const,
    confidence: "medium" as const,
    reason_code: "INSUFFICIENT_EVIDENCE",
    summary: "Coverage evidence absent for the changed boundary.",
    remediation: null,
    report_path: ".test-steward/reports/stop-002.json",
    limitations: ["Coverage tool unavailable."],
    loop_guard: { next_attempt: 0, max_attempts: 2 as const },
  };

  const deny = {
    schema_version: "1.0" as const,
    action: "deny_tool" as const,
    confidence: "high" as const,
    reason_code: "DESTRUCTIVE_COMMAND_PATTERN",
    summary: "Command matches a denied destructive pattern.",
    remediation: null,
    report_path: null,
    limitations: [],
    loop_guard: { next_attempt: 0, max_attempts: 2 as const },
  };

  it("claude: request_remediation blocks on Stop-family events", () => {
    for (const event of [
      "turn_stop",
      "subagent_stop",
      "task_complete",
    ] as const) {
      const output = translateClaudeDecision(event, remediate);
      expect(output.exitCode).toBe(0);
      const parsed = JSON.parse(output.stdout ?? "") as {
        decision: string;
        reason: string;
      };
      expect(parsed.decision).toBe("block");
      expect(parsed.reason).toContain("focused integration test");
    }
  });

  it("claude: request_remediation degrades to advice on unsupported events", () => {
    const output = translateClaudeDecision("after_tool", remediate);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain("Test Steward advice");
    expect(output.stdout).toContain(
      "request_remediation is not supported on after_tool",
    );
  });

  it("claude: deny_tool uses the PreToolUse permission shape only", () => {
    const output = translateClaudeDecision("before_tool", deny);
    const parsed = JSON.parse(output.stdout ?? "") as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    const degraded = translateClaudeDecision("after_tool", deny);
    expect(degraded.stdout).toContain(
      "deny_tool is not supported on after_tool",
    );
  });

  it("claude: allow is silent, advise uses context where supported", () => {
    expect(translateClaudeDecision("turn_stop", allow).stdout).toBeNull();
    const context = translateClaudeDecision("session_start", advise);
    const parsed = JSON.parse(context.stdout ?? "") as {
      decision: string;
      additionalContext: string;
    };
    expect(parsed.decision).toBe("allow");
    expect(parsed.additionalContext).toContain("stop-002.json");
    const plain = translateClaudeDecision("turn_stop", advise);
    expect(plain.stdout).toContain("Test Steward advice");
  });

  it("codex: request_remediation blocks on Stop and SubagentStop", () => {
    for (const event of ["turn_stop", "subagent_stop"] as const) {
      const output = translateCodexDecision(event, remediate);
      const parsed = JSON.parse(output.stdout ?? "") as {
        decision: string;
        reason: string;
      };
      expect(parsed.decision).toBe("block");
      expect(parsed.reason).toContain("focused integration test");
    }
  });

  it("codex: request_remediation degrades to advice outside Stop family", () => {
    const output = translateCodexDecision("after_tool", remediate);
    expect(JSON.parse(output.stdout ?? "")).toMatchObject({
      decision: "allow",
    });
    expect(output.stdout).toContain("request_remediation is not supported");
  });

  it("codex: allow emits JSON on Stop-family events", () => {
    const output = translateCodexDecision("turn_stop", allow);
    expect(JSON.parse(output.stdout ?? "")).toEqual({ decision: "allow" });
    expect(translateCodexDecision("before_tool", allow).stdout).toBeNull();
  });

  it("codex: advise places bounded context with limitations and report path", () => {
    const output = translateCodexDecision("turn_stop", advise);
    const parsed = JSON.parse(output.stdout ?? "") as {
      decision: string;
      additionalContext: string;
    };
    expect(parsed.decision).toBe("allow");
    expect(parsed.additionalContext).toContain("stop-002.json");
    expect(parsed.additionalContext).toContain("Coverage tool unavailable.");
  });

  it("codex: deny_tool blocks only on before_tool", () => {
    const output = translateCodexDecision("before_tool", deny);
    expect(JSON.parse(output.stdout ?? "")).toMatchObject({
      decision: "block",
    });
    const degraded = translateCodexDecision("turn_stop", deny);
    expect(degraded.stdout).toContain(
      "deny_tool is not supported on turn_stop",
    );
  });
});

describe("host invocation builders", () => {
  it("buildInvocation validates and fills null tool fields", async () => {
    const invocation = await buildInvocation({
      host: "direct",
      host_version: null,
      event: "session_start",
      session_id: null,
      turn_id: null,
      cwd: "/repo",
      repo_root: "/repo",
      loop_guard: { already_remediated: false, attempt: 0 },
      raw_payload_ref: null,
    });
    expect(invocation.tool).toEqual({
      name: null,
      input_ref: null,
      result_ref: null,
    });
  });
});
