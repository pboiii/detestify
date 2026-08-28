// Model-visible output budgets, enforced before host translation so host
// truncation is never relied upon (ADR-005 output budgets, CON-009).
// Hosts embed these fields as JSON string literals, so a field's visible size
// is measured on its JSON-escaped form: the byte cap counts UTF-8 bytes of the
// escaped string, and the remediation cap counts characters of the escaped string.

import { Buffer } from "node:buffer";

export const MODEL_VISIBLE_BYTE_LIMIT = 6000;
export const REMEDIATION_CHAR_LIMIT = 1500;

export function jsonByteLength(text: string): number {
  return Buffer.byteLength(JSON.stringify(text), "utf8");
}

/** Drop a trailing dangling backslash so `cut` ends on an escape boundary. */
function escapeBoundarySafe(cut: string): string {
  let trailing = 0;
  for (let i = cut.length - 1; i >= 0 && cut[i] === "\\"; i -= 1) {
    trailing += 1;
  }
  return trailing % 2 === 1 ? cut.slice(0, -1) : cut;
}

function parsePrefix(cut: string): string {
  return JSON.parse(`${cut}"`) as string;
}

/** Truncate `text` so its JSON string form is at most `keep` characters. */
export function limitJsonChars(text: string, keep: number): string {
  const escaped = JSON.stringify(text);
  if (escaped.length <= keep) {
    return text;
  }
  const cut = escapeBoundarySafe(escaped.slice(0, Math.max(1, keep - 2)));
  // A code-unit cut can split a surrogate pair; drop the lone half.
  const whole = cut.replace(/[\uD800-\uDFFF]+$/u, "");
  return `${parsePrefix(whole)}…`;
}

/** Truncate `text` so its JSON string form is at most `budget` UTF-8 bytes. */
export function limitJsonBytes(text: string, budget: number): string {
  const escaped = JSON.stringify(text);
  if (Buffer.byteLength(escaped, "utf8") <= budget) {
    return text;
  }
  const cut = Buffer.from(escaped, "utf8")
    .subarray(0, Math.max(1, budget - 4))
    .toString("utf8");
  // A byte-level cut can split a multi-byte character; drop the fragments.
  const whole = cut.replace(/[\uDC00-\uDFFF�]+$/u, "");
  return `${parsePrefix(escapeBoundarySafe(whole))}…`;
}

/** Clamp the remediation field to its 1,500-character schema cap. */
export function limitRemediation(text: string): string {
  return limitJsonChars(text, REMEDIATION_CHAR_LIMIT);
}

type FieldName = "summary" | "reason" | "remediation";

export interface ModelBudgetResult {
  readonly fields: {
    readonly summary?: string;
    readonly reason?: string | null;
    readonly remediation?: string | null;
  };
  readonly exceeded: boolean;
}

/**
 * Clamp every model-visible string field of a host decision output to the
 * aggregate 6,000-UTF-8-byte budget, proportionally, before translation.
 */
export function limitModelVisibleFields(
  fields: {
    readonly summary?: string;
    readonly reason?: string | null;
    readonly remediation?: string | null;
  },
  budget: number = MODEL_VISIBLE_BYTE_LIMIT,
): ModelBudgetResult {
  const entries: { name: FieldName; value: string }[] = [];
  if (fields.summary !== undefined) {
    entries.push({ name: "summary", value: fields.summary });
  }
  if (fields.reason !== undefined && fields.reason !== null) {
    entries.push({ name: "reason", value: fields.reason });
  }
  if (fields.remediation !== undefined && fields.remediation !== null) {
    entries.push({
      name: "remediation",
      value: limitJsonChars(fields.remediation, REMEDIATION_CHAR_LIMIT),
    });
  }

  for (const entry of entries) {
    entry.value = limitJsonBytes(entry.value, budget);
  }

  let total = entries.reduce(
    (sum, entry) => sum + jsonByteLength(entry.value),
    0,
  );
  while (total > budget && entries.length > 0) {
    const share = Math.max(1, Math.ceil((total - budget) / entries.length));
    for (const entry of entries) {
      entry.value = limitJsonBytes(
        entry.value,
        Math.max(1, jsonByteLength(entry.value) - share),
      );
    }
    const next = entries.reduce(
      (sum, entry) => sum + jsonByteLength(entry.value),
      0,
    );
    if (next >= total) {
      break;
    }
    total = next;
  }

  const clamped: {
    summary?: string;
    reason?: string | null;
    remediation?: string | null;
  } = {};
  for (const entry of entries) {
    clamped[entry.name] = entry.value;
  }
  return { fields: clamped, exceeded: total > budget };
}
