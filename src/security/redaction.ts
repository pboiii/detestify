// Secret and path redaction for untrusted hook content (threat model TM-005, TM-011).
// Host payloads, tool input/output, transcripts, and repository content are untrusted
// data: known secrets and user-identifying home paths must not reach model-visible
// output or stored raw-payload fixtures.

const REDACTED = "[REDACTED]";

const secretKeyPattern =
  /(?:secret|passw(?:or)?d|pwd|token|api[-_]?key|auth(?:orization)?|credential|private[-_]?key|cookie)/i;

function redactHomePath(match: string): string {
  // "/Users/<name>/rest" or "/home/<name>/rest" -> "~/rest"; bare "/Users/<name>" -> "~"
  const rest = match.replace(/^\/(?:Users|home)\/[^/]+/, "");
  return `~${rest}`;
}

const valuePatterns: readonly {
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}[] = [
  {
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED KEY]",
  },
  {
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9]{16,}\b/g,
    replacement: "[REDACTED TOKEN]",
  },
  {
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/g,
    replacement: "[REDACTED TOKEN]",
  },
  {
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    replacement: "[REDACTED TOKEN]",
  },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED TOKEN]" },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: "[REDACTED TOKEN]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: `Bearer ${REDACTED}`,
  },
  {
    pattern:
      /\b(SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|ACCESS_KEY)[\s]*=[\s]*[^\s,;"']+/gi,
    replacement: "$1=[REDACTED]",
  },
  { pattern: /"(\/(?:Users|home)\/[^/\s"',`)]+)/g, replacement: '"~' },
  {
    pattern: /(?<![\w~"])(\/(?:Users|home)\/[^/\s"',`)]+)/g,
    replacement: (match: string) => redactHomePath(match),
  },
];

export function redactText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of valuePatterns) {
    result = result.replace(pattern, replacement as never);
  }
  return result;
}

export function redactJson(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    result[key] = secretKeyPattern.test(key) ? REDACTED : redactJson(item);
  }
  return result;
}
