// Near-duplicate detector: test files sharing the same fixture + assertion
// shape (same in-repo imports, same asserted subjects, same matchers).
// STRUCTURAL signal only (ADR-006: static-only evidence can never establish
// deletion by itself).

import {
  detectionId,
  shortHash,
  type CleanupDetection,
  type DetectorResult,
} from "./types.js";
import type { DetectorContext, TestFileSource } from "./context.js";

const LIMITATIONS = [
  "Shape comparison is structural only (imports, asserted subjects, matchers); it cannot see input-partition semantics.",
  "A structural similarity signal never establishes deletion eligibility on its own (ADR-006).",
];

/** Fixture + assertion shape key; null when the file is too weak to compare. */
function shapeKey(test: TestFileSource): string | null {
  if (test.assertions.length === 0) {
    return null;
  }
  const subjects = new Set<string>();
  const matchers = new Set<string>();
  for (const assertion of test.assertions) {
    for (const callee of assertion.subject?.calleeNames ?? []) {
      subjects.add(callee);
    }
    if (assertion.matcher !== null) {
      matchers.add(assertion.matcher);
    }
  }
  if (subjects.size === 0) {
    return null;
  }
  const imports = new Set<string>();
  for (const edge of test.inventory.imports) {
    if (edge.resolution === "in-repo" && edge.to !== null) {
      imports.add(edge.to);
    }
  }
  return JSON.stringify({
    imports: [...imports].sort(),
    subjects: [...subjects].sort(),
    matchers: [...matchers].sort(),
  });
}

export function detectSimilar(context: DetectorContext): DetectorResult {
  const byShape = new Map<string, TestFileSource[]>();
  for (const test of context.tests) {
    const key = shapeKey(test);
    if (key === null) {
      continue;
    }
    const group = byShape.get(key);
    if (group === undefined) {
      byShape.set(key, [test]);
    } else {
      group.push(test);
    }
  }

  const detections: CleanupDetection[] = [];
  for (const [key, group] of byShape) {
    if (group.length < 2) {
      continue;
    }
    // AST-identical groups belong to the exact-duplicate detector.
    const astKeys = new Set(group.map((test) => test.normalizedAst));
    if (astKeys.size === 1) {
      continue;
    }
    const paths = group.map((test) => test.file).sort();
    detections.push({
      id: detectionId("similar", paths),
      detector: "similar",
      test_paths: paths,
      signals: [
        {
          id: `ev-shared-assertion-shape:${shortHash(key)}`,
          kind: "structural",
          detail: `Files share the same in-repo imports, asserted subjects, and matchers: ${paths.join(", ")}.`,
        },
      ],
      rationale:
        "Test files exercise the same subjects with the same fixture imports and matcher shape; they are merge-review candidates, not deletions.",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "similar", detections, limitations: LIMITATIONS };
}
