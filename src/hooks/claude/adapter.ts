// Claude Code adapter: raw Claude command-hook stdin -> normalized
// invocation, and normalized decision -> event-specific Claude JSON output.
// Never a generic cross-host block shape (ADR-005, threat model §4).

import {
  buildInvocation,
  type HookEvent,
  type NormalizedDecision,
  type NormalizedInvocation,
} from "../normalized.js";
import { redactJson, redactText } from "../../security/redaction.js";
import { limitModelVisibleFields } from "../../security/limits.js";

const CLAUDE_EVENT_MAP: Readonly<Record<string, HookEvent>> = {
  SessionStart: "session_start",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  TaskCompleted: "task_complete",
  SubagentStop: "subagent_stop",
  Stop: "turn_stop",
  SessionEnd: "session_end",
};

export const CLAUDE_SUPPORTED_EVENTS: readonly HookEvent[] = [
  "session_start",
  "before_tool",
  "after_tool",
  "task_complete",
  "subagent_stop",
  "turn_stop",
  "session_end",
];

export interface AdapterContext {
  readonly hostVersion: string | null;
  readonly repoRoot: string | null;
  /** Fallback cwd when the raw payload lacks an absolute one. */
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
 * Normalize a raw Claude hook payload (stdin JSON) into the schema-valid
 * invocation envelope. The declared event comes from the launcher argv;
 * a payload claiming a different event is rejected (TM-001).
 */
export async function normalizeClaudeInput(
  raw: unknown,
  declaredEvent: HookEvent,
  context: AdapterContext,
): Promise<NormalizedInvocation> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Claude hook payload must be a JSON object.");
  }
  if (!CLAUDE_SUPPORTED_EVENTS.includes(declaredEvent)) {
    throw new Error(
      `Claude adapter does not support normalized event: ${declaredEvent}`,
    );
  }
  const rawName = optionalString(raw, "hook_event_name");
  if (rawName !== null) {
    const mapped = CLAUDE_EVENT_MAP[rawName];
    if (mapped === undefined) {
      throw new Error(`Unknown Claude hook event in payload: ${rawName}`);
    }
    if (mapped !== declaredEvent) {
      throw new Error(
        `Claude payload event ${rawName} does not match hook event ${declaredEvent}.`,
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
      ? await context.store(redactJson(toolInput), "claude-tool-input")
      : null;
  const resultRef =
    isToolEvent && toolResponse !== undefined && toolResponse !== null
      ? await context.store(redactJson(toolResponse), "claude-tool-result")
      : null;
  const rawPayloadRef = await context.store(
    redactJson(raw),
    `claude-${declaredEvent}`,
  );

  return buildInvocation({
    host: "claude",
    host_version: context.hostVersion,
    event: declaredEvent,
    session_id: optionalString(raw, "session_id"),
    // Claude payloads carry no turn identifier in the current release.
    turn_id: null,
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

/** Claude events whose documented output accepts additional context. */
const CLAUDE_CONTEXT_EVENTS: ReadonlySet<HookEvent> = new Set([
  "session_start",
  "after_tool",
]);

const CLAUDE_BLOCK_EVENTS: ReadonlySet<HookEvent> = new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete",
]);

function boundedText(
  summary: string,
  primary: string | null,
): { summary: string; primary: string } {
  const { fields } = limitModelVisibleFields({
    summary,
    reason: primary,
  });
  return {
    summary: fields.summary ?? summary,
    primary: fields.reason ?? primary ?? summary,
  };
}

function plainAdvice(
  decision: NormalizedDecision,
  extraLimitation?: string,
): HostOutput {
  const { summary } = boundedText(decision.summary, decision.remediation);
  const limitations = [
    ...decision.limitations,
    ...(extraLimitation !== undefined ? [extraLimitation] : []),
  ];
  const lines = [`Test Steward advice: ${redactText(summary)}`];
  if (decision.report_path !== null) {
    lines.push(`Report: ${decision.report_path}`);
  }
  if (limitations.length > 0) {
    lines.push(`Limitations: ${redactText(limitations.join("; "))}`);
  }
  return { stdout: `${lines.join("\n")}\n`, exitCode: 0 };
}

/**
 * Translate a normalized decision into the event-specific Claude output.
 * Unsupported action/event pairs degrade to advice with a limitation.
 */
export function translateClaudeDecision(
  event: HookEvent,
  decision: NormalizedDecision,
): HostOutput {
  const { summary, primary } = boundedText(
    decision.summary,
    decision.remediation,
  );

  if (decision.action === "allow") {
    return { stdout: null, exitCode: 0 };
  }

  if (decision.action === "advise") {
    if (CLAUDE_CONTEXT_EVENTS.has(event)) {
      return {
        stdout: `${JSON.stringify({
          decision: "allow",
          additionalContext: redactText(
            `${summary}${decision.report_path !== null ? ` Report: ${decision.report_path}` : ""}`,
          ),
        })}\n`,
        exitCode: 0,
      };
    }
    return plainAdvice(decision);
  }

  if (decision.action === "deny_tool") {
    if (event !== "before_tool") {
      return plainAdvice(
        { ...decision, remediation: null },
        `deny_tool is not supported on ${event}; degraded to advice.`,
      );
    }
    return {
      stdout: `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: redactText(primary),
        },
      })}\n`,
      exitCode: 0,
    };
  }

  // request_remediation
  if (!CLAUDE_BLOCK_EVENTS.has(event)) {
    return plainAdvice(
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
