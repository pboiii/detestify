// Placement detector (policy NTT-008): a test file that repeats another test
// file's assertions on the same subject without adding any wiring of its own.
// Emits the overlap relationship with explicit covered/covering roles so the
// planner can match protected records before deciding anything.

import type {
  AssertionFact,
  DetectorContext,
  TestFileSource,
} from "./context.js";
import {
  detectionId,
  shortHash,
  type DetectorResult,
  type PlacementDetection,
} from "./types.js";

const EQUALITY_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"]);

const LIMITATIONS = [
  "Overlap is established only for identical assertions or literal projections of the same subject call; semantically equivalent rewrites are missed.",
  "The relationship names covered and covering tests; which placement is contractual is the planner's decision against protected records.",
];

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((element, index) => deepEqual(element, b[index]))
    );
  }
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left).sort();
    return (
      deepEqual(keys, Object.keys(right).sort()) &&
      keys.every((key) => deepEqual(left[key], right[key]))
    );
  }
  return false;
}

function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Is assertion `a` covered by assertion `b`? */
function covers(a: AssertionFact, b: AssertionFact): boolean {
  if (a.normalizedText === b.normalizedText) {
    return true;
  }
  // Projection: a asserts `f(...).p...` equals a literal, b asserts `f(...)`
  // equals a literal whose value at that path matches.
  if (
    a.matcher === null ||
    b.matcher === null ||
    !EQUALITY_MATCHERS.has(a.matcher) ||
    !EQUALITY_MATCHERS.has(b.matcher)
  ) {
    return false;
  }
  const subjectA = a.subject;
  const subjectB = b.subject;
  if (
    subjectA === null ||
    subjectB === null ||
    subjectA.baseCallee === null ||
    subjectA.baseCallee !== subjectB.baseCallee ||
    subjectA.propertyPath.length === 0 ||
    subjectB.propertyPath.length !== 0 ||
    !a.expected.isLiteral ||
    !b.expected.isLiteral
  ) {
    return false;
  }
  return deepEqual(
    valueAtPath(b.expected.value, subjectA.propertyPath),
    a.expected.value,
  );
}

function allCovered(
  covered: TestFileSource,
  covering: TestFileSource,
): boolean {
  return covered.assertions.every((a) =>
    covering.assertions.some((b) => covers(a, b)),
  );
}

function inRepoImports(test: TestFileSource): Set<string> {
  const targets = new Set<string>();
  for (const edge of test.inventory.imports) {
    if (edge.resolution === "in-repo" && edge.to !== null) {
      targets.add(edge.to);
    }
  }
  return targets;
}

export function detectPlacement(
  context: DetectorContext,
): DetectorResult<PlacementDetection> {
  const detections: PlacementDetection[] = [];
  const candidates = context.tests.filter((test) => test.assertions.length > 0);

  for (const covered of candidates) {
    for (const covering of candidates) {
      if (covered.file === covering.file) {
        continue;
      }
      const coveredImports = inRepoImports(covered);
      const coveringImports = inRepoImports(covering);
      if (coveredImports.size === 0) {
        continue;
      }
      // "Without wiring signal": the covered test imports nothing beyond what
      // the covering test already wires.
      if (![...coveredImports].every((target) => coveringImports.has(target))) {
        continue;
      }
      if (!allCovered(covered, covering)) {
        continue;
      }
      // Mutual coverage is duplication, owned by the duplicate detectors.
      if (allCovered(covering, covered)) {
        continue;
      }
      const paths = [covered.file, covering.file].sort();
      detections.push({
        id: detectionId("placement", [covered.file, `->${covering.file}`]),
        detector: "placement",
        test_paths: paths,
        covered_path: covered.file,
        covering_path: covering.file,
        signals: [
          {
            id: `ev-cross-layer-overlap:${shortHash(covered.file, covering.file)}`,
            kind: "structural",
            detail: `Every assertion in ${covered.file} is covered by ${covering.file} on the same subject, and ${covered.file} wires nothing extra.`,
          },
        ],
        rationale: `${covered.file} repeats assertions that ${covering.file} already makes on the same subject without exercising a distinct failure mechanism (NTT-008).`,
        limitations: LIMITATIONS,
      });
    }
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "placement", detections, limitations: LIMITATIONS };
}
