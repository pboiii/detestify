// Deterministic change classification (M2): map a change set onto the
// spec/policy/rules.md CHG change classes using repository diff data and
// analysis facts only. Every classification is a structural (derived) or
// keyword (inferred) fact with explicit confidence; rules whose evidence this
// layer cannot produce (AST equivalence, behavior preservation, reproduced
// bugs without supplied failure evidence) are reported as limitations, never
// guessed.

import type { ChangedFile } from "../repository/git.js";
import type { BoundariesAnalysis, BoundaryKind } from "./boundaries.js";
import { isTestFilePath } from "./tests.js";
import type { Provenance } from "../core/model/index.js";
import { POLICY_RULES_BY_ID, type PolicyRule } from "../core/policy/rules.js";

export type ChangeClassConfidence = "high" | "medium" | "low";

export interface ChangeClassification {
  /** CHG rule identifier, e.g. "CHG-007". */
  readonly ruleId: string;
  readonly title: string;
  /** How the class was established (ADR-004 provenance class). */
  readonly provenance: Extract<Provenance, "observed" | "derived" | "inferred">;
  readonly confidence: ChangeClassConfidence;
  /** Changed paths supporting the classification, sorted. */
  readonly paths: readonly string[];
  readonly rationale: string;
}

export interface ChangeClassifierInput {
  readonly changedFiles: readonly ChangedFile[];
  /** Boundary facts for the changed files (src/analysis/boundaries). */
  readonly boundaries?: BoundariesAnalysis;
  /** Paths with a supplied reproduced-failure (CHG-005 requires observed evidence). */
  readonly observedFailurePaths?: readonly string[];
}

export interface ChangeClassificationResult {
  readonly classes: readonly ChangeClassification[];
  /** Explicit unsupported analysis boundaries for this change set. */
  readonly limitations: readonly string[];
}

const DOC_PATH_PATTERN =
  /(^|\/)(license|notice|changelog|code_of_conduct|contributing)$|\.(md|markdown|mdx|txt|rst|adoc)$/i;
const DOCS_DIRECTORY_PATTERN = /(^|\/)docs?\//i;
const JS_TS_SOURCE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DEPENDENCY_MANIFEST_PATTERN =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;
const SECURITY_PATH_PATTERN =
  /(auth|security|crypt|token|permission|acl|session|signature)/i;
const CONCURRENCY_PATH_PATTERN =
  /(queue|lock|mutex|semaphore|concurren|worker|scheduler)/i;

function isDocPath(path: string): boolean {
  return DOC_PATH_PATTERN.test(path) || DOCS_DIRECTORY_PATTERN.test(path);
}

function rule(id: string): PolicyRule {
  const found = POLICY_RULES_BY_ID.get(id);
  if (found === undefined) {
    throw new Error(`Unknown policy rule: ${id}`);
  }
  return found;
}

function classification(
  ruleId: string,
  provenance: ChangeClassification["provenance"],
  confidence: ChangeClassConfidence,
  paths: readonly string[],
  rationale: string,
): ChangeClassification {
  return {
    ruleId,
    title: rule(ruleId).title,
    provenance,
    confidence,
    paths: [...new Set(paths)].sort(),
    rationale,
  };
}

/**
 * Classify a change set into CHG change classes. Deterministic path and
 * boundary facts produce derived classifications; name-only signals produce
 * inferred low-confidence classifications; CHG-005 requires supplied observed
 * failure evidence.
 */
export function classifyChangeSet(
  input: ChangeClassifierInput,
): ChangeClassificationResult {
  const classes: ChangeClassification[] = [];
  const limitations: string[] = [];

  const changedPaths = input.changedFiles.map((file) => file.path);
  const boundariesByFile = new Map<string, Set<BoundaryKind>>();
  for (const fact of input.boundaries?.boundaries ?? []) {
    const kinds = boundariesByFile.get(fact.file) ?? new Set<BoundaryKind>();
    kinds.add(fact.kind);
    boundariesByFile.set(fact.file, kinds);
  }
  const pathsWithBoundary = (kinds: readonly BoundaryKind[]): string[] =>
    changedPaths.filter((path) =>
      kinds.some((kind) => boundariesByFile.get(path)?.has(kind)),
    );

  if (changedPaths.length === 0) {
    return { classes: [], limitations: ["The change set is empty."] };
  }

  // CHG-001 (deterministic): documentation/comment-only change sets.
  if (changedPaths.every(isDocPath)) {
    classes.push(
      classification(
        "CHG-001",
        "derived",
        "high",
        changedPaths,
        "Every changed path is documentation.",
      ),
    );
    return { classes, limitations };
  }

  // CHG-007: migration or schema/serialization boundary facts.
  const migrationPaths = pathsWithBoundary([
    "migration",
    "schema-serialization",
  ]);
  if (migrationPaths.length > 0) {
    classes.push(
      classification(
        "CHG-007",
        "derived",
        "high",
        migrationPaths,
        "Changed paths carry migration or schema/serialization boundary facts.",
      ),
    );
  }

  // CHG-010: generated-code boundary facts.
  const generatedPaths = pathsWithBoundary(["generated-code"]);
  if (generatedPaths.length > 0) {
    classes.push(
      classification(
        "CHG-010",
        "derived",
        "high",
        generatedPaths,
        "Changed paths are marked as generated code.",
      ),
    );
    limitations.push(
      "Generation provenance (generator source mapping) is not verified.",
    );
  }

  // CHG-011: configuration boundary facts.
  const configPaths = pathsWithBoundary(["config"]);
  if (configPaths.length > 0) {
    classes.push(
      classification(
        "CHG-011",
        "derived",
        "high",
        configPaths,
        "Changed paths carry configuration boundary facts.",
      ),
    );
  }

  // CHG-006: route boundary facts or dependency manifest changes.
  const boundaryPaths = [
    ...pathsWithBoundary(["route-registration", "route-handler-export"]),
    ...changedPaths.filter((path) => DEPENDENCY_MANIFEST_PATTERN.test(path)),
  ];
  if (boundaryPaths.length > 0) {
    classes.push(
      classification(
        "CHG-006",
        "derived",
        "high",
        boundaryPaths,
        "Changed paths carry route boundary facts or dependency manifests.",
      ),
    );
  }

  // CHG-005 (heuristic): only with supplied observed failure evidence.
  const observedFailurePaths = input.observedFailurePaths ?? [];
  if (observedFailurePaths.length > 0) {
    classes.push(
      classification(
        "CHG-005",
        "observed",
        "high",
        observedFailurePaths,
        "A reproduced failure was supplied for these paths.",
      ),
    );
  } else {
    limitations.push(
      "CHG-005 (confirmed bug) requires a supplied reproduced failure; none was provided.",
    );
  }

  // CHG-004: added non-test source files without boundary facts.
  const addedPurePaths = input.changedFiles
    .filter(
      (file) =>
        file.status === "added" &&
        JS_TS_SOURCE_PATTERN.test(file.path) &&
        !isTestFilePath(file.path) &&
        !boundariesByFile.has(file.path),
    )
    .map((file) => file.path);
  if (addedPurePaths.length > 0) {
    classes.push(
      classification(
        "CHG-004",
        "derived",
        "medium",
        addedPurePaths,
        "New source files without boundary facts add behavior.",
      ),
    );
    limitations.push(
      "Purity of new behavior is not proven; hidden I/O is possible.",
    );
  }

  // CHG-009 (heuristic): security-suggestive names only — inferred, never a gate.
  const securityPaths = changedPaths.filter(
    (path) =>
      SECURITY_PATH_PATTERN.test(path) &&
      JS_TS_SOURCE_PATTERN.test(path) &&
      !isTestFilePath(path),
  );
  if (securityPaths.length > 0) {
    classes.push(
      classification(
        "CHG-009",
        "inferred",
        "low",
        securityPaths,
        "Path names suggest security relevance; no declared or observed threat is known.",
      ),
    );
  }

  // CHG-008 (heuristic): concurrency-suggestive names only — inferred.
  const concurrencyPaths = changedPaths.filter(
    (path) =>
      CONCURRENCY_PATH_PATTERN.test(path) &&
      JS_TS_SOURCE_PATTERN.test(path) &&
      !isTestFilePath(path),
  );
  if (concurrencyPaths.length > 0) {
    classes.push(
      classification(
        "CHG-008",
        "inferred",
        "low",
        concurrencyPaths,
        "Path names suggest concurrency or ordering behavior.",
      ),
    );
  }

  // Unsupported boundaries this layer cannot establish for source changes.
  const sourceChanged = changedPaths.some(
    (path) => JS_TS_SOURCE_PATTERN.test(path) && !isTestFilePath(path),
  );
  if (sourceChanged) {
    limitations.push(
      "CHG-002 (formatting/mechanical refactor) is not asserted: AST equivalence against the base revision is not computed.",
      "CHG-003 (behavior-preserving refactor) is not asserted: behavior preservation cannot be established statically.",
    );
  }

  return { classes, limitations };
}
