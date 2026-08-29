// Adapter for the spec/handoff/policy-goldens contract: parse one prepared
// scenario input and run it through the real policy pipeline (rule catalog +
// materiality tables + ADR-004 gates). The scenario supplies prepared facts
// and declared provenance; the engine supplies the decision. No model is
// consulted (pr-suite.md fixture mode).

import { decideRule, type PolicyEvaluation } from "./index.js";
import { POLICY_RULES_BY_ID } from "./rules.js";

export type GoldenPolarity = "positive" | "negative" | "ambiguous";

export interface GoldenScenario {
  readonly case_id: string;
  readonly rule_id: string;
  readonly polarity: GoldenPolarity;
  readonly example: string;
  readonly changed_paths: readonly string[];
  readonly declared_obligations: readonly string[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Golden scenario field ${field} must be a string`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Golden scenario field ${field} must be a string array`);
  }
  return value as string[];
}

/** Parse a raw policy-golden `.input.json` document. */
export function parseGoldenScenario(raw: unknown): GoldenScenario {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Golden scenario input must be an object");
  }
  const doc = raw as Record<string, unknown>;
  const diff = (doc["diff_summary"] ?? {}) as Record<string, unknown>;
  const repo = (doc["repo_shape"] ?? {}) as Record<string, unknown>;
  const polarity = requireString(doc["polarity"], "polarity");
  if (
    polarity !== "positive" &&
    polarity !== "negative" &&
    polarity !== "ambiguous"
  ) {
    throw new Error(`Unknown golden polarity: ${polarity}`);
  }
  return {
    case_id: requireString(doc["case_id"], "case_id"),
    rule_id: requireString(doc["rule_id"], "rule_id"),
    polarity,
    example: requireString(doc["example"], "example"),
    changed_paths: requireStringArray(
      diff["changed_paths"] ?? [],
      "diff_summary.changed_paths",
    ),
    declared_obligations: requireStringArray(
      repo["declared_obligations"] ?? [],
      "repo_shape.declared_obligations",
    ),
  };
}

/** Fixed evidence timestamp: golden runs are fully deterministic. */
export const GOLDEN_OBSERVED_AT = "2026-08-28T00:00:00Z";

/** Run one golden scenario through classifier determination + policy + materiality. */
export function decideGoldenScenario(
  scenario: GoldenScenario,
): PolicyEvaluation {
  const rule = POLICY_RULES_BY_ID.get(scenario.rule_id);
  if (rule === undefined) {
    throw new Error(
      `Golden scenario references unknown rule ${scenario.rule_id}`,
    );
  }
  return decideRule(
    {
      ruleId: rule.id,
      applicability:
        scenario.polarity === "positive"
          ? "applies"
          : scenario.polarity === "negative"
            ? "not_applies"
            : "ambiguous",
      statement: scenario.example,
      paths: scenario.changed_paths,
      declaredRefs: scenario.declared_obligations,
    },
    {
      mode: "advisory",
      elevatedRuleIds: [],
      observedAt: GOLDEN_OBSERVED_AT,
      ids: {
        decision: `decision-${scenario.case_id}`,
        obligation: `obligation-${scenario.case_id}`,
        evidence: `evidence-${scenario.case_id}`,
      },
      presentation: {
        reasonCode: `GOLDEN_${rule.id.replace(/-/g, "_")}_${scenario.polarity.toUpperCase()}`,
        summary: `Golden ${scenario.polarity} outcome for ${rule.id}.`,
        rationale: `${scenario.example} Rule contract: ${rule.statement}`,
      },
    },
  );
}

/** Convenience: parse and decide one raw golden input document. */
export function decideGoldenInput(raw: unknown): PolicyEvaluation {
  return decideGoldenScenario(parseGoldenScenario(raw));
}
