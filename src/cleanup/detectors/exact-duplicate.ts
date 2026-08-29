// Exact-duplicate detector: byte-identical and AST-normalized-identical test
// files (ADR-006 "exact text duplicates" / "normalized AST duplicates").
// Emits structural signals only; deletion eligibility is the planner's job.

import {
  detectionId,
  shortHash,
  type CleanupDetection,
  type DetectorResult,
} from "./types.js";
import type { DetectorContext } from "./context.js";

const LIMITATIONS = [
  "AST normalization removes comments and formatting only; renamed identifiers are treated as distinct tests.",
  "Identical files may still differ in registration, environment, or contractual location; structural identity alone never establishes deletion eligibility.",
];

export function detectExactDuplicates(
  context: DetectorContext,
): DetectorResult {
  const byAst = new Map<string, string[]>();
  for (const test of context.tests) {
    const key = shortHash(test.normalizedAst);
    const group = byAst.get(key);
    if (group === undefined) {
      byAst.set(key, [test.file]);
    } else {
      group.push(test.file);
    }
  }

  const textByFile = new Map(
    context.tests.map((test) => [test.file, test.text]),
  );
  const detections: CleanupDetection[] = [];
  for (const [astKey, files] of byAst) {
    if (files.length < 2) {
      continue;
    }
    const paths = [...files].sort();
    const first = textByFile.get(paths[0] ?? "");
    const byteIdentical = paths.every((file) => textByFile.get(file) === first);
    const signals = [
      {
        id: `ev-ast-identical:${astKey}`,
        kind: "structural" as const,
        detail: `Files parse to identical comment- and formatting-normalized ASTs: ${paths.join(", ")}.`,
      },
    ];
    if (byteIdentical) {
      signals.push({
        id: `ev-byte-identical:${shortHash(...paths.map((file) => textByFile.get(file) ?? ""))}`,
        kind: "structural" as const,
        detail: `Files are byte-identical: ${paths.join(", ")}.`,
      });
    }
    detections.push({
      id: detectionId("exact-duplicate", paths),
      detector: "exact-duplicate",
      test_paths: paths,
      signals,
      rationale: byteIdentical
        ? "Test files are byte-identical and AST-identical."
        : "Test files are AST-identical after comment and formatting normalization.",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "exact-duplicate", detections, limitations: LIMITATIONS };
}
