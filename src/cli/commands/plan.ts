// `plan --diff` (M3): the zero-config wedge. Pipeline: repository snapshot and
// diff fingerprint (src/repository) -> inert shape discovery and AST facts for
// the changed files (src/analysis) -> deterministic change classification ->
// policy decisions, obligation candidates, and materiality (src/core) ->
// schema-validated report envelope (src/core/reports).
//
// Zero-config invariants (cli-contract, threat model): no network, no
// dependency installation, no repository script or executable-config
// execution, no mutation outside the report path. Every field outside the
// volatile `timing` section is derived from the analyzed snapshot, so
// repeated runs over an unchanged tree emit byte-identical reports once
// `timing` is removed (ADR-002).

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { CommanderError } from "commander";
import { EXIT_CODES, type ExitCode } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";
import {
  GitError,
  runGit,
  snapshotRepository,
  type RepositorySnapshot,
} from "../../repository/git.js";
import {
  buildGitDiffEvidence,
  fingerprintDiff,
} from "../../repository/fingerprint.js";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
  type RepositoryShape,
} from "../../repository/discovery.js";
import { realpathContained } from "../../repository/paths.js";
import { analyzeBoundaries } from "../../analysis/boundaries.js";
import {
  analyzeTests,
  isTestFilePath,
  type SuiteNode,
  type TestInventory,
} from "../../analysis/tests.js";
import {
  analyzeTypeScript,
  type TypeScriptAnalysis,
} from "../../analysis/typescript.js";
import {
  classifyChangeSet,
  type ChangeClassification,
} from "../../analysis/change-classifier.js";
import {
  decideRule,
  POLICY_RULES_BY_ID,
  type RuleDetermination,
} from "../../core/policy/index.js";
import type {
  Decision,
  DecisionConfidence,
  EvidenceRecord,
  ObligationCandidate,
  PolicyMode,
} from "../../core/model/index.js";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import {
  buildPlanReport,
  detectStaleReport,
  renderPlanSummary,
  validatePlanReport,
  writePlanReportAtomic,
  type PlanReport,
  type ReportCapabilities,
  type ReportChange,
  type ReportChangeClass,
} from "../../core/reports/index.js";

/**
 * Exit with a documented plan exit code. `main.ts` passes the exit code of a
 * CommanderError carrying the "test-steward.notImplemented" marker through
 * unchanged; that marker string is the scaffold's only pass-through channel.
 */
function exitWith(code: ExitCode, message: string): never {
  throw new CommanderError(code, "test-steward.notImplemented", message);
}

// ---------------------------------------------------------------------------
// Inert configuration
// ---------------------------------------------------------------------------

interface PlanConfig {
  readonly mode: PolicyMode;
  readonly elevatedRuleIds: readonly string[];
  readonly baseRevision: string | undefined;
  readonly repositoryCommandsTrusted: boolean;
}

const DEFAULT_CONFIG: PlanConfig = {
  mode: "advisory",
  elevatedRuleIds: [],
  baseRevision: undefined,
  repositoryCommandsTrusted: false,
};

async function loadInertConfig(
  repositoryRoot: string,
  configPath: string,
): Promise<PlanConfig> {
  const relative = path.relative(repositoryRoot, path.resolve(configPath));
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes repository root: ${configPath}`);
  }
  const contained = await realpathContained(
    repositoryRoot,
    relative.split(path.sep).join("/"),
  );
  const stat = await lstat(contained);
  if (!stat.isFile()) {
    throw new Error(`Configuration is not a regular file: ${configPath}`);
  }
  if (stat.size > 1_048_576) {
    throw new Error(`Configuration exceeds 1 MiB: ${configPath}`);
  }
  if (path.extname(contained) !== ".json") {
    throw new Error(`Configuration must be inert JSON: ${configPath}`);
  }
  const document: unknown = JSON.parse(await readFile(contained, "utf8"));
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new Error(
      `Configuration failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
  const config = document as {
    mode: PolicyMode;
    base_revision?: string | null;
    trusted_operations: { run_repository_commands: boolean };
    policy: { elevated_rule_ids: readonly string[] };
  };
  return {
    mode: config.mode,
    elevatedRuleIds: config.policy.elevated_rule_ids,
    baseRevision: config.base_revision ?? undefined,
    repositoryCommandsTrusted:
      config.trusted_operations.run_repository_commands,
  };
}

// ---------------------------------------------------------------------------
// Snapshot filtering: the tool's own artifacts are not repository changes
// ---------------------------------------------------------------------------

type Excluded = (relativePosixPath: string) => boolean;

function buildExclusions(
  repositoryRoot: string,
  options: CommandOptions,
): Excluded {
  const exact = new Set<string>();
  for (const raw of [options.report, options.json]) {
    if (raw === undefined || raw === "-") {
      continue;
    }
    const relative = path.relative(repositoryRoot, path.resolve(raw));
    if (
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    ) {
      exact.add(relative.split(path.sep).join("/"));
    }
  }
  return (rel) =>
    rel === ".test-steward" ||
    rel.startsWith(".test-steward/") ||
    exact.has(rel);
}

function filterSnapshot(
  snapshot: RepositorySnapshot,
  excluded: Excluded,
): RepositorySnapshot {
  return {
    ...snapshot,
    changedFiles: snapshot.changedFiles.filter((file) => !excluded(file.path)),
  };
}

/** Worktree dirtiness with the tool's own artifact paths excluded. */
async function worktreeDirty(
  repositoryRoot: string,
  excluded: Excluded,
): Promise<boolean> {
  const { stdout } = await runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "-z",
  ]);
  return stdout.split("\0").some((entry) => {
    if (entry === "") {
      return false;
    }
    const rel = entry.length > 3 && entry[2] === " " ? entry.slice(3) : entry;
    return !excluded(rel);
  });
}

/** Deterministic snapshot-bound RFC 3339 time: the HEAD committer date. */
async function snapshotIsoTime(
  repositoryRoot: string,
  headRevision: string | null,
): Promise<string> {
  if (headRevision === null) {
    return "1970-01-01T00:00:00.000Z";
  }
  try {
    const { stdout } = await runGit(repositoryRoot, [
      "show",
      "-s",
      "--format=%cI",
      headRevision,
    ]);
    const parsed = new Date(stdout.trim());
    return Number.isNaN(parsed.getTime())
      ? "1970-01-01T00:00:00.000Z"
      : parsed.toISOString();
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

// ---------------------------------------------------------------------------
// Candidate failure boundary: stateful lifecycle pairs in changed sources
// ---------------------------------------------------------------------------

interface LifecycleFact {
  readonly file: string;
  readonly first: string;
  readonly second: string;
  readonly releaseObserved: boolean;
  readonly failureClass: string;
}

const LIFECYCLE_PAIRS = [
  { first: "claim", second: "release", past: "released" },
  { first: "acquire", second: "release", past: "released" },
  { first: "lock", second: "unlock", past: "unlocked" },
] as const;

// ponytail: naive member-call text scan; upgrade to receiver-matched AST facts
// if false positives show up in real repositories.
async function detectStatefulLifecycle(
  repositoryRoot: string,
  files: readonly string[],
): Promise<LifecycleFact[]> {
  const facts: LifecycleFact[] = [];
  for (const file of [...files].sort()) {
    let text: string;
    try {
      text = await readFile(
        await realpathContained(repositoryRoot, file),
        "utf8",
      );
    } catch {
      continue;
    }
    const methods = new Set<string>();
    for (const match of text.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = match[1];
      if (name !== undefined) {
        methods.add(name);
      }
    }
    for (const pair of LIFECYCLE_PAIRS) {
      if (!methods.has(pair.first)) {
        continue;
      }
      facts.push({
        file,
        first: pair.first,
        second: pair.second,
        releaseObserved: methods.has(pair.second),
        failureClass: `${pair.first}-not-${pair.past}-on-failure`,
      });
      break;
    }
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Change class mapping and presentation
// ---------------------------------------------------------------------------

const RULE_CHANGE_CLASS: Readonly<Record<string, ReportChangeClass>> = {
  "CHG-001": "documentation",
  "CHG-004": "behavior",
  "CHG-005": "bugfix",
  "CHG-006": "boundary",
  "CHG-008": "behavior",
  "CHG-009": "security",
  "CHG-010": "generated",
  "CHG-011": "configuration",
};

const DEPENDENCY_MANIFEST_PATTERN =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;

const REASON_CODES: Readonly<Record<string, string>> = {
  "CHG-001": "DOC_ONLY_NO_BEHAVIOR",
  "CHG-004": "NEW_PURE_BEHAVIOR",
  "CHG-006": "BOUNDARY_DEPENDENCY_CHANGED",
  "CHG-007": "SCHEMA_MIGRATION_CHANGED",
  "CHG-008": "CONCURRENCY_SUGGESTED",
  "CHG-009": "SECURITY_SUGGESTED",
  "CHG-010": "GENERATED_CODE_CHANGED",
  "CHG-011": "CONFIGURATION_CHANGED",
};

const RULE_SUMMARIES: Readonly<Record<string, string>> = {
  "CHG-001":
    "Only prose documentation changed; no persistent test is supported.",
  "CHG-004":
    "New source files add behavior without boundary facts; focused behavior evidence is recommended.",
  "CHG-006":
    "A dependency or boundary surface changed; evidence at the real boundary is recommended.",
  "CHG-007":
    "Schema or migration surfaces changed; compatibility and migration evidence is recommended.",
  "CHG-008":
    "Path names suggest concurrency or ordering behavior; deterministic invariant evidence is suggested.",
  "CHG-009":
    "Path names suggest security relevance; evidence derived from a declared or observed threat is suggested.",
  "CHG-010":
    "Generated code changed; generator or contract evidence is recommended.",
  "CHG-011":
    "Configuration or deployment surfaces changed; validation and smoke evidence is recommended.",
};

interface PlannedDetermination {
  readonly det: RuleDetermination;
  readonly reasonCode: string;
  readonly summary: string;
  readonly rationale: string;
  /** Specialized failure class replacing the rule catalog default. */
  readonly failureClass?: string;
}

function ruleContract(ruleId: string): string {
  const rule = POLICY_RULES_BY_ID.get(ruleId);
  return rule === undefined ? "" : ` Rule contract: ${rule.statement}`;
}

const CONFIDENCE_RANK: Readonly<Record<string, number>> = {
  high: 2,
  medium: 1,
  low: 0,
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function run(options: CommandOptions): Promise<void> {
  const startedAt = process.hrtime.bigint();
  let phaseStart = startedAt;
  const phases: Record<string, number> = {};
  const mark = (name: string): void => {
    const now = process.hrtime.bigint();
    phases[name] = Number((now - phaseStart) / 1_000_000n);
    phaseStart = now;
  };

  // -- Repository discovery ------------------------------------------------
  const start = path.resolve(options.repo ?? process.cwd());
  try {
    const stat = await lstat(start);
    if (!stat.isDirectory()) {
      exitWith(
        EXIT_CODES.REPOSITORY_NOT_FOUND,
        `No Git repository contains ${start}.`,
      );
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    exitWith(
      EXIT_CODES.REPOSITORY_NOT_FOUND,
      `No Git repository contains ${start}.`,
    );
  }

  let snapshot: RepositorySnapshot;
  let config = DEFAULT_CONFIG;
  try {
    // Root resolution first so --config containment has a root to check.
    const probe = await snapshotRepository(start, undefined, {});
    if (options.config !== undefined) {
      config = await loadInertConfig(probe.root, options.config);
    }
    const base = options.base ?? config.baseRevision;
    snapshot =
      base === undefined ? probe : await snapshotRepository(start, base, {});
  } catch (error) {
    if (error instanceof GitError) {
      if (
        error.code === "NOT_A_REPOSITORY" ||
        error.code === "GIT_UNAVAILABLE"
      ) {
        exitWith(EXIT_CODES.REPOSITORY_NOT_FOUND, error.message);
      }
      if (error.message.startsWith("Base revision not found")) {
        exitWith(EXIT_CODES.USAGE_ERROR, error.message);
      }
    }
    throw error;
  }

  const excluded = buildExclusions(snapshot.root, options);
  const analyzed = filterSnapshot(snapshot, excluded);
  const dirty = await worktreeDirty(analyzed.root, excluded);
  const observedAt = await snapshotIsoTime(
    analyzed.root,
    analyzed.headRevision,
  );
  mark("repository_discovery");

  // -- Diff analysis -------------------------------------------------------
  const fingerprint = await fingerprintDiff(analyzed);
  const gitDiffEvidence = buildGitDiffEvidence(analyzed, fingerprint, {
    id: "ev-git-diff",
    observedAt,
  });
  const reportId = `plan-${fingerprint.fingerprint.slice(7, 19)}`;
  mark("diff_analysis");

  // -- Inert shape discovery and AST facts ---------------------------------
  const limitations: string[] = [
    "No repository commands were executed in zero-config mode.",
    "generated_at and evidence observed_at are derived from the analyzed HEAD commit so repeated runs stay deterministic; wall-clock timing lives only in the volatile timing section.",
    ...fingerprint.limitations,
  ];

  const repositoryFiles = await listRepositoryFiles(analyzed.root);
  const shape = await discoverRepositoryShape(analyzed.root, repositoryFiles);
  limitations.push(...shape.limitations);
  if (shape.runner === "none") {
    limitations.push(
      "No supported test runner (Vitest or Jest) marker was found; runner-aware advice is unavailable.",
    );
  } else if (shape.runner === "unknown") {
    limitations.push(
      "Multiple test runner markers conflict; runner selection is ambiguous.",
    );
  }

  const changedFiles = analyzed.changedFiles;
  const changedPaths = changedFiles.map((file) => file.path);
  const readableChanged = changedFiles
    .filter((file) => file.status !== "deleted" && !file.binary)
    .map((file) => file.path);
  const changedSource = readableChanged.filter(
    (file) =>
      /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) && !isTestFilePath(file),
  );
  const changedTests = changedPaths.filter((file) => isTestFilePath(file));

  const boundaries = await analyzeBoundaries({
    repoRoot: analyzed.root,
    files: readableChanged,
  });
  const lifecycleFacts = await detectStatefulLifecycle(
    analyzed.root,
    changedSource,
  );

  let typescript: TypeScriptAnalysis | null = null;
  try {
    typescript = await analyzeTypeScript({
      repoRoot: analyzed.root,
      files: changedSource,
    });
  } catch (error) {
    limitations.push(
      `TypeScript AST analysis is unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let tests: TestInventory = { testFiles: [], unreadableFiles: [] };
  if (changedSource.length > 0 && shape.testFiles.length > 0) {
    // Source files join the input so test imports resolve against them; only
    // test-named files are actually analyzed.
    tests = await analyzeTests({
      repoRoot: analyzed.root,
      files: [...shape.testFiles, ...shape.sourceFiles],
    });
  }
  const changedSet = new Set(changedSource);
  const nearbyTests = tests.testFiles
    .map((testFile) => ({
      testFile,
      covered: testFile.imports
        .filter((edge) => edge.to !== null && changedSet.has(edge.to))
        .map((edge) => edge.to as string),
    }))
    .filter((entry) => entry.covered.length > 0);
  const testPaths = [
    ...new Set([...changedTests, ...nearbyTests.map((n) => n.testFile.file)]),
  ].sort();
  mark("ast_inventory");

  // -- Classification and policy decisions ---------------------------------
  const classification = classifyChangeSet({
    changedFiles,
    boundaries,
  });
  limitations.push(...classification.limitations);

  const planned = buildDeterminations(
    classification.classes,
    lifecycleFacts,
    nearbyTests.map((entry) => ({
      testPath: entry.testFile.file,
      covered: entry.covered,
    })),
    changedSource,
  );

  const decisions: Decision[] = [];
  const obligations: ObligationCandidate[] = [];
  const evidence: EvidenceRecord[] = [gitDiffEvidence];
  evidence.push(
    shapeEvidence(shape, observedAt),
    astEvidence(
      typescript,
      boundaries.boundaries,
      lifecycleFacts,
      nearbyTests,
      observedAt,
    ),
  );

  for (const plan of planned) {
    const slug = plan.det.ruleId.toLowerCase();
    const evaluation = decideRule(plan.det, {
      mode: config.mode,
      elevatedRuleIds: config.elevatedRuleIds,
      observedAt,
      ids: {
        decision: `dec-${slug}`,
        obligation: `ob-${slug}`,
        evidence: `ev-rule-${slug}`,
      },
      presentation: {
        reasonCode: plan.reasonCode,
        summary: plan.summary,
        rationale: plan.rationale,
      },
    });
    evidence.push(evaluation.evidence);
    if (evaluation.obligation !== null) {
      obligations.push(evaluation.obligation);
    }
    const withDiffEvidence: Decision = {
      ...evaluation.decision,
      evidence_ids: [
        ...new Set([...evaluation.decision.evidence_ids, "ev-git-diff"]),
      ],
    };
    const decision =
      plan.failureClass !== undefined && withDiffEvidence.target.scope !== null
        ? {
            ...withDiffEvidence,
            target: {
              ...withDiffEvidence.target,
              failure_class: plan.failureClass,
            },
          }
        : withDiffEvidence;
    decisions.push(decision);
    limitations.push(...decision.limitations);
  }

  if (decisions.length === 0) {
    decisions.push(
      changedPaths.length === 0
        ? manualDecision({
            id: "dec-empty-diff",
            reasonCode: "EMPTY_DIFF",
            summary:
              "The diff contains no changes; no persistent test is supported.",
            rationale:
              "Repository discovery found no committed, staged, unstaged, or untracked changes relative to the resolved base revision.",
          })
        : manualDecision({
            id: "dec-test-only",
            reasonCode: "TEST_ONLY_CHANGE",
            summary:
              "Only test files changed; the diff edits evidence rather than behavior.",
            rationale:
              "Every changed path follows a test naming convention; no product source, schema, or configuration changed.",
          }),
    );
  }

  const change: ReportChange = {
    classes: deriveClasses(
      classification.classes,
      lifecycleFacts,
      changedPaths,
      changedTests,
    ),
    confidence: deriveConfidence(
      classification.classes,
      lifecycleFacts,
      changedPaths,
      changedTests,
    ),
    changed_paths: [...changedPaths].sort(),
    test_paths: testPaths,
  };

  const capabilities: ReportCapabilities = {
    runner: shape.runner,
    ast:
      typescript === null
        ? "unavailable"
        : typescript.capabilities.mode === "type-resolved"
          ? "type_resolved"
          : "syntactic_only",
    coverage: "not_requested",
    mutation: "not_requested",
    repository_commands_trusted: config.repositoryCommandsTrusted,
    network_used: false,
  };

  // TOCTOU stale-fingerprint check (TM-015): re-snapshot before the report is
  // bound and written; drift is disclosed, never silently absorbed.
  try {
    const verify = filterSnapshot(
      await snapshotRepository(start, options.base ?? config.baseRevision, {}),
      excluded,
    );
    const verifyFingerprint = await fingerprintDiff(verify);
    if (verifyFingerprint.fingerprint !== fingerprint.fingerprint) {
      limitations.push(
        `The repository changed while plan was analyzing it; this report is bound to the tree at analysis start, not the current tree (current fingerprint ${verifyFingerprint.fingerprint}).`,
      );
      process.stderr.write(
        "Warning: the repository changed during analysis; the report is bound to the analyzed tree state.\n",
      );
    }
  } catch {
    limitations.push(
      "The post-analysis stale-fingerprint check could not re-read the repository.",
    );
  }
  mark("policy_evaluation");

  const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  const report = buildPlanReport({
    reportId,
    generatedAt: observedAt,
    repository: {
      root: analyzed.root,
      base_revision: analyzed.baseRevision,
      head_revision: analyzed.headRevision,
      diff_fingerprint: fingerprint.fingerprint,
      dirty,
    },
    change,
    capabilities,
    obligations,
    evidence,
    decisions,
    limitations,
    timing: { elapsed_ms: elapsedMs, phases },
  });
  await validateReportOrExit(report);

  // -- Report emission -----------------------------------------------------
  const jsonOnStdout = options.json === "-";
  const reportTarget =
    options.report !== undefined
      ? path.resolve(options.report)
      : jsonOnStdout
        ? null
        : path.join(
            analyzed.root,
            ".test-steward",
            "reports",
            `${reportId}.json`,
          );
  const jsonTarget =
    options.json !== undefined && !jsonOnStdout
      ? path.resolve(options.json)
      : null;

  const humanStream = jsonOnStdout ? process.stderr : process.stdout;
  for (const target of [reportTarget, jsonTarget]) {
    if (target === null) {
      continue;
    }
    const stale = await detectStaleReport(target, fingerprint.fingerprint);
    if (stale.stale) {
      humanStream.write(
        `Note: the previous report at ${path.relative(process.cwd(), target)} was produced for a different tree (stale fingerprint); replacing it.\n`,
      );
    }
    await writePlanReportAtomic(target, report, analyzed.root);
  }

  if (jsonOnStdout) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  const display =
    reportTarget === null
      ? jsonTarget === null
        ? null
        : path.relative(process.cwd(), jsonTarget)
      : path.relative(process.cwd(), reportTarget);
  humanStream.write(renderPlanSummary(report, display));
}

// ---------------------------------------------------------------------------
// Determination assembly
// ---------------------------------------------------------------------------

function buildDeterminations(
  classes: readonly ChangeClassification[],
  lifecycleFacts: readonly LifecycleFact[],
  nearbyTests: readonly { testPath: string; covered: readonly string[] }[],
  changedSource: readonly string[],
): PlannedDetermination[] {
  const planned: PlannedDetermination[] = [];
  const lifecycle = lifecycleFacts[0];

  for (const item of classes) {
    if (item.ruleId === "CHG-006" && lifecycle !== undefined) {
      // Merged below with the stateful lifecycle fact.
      continue;
    }
    const fallback = item.provenance === "inferred" ? "inferred" : "derived";
    const rule = POLICY_RULES_BY_ID.get(item.ruleId);
    const existingTest =
      rule?.target?.scope === "narrow"
        ? nearbyTests.find((entry) =>
            entry.covered.some((covered) => item.paths.includes(covered)),
          )?.testPath
        : undefined;
    planned.push({
      det: {
        ruleId: item.ruleId,
        applicability: "applies",
        statement: item.rationale,
        paths: item.paths,
        fallbackProvenance: fallback,
        ...(existingTest !== undefined
          ? { existingTestPath: existingTest }
          : {}),
      },
      reasonCode:
        REASON_CODES[item.ruleId] ?? `${item.ruleId.replace("-", "_")}_APPLIES`,
      summary:
        RULE_SUMMARIES[item.ruleId] ?? `${item.title} applies to this change.`,
      rationale: `${item.rationale}${ruleContract(item.ruleId)}`,
    });
  }

  if (lifecycle !== undefined) {
    const merged = classes.find((item) => item.ruleId === "CHG-006");
    const paths = [
      ...new Set([
        ...(merged?.paths ?? []),
        ...lifecycleFacts.map((fact) => fact.file),
      ]),
    ].sort();
    const statement = `Changed file ${lifecycle.file} drives a stateful ${lifecycle.first}/${lifecycle.second} lifecycle; a failed handler must ${lifecycle.second} the ${lifecycle.first} so retry stays possible.`;
    planned.push({
      det: {
        ruleId: "CHG-006",
        applicability: "applies",
        statement,
        paths,
        fallbackProvenance: "derived",
        evidenceGap: "material",
      },
      reasonCode: "STATEFUL_LIFECYCLE_BOUNDARY",
      summary: `Stateful ${lifecycle.first}/${lifecycle.second} lifecycle changed in ${lifecycle.file}; integration evidence at this boundary is recommended for the failure path.`,
      rationale: `${statement}${ruleContract("CHG-006")}`,
      failureClass: lifecycle.failureClass,
    });
  }

  if (planned.length === 0 && changedSource.length > 0) {
    const statement =
      "Source files changed but no deterministic rule signal was found; whether externally observable behavior changed cannot be established statically in zero-config mode.";
    planned.push({
      det: {
        ruleId: "TST-001",
        applicability: "ambiguous",
        statement,
        paths: changedSource,
      },
      reasonCode: "INSUFFICIENT_STATIC_EVIDENCE",
      summary:
        "Changed source could not be classified from static facts alone; more information is needed.",
      rationale: `${statement}${ruleContract("TST-001")}`,
    });
  }

  return planned;
}

function manualDecision(input: {
  readonly id: string;
  readonly reasonCode: string;
  readonly summary: string;
  readonly rationale: string;
}): Decision {
  return {
    schema_version: "1.0",
    id: input.id,
    domain: "change",
    outcome: "NO_TEST_SUPPORTED",
    gate_action: "allow",
    confidence: "high",
    reason_code: input.reasonCode,
    summary: input.summary,
    rationale: input.rationale,
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: ["ev-git-diff"],
    target: {
      scope: null,
      purpose: null,
      technique: "existing_evidence",
      cadence: "completion",
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
    limitations: [],
  };
}

// ---------------------------------------------------------------------------
// Evidence assembly
// ---------------------------------------------------------------------------

function shapeEvidence(
  shape: RepositoryShape,
  observedAt: string,
): EvidenceRecord {
  const markerPaths = [
    ...new Set(shape.runnerMarkers.map((marker) => marker.path)),
  ].sort();
  return {
    schema_version: "1.0",
    id: "ev-repo-shape",
    kind: "runner_inventory",
    status: "observed",
    source: {
      tool: "test-steward-discovery",
      version: null,
      path: null,
      command_fingerprint: null,
      observed_at: observedAt,
    },
    findings: [
      markerPaths.length > 0
        ? {
            code: "RUNNER_MARKERS",
            summary: `Inert markers identify the ${shape.runner} runner.`,
            paths: markerPaths,
          }
        : {
            code: "RUNNER_NONE",
            summary: "No supported test runner marker was found.",
            paths: [],
          },
      {
        code: "TEST_TOPOLOGY",
        summary: `${shape.testFiles.length} test file(s) and ${shape.sourceFiles.length} source file(s) follow JS/TS conventions.`,
        paths: [],
      },
    ],
    data: {
      runner: shape.runner,
      test_files: shape.testFiles.length,
      source_files: shape.sourceFiles.length,
    },
    gate_trust: "advisory_only",
    limitations: [...shape.limitations],
  };
}

function countTests(suites: readonly SuiteNode[]): number {
  let count = 0;
  for (const node of suites) {
    count += node.kind === "test" ? 1 : countTests(node.children);
  }
  return count;
}

function astEvidence(
  typescript: TypeScriptAnalysis | null,
  boundaries: readonly { file: string; kind: string; path?: string }[],
  lifecycleFacts: readonly LifecycleFact[],
  nearbyTests: readonly {
    testFile: TestInventory["testFiles"][number];
    covered: readonly string[];
  }[],
  observedAt: string,
): EvidenceRecord {
  const findings: EvidenceRecord["findings"][number][] = [];
  for (const facts of typescript?.files ?? []) {
    if (facts.exports.length === 0) {
      continue;
    }
    const names = facts.exports.map((entry) => entry.name).slice(0, 10);
    findings.push({
      code: "EXPORTED_SYMBOLS",
      summary: `${facts.file} exports ${names.join(", ")}${facts.exports.length > 10 ? ", …" : ""}.`,
      paths: [facts.file],
    });
  }
  for (const fact of boundaries) {
    findings.push({
      code: "BOUNDARY_FACT",
      summary: `${fact.file} carries a ${fact.kind} boundary fact (${fact.path ?? "match"}).`,
      paths: [fact.file],
    });
  }
  for (const fact of lifecycleFacts) {
    findings.push({
      code: "STATEFUL_LIFECYCLE",
      summary: `${fact.file} calls .${fact.first}( and ${
        fact.releaseObserved
          ? `pairs it with .${fact.second}(`
          : `never calls .${fact.second}(`
      }; the failure path must ${fact.second} the ${fact.first}.`,
      paths: [fact.file],
    });
  }
  for (const entry of nearbyTests) {
    const covered = [...entry.covered].sort().join(", ");
    findings.push({
      code: "NEARBY_TEST",
      summary: `${entry.testFile.file} declares ${countTests(entry.testFile.suites)} test(s), imports ${covered}${
        entry.testFile.usesMocks ? ", and relies on mocks" : ""
      }.`,
      paths: [...new Set([entry.testFile.file, ...entry.covered])].sort(),
    });
  }
  if (findings.length === 0) {
    findings.push({
      code: "NO_AST_FACTS",
      summary:
        "No exported symbols, boundary facts, or nearby tests were derived for the changed files.",
      paths: [],
    });
  }
  return {
    schema_version: "1.0",
    id: "ev-ast-facts",
    kind: "ast_fact",
    status: typescript === null ? "unavailable" : "observed",
    source: {
      tool: "test-steward-analyzer",
      version: typescript?.capabilities.parserVersion ?? null,
      path: null,
      command_fingerprint: null,
      observed_at: observedAt,
    },
    findings,
    data: {
      mode: typescript?.capabilities.mode ?? "unavailable",
      boundary_facts: boundaries.length,
      stateful_lifecycles: lifecycleFacts.length,
      nearby_tests: nearbyTests.length,
    },
    gate_trust: "eligible",
    limitations:
      typescript === null
        ? ["TypeScript AST analysis did not run."]
        : typescript.capabilities.limitations.map(
            (limitation) => `${limitation.code}: ${limitation.detail}`,
          ),
  };
}

// ---------------------------------------------------------------------------
// Change block derivation
// ---------------------------------------------------------------------------

function deriveClasses(
  classes: readonly ChangeClassification[],
  lifecycleFacts: readonly LifecycleFact[],
  changedPaths: readonly string[],
  changedTests: readonly string[],
): readonly ReportChangeClass[] {
  const derived = new Set<ReportChangeClass>();
  for (const item of classes) {
    if (item.ruleId === "CHG-007") {
      // Refine schema/migration by the matched paths.
      const migration = item.paths.some((p) =>
        /(^|\/)(migrations?|drizzle)\/|migration|\.sql$|schema\.prisma$/.test(
          p,
        ),
      );
      derived.add(migration ? "migration" : "schema");
      continue;
    }
    const mapped = RULE_CHANGE_CLASS[item.ruleId];
    if (mapped !== undefined) {
      derived.add(mapped);
    }
    if (
      item.ruleId === "CHG-006" &&
      item.paths.some((p) => DEPENDENCY_MANIFEST_PATTERN.test(p))
    ) {
      derived.add("dependency");
    }
  }
  if (lifecycleFacts.length > 0) {
    derived.add("boundary");
  }
  if (changedPaths.length > 0 && changedTests.length === changedPaths.length) {
    derived.add("test_only");
  }
  if (derived.size === 0) {
    derived.add("mixed");
  }
  return [...derived].sort();
}

function deriveConfidence(
  classes: readonly ChangeClassification[],
  lifecycleFacts: readonly LifecycleFact[],
  changedPaths: readonly string[],
  changedTests: readonly string[],
): DecisionConfidence {
  if (changedPaths.length === 0) {
    return "high";
  }
  if (classes.length === 0) {
    if (changedTests.length === changedPaths.length) {
      return "high";
    }
    return lifecycleFacts.length > 0 ? "medium" : "unknown";
  }
  let lowest = 2;
  for (const item of classes) {
    lowest = Math.min(lowest, CONFIDENCE_RANK[item.confidence] ?? 0);
  }
  return lowest === 2 ? "high" : lowest === 1 ? "medium" : "low";
}

async function validateReportOrExit(report: PlanReport): Promise<void> {
  try {
    await validatePlanReport(report);
  } catch (error) {
    exitWith(
      EXIT_CODES.SCHEMA_CONTRACT_ERROR,
      error instanceof Error ? error.message : String(error),
    );
  }
}
