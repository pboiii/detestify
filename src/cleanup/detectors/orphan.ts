// Orphan detector: tests importing deleted files or symbols the resolved
// module no longer exports. Deterministic import-graph check over the
// src/analysis inventory plus TypeScript export facts; no semantic inference.

import type { SourceFileFacts } from "../../analysis/typescript.js";
import {
  detectionId,
  type CleanupDetection,
  type DetectorResult,
  type DetectorSignal,
} from "./types.js";
import type { DetectorContext } from "./context.js";

const LIMITATIONS = [
  "Only relative-path imports are checked for missing files; package imports are out of scope.",
  "Named-symbol checks skip targets with star re-exports and skip default/namespace imports.",
  "An orphan import is a structural staleness fact; deletion eligibility remains the planner's job.",
];

export function detectOrphans(
  context: DetectorContext,
  sourceFacts: readonly SourceFileFacts[],
): DetectorResult {
  const exportsByFile = new Map<
    string,
    { names: Set<string>; hasStar: boolean }
  >();
  for (const facts of sourceFacts) {
    const names = new Set<string>();
    let hasStar = false;
    for (const exported of facts.exports) {
      if (exported.form === "star") {
        hasStar = true;
      } else {
        names.add(exported.name);
      }
    }
    exportsByFile.set(facts.file, { names, hasStar });
  }

  const detections: CleanupDetection[] = [];
  for (const test of context.tests) {
    const signals: DetectorSignal[] = [];

    for (const edge of test.inventory.imports) {
      if (edge.resolution === "unresolved" && edge.specifier.startsWith(".")) {
        signals.push({
          id: `ev-orphan-import:${test.file}->${edge.specifier}`,
          kind: "structural",
          detail: `Import "${edge.specifier}" does not resolve to any repository file; the target was deleted or moved.`,
        });
        continue;
      }
      if (edge.resolution !== "in-repo" || edge.to === null) {
        continue;
      }
      const target = exportsByFile.get(edge.to);
      if (target === undefined || target.hasStar) {
        continue;
      }
      const named = test.namedImports.find(
        (entry) => entry.specifier === edge.specifier,
      );
      for (const name of named?.names ?? []) {
        if (!target.names.has(name)) {
          signals.push({
            id: `ev-orphan-symbol:${test.file}->${edge.to}#${name}`,
            kind: "structural",
            detail: `Imported symbol "${name}" is not exported by ${edge.to}.`,
          });
        }
      }
    }

    if (signals.length === 0) {
      continue;
    }
    detections.push({
      id: detectionId("orphan", [test.file]),
      detector: "orphan",
      test_paths: [test.file],
      signals,
      rationale:
        "Test imports files or symbols that no longer exist in the repository; it cannot exercise current behavior.",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "orphan", detections, limitations: LIMITATIONS };
}
