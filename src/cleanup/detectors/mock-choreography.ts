// Mock-choreography detector (policy NTT-005): mock-using files whose every
// assertion targets call counts, arguments, or order of mocks with no state
// or output assertion.

import type { DetectorContext } from "./context.js";
import {
  detectionId,
  type CleanupDetection,
  type DetectorResult,
} from "./types.js";

/** Jest/Vitest matchers that assert only on mock call choreography. */
const CALL_MATCHERS = new Set([
  "toHaveBeenCalled",
  "toHaveBeenCalledOnce",
  "toHaveBeenCalledTimes",
  "toHaveBeenCalledWith",
  "toHaveBeenCalledExactlyOnceWith",
  "toHaveBeenNthCalledWith",
  "toHaveBeenLastCalledWith",
  "toHaveBeenCalledBefore",
  "toHaveBeenCalledAfter",
  "toBeCalled",
  "toBeCalledTimes",
  "toBeCalledWith",
  "nthCalledWith",
  "lastCalledWith",
]);

const LIMITATIONS = [
  "Classification is per-file: one state or output assertion clears the file.",
  "Cannot tell whether call order is itself a declared invariant (NTT-003 negative case); that needs obligation evidence.",
];

export function detectMockChoreography(
  context: DetectorContext,
): DetectorResult {
  const detections: CleanupDetection[] = [];
  for (const test of context.tests) {
    if (!test.inventory.usesMocks || test.assertions.length === 0) {
      continue;
    }
    const allChoreography = test.assertions.every(
      (assertion) =>
        assertion.matcher !== null && CALL_MATCHERS.has(assertion.matcher),
    );
    if (!allChoreography) {
      continue;
    }
    detections.push({
      id: detectionId("mock-choreography", [test.file]),
      detector: "mock-choreography",
      test_paths: [test.file],
      signals: [
        {
          id: `ev-mock-choreography:${test.file}`,
          kind: "structural",
          detail:
            "Every assertion checks mock call counts, arguments, or order; no state or output is asserted.",
        },
      ],
      rationale:
        "Test freezes internal call choreography of mocks without asserting any observable state or output (NTT-005).",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return {
    detector: "mock-choreography",
    detections,
    limitations: LIMITATIONS,
  };
}
