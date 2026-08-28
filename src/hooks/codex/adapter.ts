// Codex adapter: raw Codex command-hook stdin -> normalized invocation, and
// normalized decision -> event-specific Codex output. `task_complete` is
// advertised unsupported and never emitted (CON-002, TM-018).

import {
  buildInvocation,
  type HookEvent,
  type NormalizedDecision,
  type NormalizedInvocation,
} from "../normalized.js";
import { redactJson, redactText } from "../../security/redaction.js";
import { limitModelVisibleFields } from "../../security/limits.js";

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
  readonly exitCode: 0 | 2;
}

/** Codex events whose documented output accepts additionalContext. */
const CODEX_CONTEXT_EVENTS: ReadonlySet<HookEvent> = new Set([
  "session_start",
  "after_tool",
  "subagent_stop",
  "turn_stop",
]);

const CODEX_BLOCK_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
]);

function boundedText(
  summary: string,
  primary: string | null,
): { summary: string; primary: string } {
  const { fields } = limitModelVisibleFields({ summary, reason: primary });
  return {
    summary: fields.summary ?? summary,
    primary: fields.reason ?? primary ?? summary,
  };
}

function codexAdvice(
  event: HookEvent,
  decision: NormalizedDecision,
  extraLimitation?: string,
): HostOutput {
  const { summary } = boundedText(decision.summary, decision.remediation);
  const limitations = [
    ...decision.limitations,
    ...(extraLimitation !== undefined ? [extraLimitation] : []),
  ];
  if (CODEX_CONTEXT_EVENTS.has(event)) {
    const text = [
      redactText(summary),
      decision.report_path !== null ? `Report: ${decision.report_path}` : null,
      limitations.length > 0 ? `Limitations: ${limitations.join("; ")}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n");
    return {
      stdout: `${JSON.stringify({
        decision: "allow",
        additionalContext: text,
      })}\n`,
      exitCode: 0,
    };
  }
  // Codex requires JSON on stdout for Stop-family events; plain text otherwise.
  const lines = [`Test Steward advice: ${redactText(summary)}`];
  if (decision.report_path !== null) {
    lines.push(`Report: ${decision.report_path}`);
  }
  return { stdout: `${lines.join("\n")}\n`, exitCode: 0 };
}

/**
 * Translate a normalized decision into the event-specific Codex output.
 * Unsupported action/event pairs degrade to advice with a limitation.
 */
export function translateCodexDecision(
  event: HookEvent,
  decision: NormalizedDecision,
): HostOutput {
  const { primary } = boundedText(decision.summary, decision.remediation);

  if (decision.action === "allow") {
    return {
      stdout: CODEX_BLOCK_EVENTS.has(event)
        ? `${JSON.stringify({ decision: "allow" })}\n`
        : null,
      exitCode: 0,
    };
  }

  if (decision.action === "advise") {
    return codexAdvice(event, decision);
  }

  if (decision.action === "deny_tool") {
    if (event !== "before_tool") {
      return codexAdvice(
        event,
        { ...decision, remediation: null },
        `deny_tool is not supported on ${event}; degraded to advice.`,
      );
    }
    return {
      stdout: `${JSON.stringify({
        decision: "block",
        reason: redactText(primary),
      })}\n`,
      exitCode: 0,
    };
  }

  // request_remediation
  if (!CODEX_BLOCK_EVENTS.has(event)) {
    return codexAdvice(
      event,
      { ...decision, remediation: null },
      `request_remediation is not supported on ${event}; degraded to advice.`,
    );
  }
  return {
    stdout: `${JSON.stringify({
      decision: "block",
      reason: redactText(primary),
    })}\n`,
    exitCode: 0,
  };
}
