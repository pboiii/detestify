// Codex adapter: raw Codex command-hook stdin -> normalized invocation, and
// normalized decision -> event-specific Codex output. `task_complete` is
// advertised unsupported and never emitted (CON-002, TM-018).

import {
  buildInvocation,
  type HookEvent,
  type NormalizedDecision,
  type NormalizedInvocation,
} from "../normalized.js";
import { redactJson } from "../../security/redaction.js";

const CODEX_EVENT_MAP: Readonly<Record<string, HookEvent>> = {
  SessionStart: "session_start",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  SubagentStop: "subagent_stop",
  Stop: "turn_stop",
  SessionEnd: "session_end",
};

/** Events the production Codex adapter may emit; task_complete is absent. */
export const CODEX_SUPPORTED_EVENTS: readonly HookEvent[] = [
  "session_start",
  "before_tool",
  "after_tool",
  "subagent_stop",
  "turn_stop",
  "session_end",
];

/** Capability map used by doctor/capability negotiation. */
export const CODEX_CAPABILITIES = {
  host: "codex",
  supported_events: CODEX_SUPPORTED_EVENTS,
  unsupported_native_event: "task_complete",
} as const;

export interface AdapterContext {
  readonly hostVersion: string | null;
  readonly repoRoot: string | null;
  readonly cwd: string;
  readonly store: (data: unknown, label: string) => Promise<string | null>;
}

function field(raw: object, key: string): unknown {
  return (raw as Record<string, unknown>)[key];
}

function optionalString(raw: object, key: string): string | null {
  const value = field(raw, key);
  return typeof value === "string" ? value : null;
}

/**
 * Normalize a raw Codex hook payload into the schema-valid invocation
 * envelope. The declared event comes from the launcher argv; a payload
 * claiming a different event is rejected (TM-001). `task_complete` is
 * refused outright (TM-018).
 */
export async function normalizeCodexInput(
  raw: unknown,
  declaredEvent: HookEvent,
  context: AdapterContext,
): Promise<NormalizedInvocation> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Codex hook payload must be a JSON object.");
  }
  if (!CODEX_SUPPORTED_EVENTS.includes(declaredEvent)) {
    throw new Error(
      `Codex adapter does not support event: ${declaredEvent} (task_complete has no native Codex event).`,
    );
  }
  const rawName = optionalString(raw, "hook_event_name");
  if (rawName !== null) {
    const mapped = CODEX_EVENT_MAP[rawName];
    if (mapped === undefined) {
      throw new Error(`Unknown Codex hook event in payload: ${rawName}`);
    }
    if (mapped !== declaredEvent) {
      throw new Error(
        `Codex payload event ${rawName} does not match hook event ${declaredEvent}.`,
      );
    }
  }

  const payloadCwd = optionalString(raw, "cwd");
  const cwd =
    payloadCwd !== null && payloadCwd.startsWith("/")
      ? payloadCwd
      : context.cwd;
  const alreadyRemediated = field(raw, "stop_hook_active") === true;
  const isToolEvent =
    declaredEvent === "before_tool" || declaredEvent === "after_tool";

  const toolName = isToolEvent ? optionalString(raw, "tool_name") : null;
  const toolInput = isToolEvent ? field(raw, "tool_input") : undefined;
  const toolResponse = isToolEvent ? field(raw, "tool_response") : undefined;
  const inputRef =
    isToolEvent && toolInput !== undefined && toolInput !== null
      ? await context.store(redactJson(toolInput), "codex-tool-input")
      : null;
  const resultRef =
    isToolEvent && toolResponse !== undefined && toolResponse !== null
      ? await context.store(redactJson(toolResponse), "codex-tool-result")
      : null;
  const rawPayloadRef = await context.store(
    redactJson(raw),
    `codex-${declaredEvent}`,
  );

  return buildInvocation({
    host: "codex",
    host_version: context.hostVersion,
    event: declaredEvent,
    session_id: optionalString(raw, "session_id"),
    turn_id: optionalString(raw, "turn_id"),
    cwd,
    repo_root: context.repoRoot,
    tool: {
      name: toolName,
      input_ref: inputRef,
      result_ref: resultRef,
    },
    loop_guard: {
      already_remediated: alreadyRemediated,
      attempt: alreadyRemediated ? 1 : 0,
    },
    raw_payload_ref: rawPayloadRef,
  });
}

export interface HostOutput {
  readonly stdout: string | null;
  readonly stderr: string | null;
  readonly exitCode: 0 | 2;
}

const ALLOW: HostOutput = { stdout: null, stderr: null, exitCode: 0 };

const CODEX_BLOCK_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
]);

const CODEX_CONTEXT_EVENT_NAMES: Readonly<Partial<Record<HookEvent, string>>> =
  {
    session_start: "SessionStart",
    after_tool: "PostToolUse",
  };

function feedback(decision: NormalizedDecision, action: string): string {
  return `Detestify ${action} (${decision.reason_code}). Run detestify verify-change for details.`;
}

function advice(event: HookEvent, decision: NormalizedDecision): HostOutput {
  const hookEventName = CODEX_CONTEXT_EVENT_NAMES[event];
  if (hookEventName === undefined) {
    return {
      stdout: `${JSON.stringify({
        systemMessage: feedback(decision, "reported guidance"),
      })}\n`,
      stderr: null,
      exitCode: 0,
    };
  }
  return {
    stdout: `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: feedback(decision, "reported guidance"),
      },
    })}\n`,
    stderr: null,
    exitCode: 0,
  };
}

/**
 * Translate a normalized decision into the event-specific Codex output.
 * Unsupported action/event pairs degrade to advice with a limitation.
 */
export function translateCodexDecision(
  event: HookEvent,
  decision: NormalizedDecision,
): HostOutput {
  if (decision.action === "allow") {
    return ALLOW;
  }

  if (decision.action === "advise") {
    return advice(event, decision);
  }

  if (decision.action === "deny_tool") {
    if (event !== "before_tool") {
      return advice(event, decision);
    }
    return {
      stdout: `${JSON.stringify({
        decision: "block",
        reason: feedback(decision, "denied this tool call"),
      })}\n`,
      stderr: null,
      exitCode: 0,
    };
  }

  // request_remediation
  if (!CODEX_BLOCK_EVENTS.has(event)) {
    return advice(event, decision);
  }
  return {
    stdout: `${JSON.stringify({
      decision: "block",
      reason: feedback(decision, "requires verification before completion"),
    })}\n`,
    stderr: null,
    exitCode: 0,
  };
}
