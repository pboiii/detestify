// Shared verify-change core: explicit trust loading (TM-003), state-dir
// filtering, and the plan-level policy verdict that both the CLI command and
// the Stop-hook decider evaluate. Trust to execute repository commands comes
// only from an explicitly passed configuration file; configuration discovered
// inside the repository is inert policy data and can never grant execution.

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { formatSchemaErrors, getValidator } from "../core/schemas/index.js";
import type {
  Decision,
  EvidenceRecord,
  GateAction,
  MaterialityTier,
  ObligationCandidate,
  PolicyMode,
} from "../core/model/index.js";
import {
  decideRule,
  type PolicyEvaluation,
  type RuleDetermination,
} from "../core/policy/index.js";
import { classifyChangeSet } from "../analysis/change-classifier.js";
import { isTestFilePath } from "../analysis/tests.js";
import type { RepositorySnapshot } from "../repository/git.js";

/** Errors whose message prefix the CLI maps to CONFIG_INVALID. */
export class ConfigInvalidError extends Error {
  constructor(detail: string) {
    super(`Configuration ${detail}`);
    this.name = "ConfigInvalidError";
  }
}

export interface CriticalPathRule {
  readonly pattern: string;
  readonly obligation_ids: readonly string[];
  readonly materiality_floor: "T0" | "T1" | "T2" | "T3" | "T4";
}

export interface DeclaredObligation {
  readonly id: string;
  readonly statement: string;
  readonly source: string;
  readonly gate_policy: PolicyMode;
}

export interface LoadedTrust {
  readonly mode: PolicyMode;
  readonly elevatedRuleIds: readonly string[];
  readonly criticalPaths: readonly CriticalPathRule[];
  readonly declaredObligations: readonly DeclaredObligation[];
  /** True only when an explicitly passed configuration grants execution. */
  readonly runRepositoryCommands: boolean;
  /** True only when an explicitly passed configuration requests mutation. */
  readonly mutationRequested: boolean;
  /** Repository-relative configuration path that was read, or null. */
  readonly configPath: string | null;
  readonly explicit: boolean;
  readonly limitations: readonly string[];
}

const UNTRUSTED_DEFAULTS: Omit<LoadedTrust, "limitations"> = {
  mode: "advisory",
  elevatedRuleIds: [],
  criticalPaths: [],
  declaredObligations: [],
  runRepositoryCommands: false,
  mutationRequested: false,
  configPath: null,
  explicit: false,
};

interface RawConfig {
  readonly mode: PolicyMode;
  readonly trusted_operations: {
    readonly run_repository_commands: boolean;
    readonly mutation: boolean;
  };
  readonly critical_paths: readonly CriticalPathRule[];
  readonly declared_obligations: readonly DeclaredObligation[];
  readonly policy: { readonly elevated_rule_ids: readonly string[] };
}

const CONFIG_SIZE_LIMIT = 1_048_576;

async function readValidatedConfig(
  repoRoot: string,
  configPath: string,
): Promise<{ raw: RawConfig; relative: string }> {
  const root = await realpath(repoRoot);
  const resolved = await realpath(path.resolve(root, configPath));
  const relative = path.relative(root, resolved);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new ConfigInvalidError(
      `path escapes the repository root: ${configPath}`,
    );
  }
  const stat = await lstat(resolved);
  if (!stat.isFile()) {
    throw new ConfigInvalidError(`is not a regular file: ${configPath}`);
  }
  if (stat.size > CONFIG_SIZE_LIMIT) {
    throw new ConfigInvalidError(`exceeds 1 MiB: ${configPath}`);
  }
  if (path.extname(resolved) !== ".json") {
    throw new ConfigInvalidError(`must be inert JSON (.json): ${configPath}`);
  }
  const source = await readFile(resolved, "utf8");
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new ConfigInvalidError(
      `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new ConfigInvalidError(
      `failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
  return { raw: document as RawConfig, relative };
}

export const DISCOVERED_CONFIG_PATH = ".test-steward/config.json";

/**
 * Load the trust and policy inputs for one run. An explicit config path is
 * validated strictly and may grant execution trust; a config discovered at
 * `.test-steward/config.json` supplies inert policy data only — its
 * `trusted_operations` are ignored because repository-controlled files must
 * never grant command execution (TM-003).
 */
export async function loadTrust(
  repoRoot: string,
  explicitConfigPath?: string,
): Promise<LoadedTrust> {
  if (explicitConfigPath !== undefined) {
    const { raw, relative } = await readValidatedConfig(
      repoRoot,
      explicitConfigPath,
    );
    return {
      mode: raw.mode,
      elevatedRuleIds: raw.policy.elevated_rule_ids,
      criticalPaths: raw.critical_paths,
      declaredObligations: raw.declared_obligations,
      runRepositoryCommands: raw.trusted_operations.run_repository_commands,
      mutationRequested: raw.trusted_operations.mutation,
      configPath: relative,
      explicit: true,
      limitations: [],
    };
  }

  try {
    const { raw, relative } = await readValidatedConfig(
      repoRoot,
      DISCOVERED_CONFIG_PATH,
    );
    const limitations: string[] = [];
    if (
      raw.trusted_operations.run_repository_commands ||
      raw.trusted_operations.mutation
    ) {
      limitations.push(
        "Discovered repository configuration cannot grant execution trust; pass --config explicitly to run repository commands.",
      );
    }
    return {
      mode: raw.mode,
      elevatedRuleIds: raw.policy.elevated_rule_ids,
      criticalPaths: raw.critical_paths,
      declaredObligations: raw.declared_obligations,
      runRepositoryCommands: false,
      mutationRequested: false,
      configPath: relative,
      explicit: false,
      limitations,
    };
  } catch (error) {
    if (error instanceof ConfigInvalidError) {
      return {
        ...UNTRUSTED_DEFAULTS,
        limitations: [
          `Discovered configuration ${DISCOVERED_CONFIG_PATH} was ignored: ${error.message}`,
        ],
      };
    }
    // ENOENT and friends: no configuration exists.
    return { ...UNTRUSTED_DEFAULTS, limitations: [] };
  }
}

const OWN_STATE_PREFIX = ".test-steward";

/**
 * Remove Test Steward's own state directory from a snapshot so reports and
 * receipts written under `.test-steward/` never change the analyzed diff or
 * its fingerprint.
 */
export function stripOwnState(
  snapshot: RepositorySnapshot,
): RepositorySnapshot {
  const changedFiles = snapshot.changedFiles.filter(
    (file) =>
      file.path !== OWN_STATE_PREFIX &&
      !file.path.startsWith(`${OWN_STATE_PREFIX}/`),
  );
  return { ...snapshot, changedFiles };
}

/** Convert a config glob (no shell expansion) to an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("**")
    .map((part) =>
      part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

export interface PlanStage {
  readonly decisions: readonly Decision[];
  readonly obligations: readonly ObligationCandidate[];
  readonly evidence: readonly EvidenceRecord[];
  /** Rule ids that produced a decision, in decision order. */
  readonly ruleIds: readonly string[];
  readonly strongestAction: GateAction;
  readonly strongestDecision: Decision | null;
  readonly limitations: readonly string[];
}

const ACTION_RANK: Readonly<Record<GateAction, number>> = {
  allow: 0,
  advise: 1,
  request_remediation: 2,
  deny_tool: 2,
};

const TIER_RANK: Readonly<Record<MaterialityTier, number>> = {
  T0: 0,
  TU: 1,
  T1: 2,
  T2: 3,
  T3: 4,
  T4: 5,
};

export interface PlanStageInput {
  /** Snapshot with `.test-steward/` already stripped. */
  readonly snapshot: RepositorySnapshot;
  readonly trust: LoadedTrust;
  readonly observedAt: string;
  /** Changed (non-deleted) test file paths from the same snapshot. */
  readonly changedTestFiles: readonly string[];
  /** Identifier prefix for report-local ids. */
  readonly idPrefix: string;
}

function reasonCodeFor(ruleId: string): string {
  return ruleId.replace(/-/g, "_");
}

/**
 * Evaluate the plan-level policy verdict for the current diff: deterministic
 * change classification plus declared critical-path obligations, each decided
 * through the core policy engine (materiality tables + ADR-004 gates).
 */
export function evaluatePlanStage(input: PlanStageInput): PlanStage {
  const { snapshot, trust, observedAt, changedTestFiles, idPrefix } = input;
  const limitations: string[] = [];
  const determinations: Array<{
    det: RuleDetermination;
    reasonCode: string;
    summary: string;
  }> = [];

  const classified = classifyChangeSet({
    changedFiles: snapshot.changedFiles,
  });
  limitations.push(...classified.limitations);

  const evidenceGap = changedTestFiles.length > 0 ? "partial" : "material";
  const existingTestPath = changedTestFiles[0];

  for (const classification of classified.classes) {
    determinations.push({
      det: {
        ruleId: classification.ruleId,
        applicability: "applies",
        statement: classification.rationale,
        paths: classification.paths,
        ...(classification.provenance === "observed"
          ? { observedRefs: classification.paths }
          : { fallbackProvenance: classification.provenance }),
        evidenceGap,
        ...(existingTestPath !== undefined ? { existingTestPath } : {}),
      },
      reasonCode: reasonCodeFor(classification.ruleId),
      summary: classification.rationale,
    });
  }

  const obligationsById = new Map(
    trust.declaredObligations.map((obligation) => [obligation.id, obligation]),
  );
  const changedNonTestPaths = snapshot.changedFiles
    .map((file) => file.path)
    .filter((file) => !isTestFilePath(file));
  for (const rule of trust.criticalPaths) {
    const matcher = globToRegExp(rule.pattern);
    const matched = changedNonTestPaths.filter((file) => matcher.test(file));
    if (matched.length === 0) {
      continue;
    }
    const declaredRefs = rule.obligation_ids.map((id) => {
      const declared = obligationsById.get(id);
      return declared === undefined ? id : `${id}:${declared.source}`;
    });
    determinations.push({
      det: {
        ruleId: "TST-001",
        applicability: "applies",
        statement: `Changed paths match declared critical path ${rule.pattern}.`,
        paths: matched,
        declaredRefs: declaredRefs.length > 0 ? declaredRefs : [rule.pattern],
        evidenceGap,
        ...(existingTestPath !== undefined ? { existingTestPath } : {}),
      },
      reasonCode: "DECLARED_CRITICAL_PATH_CHANGED",
      summary: `Declared critical path ${rule.pattern} changed without verified evidence.`,
    });
  }

  const evaluations: PolicyEvaluation[] = determinations.map((entry, index) =>
    decideRule(entry.det, {
      mode: trust.mode,
      elevatedRuleIds: trust.elevatedRuleIds,
      observedAt,
      ids: {
        decision: `${idPrefix}-decision-${index + 1}`,
        obligation: `${idPrefix}-obligation-${index + 1}`,
        evidence: `${idPrefix}-evidence-${index + 1}`,
      },
      presentation: {
        reasonCode: entry.reasonCode,
        summary: entry.summary.slice(0, 500),
        rationale: entry.det.statement,
      },
    }),
  );

  let strongest: Decision | null = null;
  for (const evaluation of evaluations) {
    if (strongest === null) {
      strongest = evaluation.decision;
      continue;
    }
    const candidate = evaluation.decision;
    const candidateTier = evaluation.obligation?.materiality.tier ?? "TU";
    const strongestEvaluation = evaluations.find(
      (entry) => entry.decision === strongest,
    );
    const strongestTier =
      strongestEvaluation?.obligation?.materiality.tier ?? "TU";
    if (
      ACTION_RANK[candidate.gate_action] > ACTION_RANK[strongest.gate_action] ||
      (ACTION_RANK[candidate.gate_action] ===
        ACTION_RANK[strongest.gate_action] &&
        TIER_RANK[candidateTier] > TIER_RANK[strongestTier])
    ) {
      strongest = candidate;
    }
  }

  return {
    decisions: evaluations.map((evaluation) => evaluation.decision),
    obligations: evaluations.flatMap((evaluation) =>
      evaluation.obligation === null ? [] : [evaluation.obligation],
    ),
    evidence: evaluations.map((evaluation) => evaluation.evidence),
    ruleIds: determinations.map((entry) => entry.det.ruleId),
    strongestAction: strongest?.gate_action ?? "allow",
    strongestDecision: strongest,
    limitations,
  };
}

/** Report `change.classes` value for a classified diff. */
const RULE_TO_CLASS: Readonly<Record<string, string>> = {
  "CHG-001": "documentation",
  "CHG-004": "behavior",
  "CHG-005": "bugfix",
  "CHG-006": "boundary",
  "CHG-007": "migration",
  "CHG-008": "behavior",
  "CHG-009": "security",
  "CHG-010": "generated",
  "CHG-011": "configuration",
  "TST-001": "behavior",
};

export interface ReportChange {
  readonly classes: readonly string[];
  readonly confidence: "high" | "medium" | "low" | "unknown";
  readonly changed_paths: readonly string[];
  readonly test_paths: readonly string[];
}

/** Build the report `change` block from the snapshot and plan stage. */
export function buildReportChange(
  snapshot: RepositorySnapshot,
  plan: PlanStage,
): ReportChange {
  const changedPaths = snapshot.changedFiles.map((file) => file.path);
  const testPaths = changedPaths.filter((file) => isTestFilePath(file));

  let classes: string[];
  if (changedPaths.length > 0 && changedPaths.every(isTestFilePath)) {
    classes = ["test_only"];
  } else {
    classes = [
      ...new Set(
        plan.ruleIds
          .map((ruleId) => RULE_TO_CLASS[ruleId])
          .filter((value): value is string => value !== undefined),
      ),
    ].sort();
  }
  if (classes.length === 0) {
    classes = ["mixed"];
  }

  const confidence =
    changedPaths.length === 0
      ? "unknown"
      : plan.decisions.some((decision) => decision.confidence === "high")
        ? "high"
        : plan.decisions.some((decision) => decision.confidence === "medium")
          ? "medium"
          : plan.decisions.length > 0
            ? "low"
            : "unknown";

  return {
    classes,
    confidence,
    changed_paths: [...changedPaths].sort(),
    test_paths: [...testPaths].sort(),
  };
}
