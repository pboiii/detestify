// Host-neutral hook envelopes: parse/emit the two `hook-io.schema.json`
// branches (invocation and decision), validated through the M0 schema layer.
// Core policy code imports only these types — never Claude/Codex wire types.

import { formatSchemaErrors, getValidator } from "../core/schemas/index.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";

export const HOOK_SCHEMA_VERSION = "1.0";

export type HookHost = "claude" | "codex" | "direct" | "ci";

export type HookEvent =
  | "session_start"
  | "before_tool"
  | "after_tool"
  | "task_complete"
  | "subagent_stop"
  | "turn_stop"
  | "session_end";

export type HookAction =
  | "allow"
  | "advise"
  | "request_remediation"
  | "deny_tool";

export interface LoopGuard {
  readonly already_remediated: boolean;
  readonly attempt: number;
}

export interface ToolRefs {
  readonly name: string | null;
  readonly input_ref: string | null;
  readonly result_ref: string | null;
}

export interface NormalizedInvocation {
  readonly schema_version: "1.0";
  readonly host: HookHost;
  readonly host_version: string | null;
  readonly event: HookEvent;
  readonly session_id: string | null;
  readonly turn_id: string | null;
  readonly cwd: string;
  readonly repo_root: string | null;
  readonly tool: ToolRefs;
  readonly loop_guard: LoopGuard;
  readonly raw_payload_ref: string | null;
}

export type HookConfidence = "high" | "medium" | "low" | "unknown";

export interface DecisionLoopGuard {
  readonly next_attempt: number;
  readonly max_attempts: 2;
}

export interface NormalizedDecision {
  readonly schema_version: "1.0";
  readonly action: HookAction;
  readonly confidence: HookConfidence;
  readonly reason_code: string;
  readonly summary: string;
  readonly remediation: string | null;
  readonly report_path: string | null;
  readonly limitations: readonly string[];
  readonly loop_guard: DecisionLoopGuard;
}

export class HookEnvelopeError extends Error {
  constructor(
    readonly branch: "invocation" | "decision",
    errors: readonly ErrorObject[],
  ) {
    super(
      `Hook ${branch} failed schema validation: ${formatSchemaErrors([
        ...errors,
      ])}`,
    );
    this.name = "HookEnvelopeError";
  }
}

let cachedValidator: ValidateFunction | undefined;

async function getValidators(): Promise<ValidateFunction> {
  cachedValidator ??= await getValidator("hook-io.schema.json");
  return cachedValidator;
}

/**
 * Validate that `value` is a schema-valid invocation envelope and return it
 * with the exact readonly shape the core reads.
 */
export async function parseInvocation(
  value: unknown,
): Promise<NormalizedInvocation> {
  const validate = await getValidators();
  if (validate(value)) {
    return value as NormalizedInvocation;
  }
  throw new HookEnvelopeError("invocation", validate.errors ?? []);
}

/**
 * Validate that `value` is a schema-valid decision envelope. Callers that must
 * distinguish branches use `parseEnvelope`.
 */
export async function parseDecision(
  value: unknown,
): Promise<NormalizedDecision> {
  const validate = await getValidators();
  if (validate(value)) {
    return value as NormalizedDecision;
  }
  throw new HookEnvelopeError("decision", validate.errors ?? []);
}

export type HookEnvelope =
  | { readonly kind: "invocation"; readonly value: NormalizedInvocation }
  | { readonly kind: "decision"; readonly value: NormalizedDecision };

function looksLikeDecision(value: object): boolean {
  return "action" in value && "reason_code" in value;
}

/** Parse either branch of hook-io.schema.json, distinguishing by shape. */
export async function parseEnvelope(value: unknown): Promise<HookEnvelope> {
  const validate = await getValidators();
  if (validate(value)) {
    return typeof value === "object" &&
      value !== null &&
      looksLikeDecision(value)
      ? { kind: "decision", value: value as NormalizedDecision }
      : { kind: "invocation", value: value as NormalizedInvocation };
  }
  // A valid value always has schema_version "1.0"; anything else fails the
  // shared const and is classified by its discriminator-ish fields.
  const object =
    typeof value === "object" && value !== null ? value : ({} as object);
  throw new HookEnvelopeError(
    looksLikeDecision(object) ? "decision" : "invocation",
    validate.errors ?? [],
  );
}

/**
 * Assemble an invocation envelope with defaults for optional-null fields,
 * validating the result against the packaged schema.
 */
export async function buildInvocation(fields: {
  host: HookHost;
  host_version: string | null;
  event: HookEvent;
  session_id: string | null;
  turn_id: string | null;
  cwd: string;
  repo_root: string | null;
  tool?: {
    name?: string | null;
    input_ref?: string | null;
    result_ref?: string | null;
  };
  loop_guard: LoopGuard;
  raw_payload_ref: string | null;
}): Promise<NormalizedInvocation> {
  const invocation: NormalizedInvocation = {
    schema_version: HOOK_SCHEMA_VERSION,
    host: fields.host,
    host_version: fields.host_version,
    event: fields.event,
    session_id: fields.session_id,
    turn_id: fields.turn_id,
    cwd: fields.cwd,
    repo_root: fields.repo_root,
    tool: {
      name: fields.tool?.name ?? null,
      input_ref: fields.tool?.input_ref ?? null,
      result_ref: fields.tool?.result_ref ?? null,
    },
    loop_guard: fields.loop_guard,
    raw_payload_ref: fields.raw_payload_ref,
  };
  return parseInvocation(invocation);
}

/**
 * Assemble a decision envelope, validating the result against the packaged
 * schema. `next_attempt` is clamped to the 0..1 the schema permits.
 */
export async function buildDecision(fields: {
  action: HookAction;
  confidence: HookConfidence;
  reason_code: string;
  summary: string;
  remediation: string | null;
  report_path: string | null;
  limitations?: readonly string[];
  loop_guard: { next_attempt: number };
}): Promise<NormalizedDecision> {
  const decision: NormalizedDecision = {
    schema_version: HOOK_SCHEMA_VERSION,
    action: fields.action,
    confidence: fields.confidence,
    reason_code: fields.reason_code,
    summary: fields.summary,
    remediation: fields.remediation,
    report_path: fields.report_path,
    limitations: fields.limitations ?? [],
    loop_guard: {
      next_attempt: Math.min(1, Math.max(0, fields.loop_guard.next_attempt)),
      max_attempts: 2,
    },
  };
  return parseDecision(decision);
}

/** Serialize an envelope for host or fixture output. */
export function emitEnvelope(
  envelope: NormalizedInvocation | NormalizedDecision,
): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
