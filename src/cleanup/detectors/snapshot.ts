// Snapshot detector (policy NTT-009): blind snapshots (unnamed
// `toMatchSnapshot()`) and oversized snapshots (large inline templates or
// large sibling `.snap` files). Read-only: only stats existing files.

import { stat } from "node:fs/promises";
import path from "node:path";
import type { DetectorContext } from "./context.js";
import {
  detectionId,
  type CleanupDetection,
  type DetectorResult,
  type DetectorSignal,
} from "./types.js";

/** Inline snapshot arguments spanning more lines than this are oversized. */
export const INLINE_SNAPSHOT_LINE_LIMIT = 40;
/** Sibling `.snap` files larger than this many bytes are oversized. */
export const SNAPSHOT_FILE_BYTE_LIMIT = 10_000;

const LIMITATIONS = [
  `Size thresholds are fixed heuristics (inline > ${INLINE_SNAPSHOT_LINE_LIMIT} lines, .snap file > ${SNAPSHOT_FILE_BYTE_LIMIT} bytes).`,
  "Whether a snapshot has a reviewed semantic contract is not decidable statically (NTT-009 ambiguous case).",
];

export async function detectSnapshots(
  context: DetectorContext,
): Promise<DetectorResult> {
  const detections: CleanupDetection[] = [];
  for (const test of context.tests) {
    if (!test.inventory.usesSnapshots) {
      continue;
    }
    const signals: DetectorSignal[] = [];

    const blindCount = test.assertions.filter(
      (assertion) =>
        assertion.matcher === "toMatchSnapshot" &&
        assertion.matcherArgCount === 0,
    ).length;
    if (blindCount > 0) {
      signals.push({
        id: `ev-blind-snapshot:${test.file}`,
        kind: "structural",
        detail: `${blindCount} unnamed toMatchSnapshot() assertion(s) with no named semantic contract.`,
      });
    }

    const oversizedInline = test.assertions.filter(
      (assertion) =>
        assertion.matcher === "toMatchInlineSnapshot" &&
        assertion.matcherArgLines > INLINE_SNAPSHOT_LINE_LIMIT,
    ).length;
    if (oversizedInline > 0) {
      signals.push({
        id: `ev-oversized-snapshot:inline:${test.file}`,
        kind: "structural",
        detail: `${oversizedInline} inline snapshot(s) exceed ${INLINE_SNAPSHOT_LINE_LIMIT} lines.`,
      });
    }

    const snapPath = path.posix.join(
      path.posix.dirname(test.file),
      "__snapshots__",
      `${path.posix.basename(test.file)}.snap`,
    );
    try {
      const info = await stat(path.join(context.repoRoot, snapPath));
      if (info.size > SNAPSHOT_FILE_BYTE_LIMIT) {
        signals.push({
          id: `ev-oversized-snapshot:file:${test.file}`,
          kind: "structural",
          detail: `Snapshot file ${snapPath} is ${info.size} bytes (limit ${SNAPSHOT_FILE_BYTE_LIMIT}).`,
        });
      }
    } catch {
      // No sibling .snap file; inline-only snapshots.
    }

    if (signals.length === 0) {
      continue;
    }
    detections.push({
      id: detectionId("snapshot", [test.file]),
      detector: "snapshot",
      test_paths: [test.file],
      signals,
      rationale:
        "Snapshot assertions are blind or oversized; broad snapshots without a named contract churn without protecting behavior (NTT-009).",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "snapshot", detections, limitations: LIMITATIONS };
}
