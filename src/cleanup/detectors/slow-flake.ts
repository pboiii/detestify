// Slow/flake REPORTERS. Per ADR-006 these are reported separately from
// ownership redundancy: the output is observations with NO signals field, so
// it structurally cannot feed deletion eligibility.

import type { DetectorContext } from "./context.js";
import {
  shortHash,
  type CleanupObservation,
  type ReporterResult,
} from "./types.js";

/** Explicit per-test timeouts at or above this are reported as slow markers. */
export const SLOW_TIMEOUT_MS = 10_000;

const LIMITATIONS = [
  "Static markers only (explicit retry/timeout declarations); no runtime timing or pass-history data is consumed.",
  "Observations are reported separately from redundancy and carry no deletion signal (ADR-006): flakiness says nothing about obligation importance.",
];

export function reportSlowFlake(context: DetectorContext): ReporterResult {
  const observations: CleanupObservation[] = [];
  for (const test of context.tests) {
    const slow = test.testDeclarations.filter(
      (declaration) =>
        declaration.timeoutMs !== null &&
        declaration.timeoutMs >= SLOW_TIMEOUT_MS,
    );
    if (slow.length > 0) {
      observations.push({
        id: `obs-slow-${shortHash(test.file)}`,
        kind: "slow",
        test_paths: [test.file],
        detail: `Explicit timeout >= ${SLOW_TIMEOUT_MS}ms on: ${slow
          .map(
            (declaration) =>
              `"${declaration.name}" (${declaration.timeoutMs}ms)`,
          )
          .join(", ")}.`,
        limitations: LIMITATIONS,
      });
    }

    const flaky = test.testDeclarations.filter(
      (declaration) => declaration.retry !== null && declaration.retry > 0,
    );
    if (flaky.length > 0 || (test.fileRetry !== null && test.fileRetry > 0)) {
      const parts = flaky.map(
        (declaration) => `"${declaration.name}" (retry ${declaration.retry})`,
      );
      if (test.fileRetry !== null && test.fileRetry > 0) {
        parts.push(`file-level jest.retryTimes(${test.fileRetry})`);
      }
      observations.push({
        id: `obs-flake-${shortHash(test.file)}`,
        kind: "flake",
        test_paths: [test.file],
        detail: `Retry markers declared: ${parts.join(", ")}.`,
        limitations: LIMITATIONS,
      });
    }
  }

  observations.sort((a, b) => a.id.localeCompare(b.id));
  return { reporter: "slow-flake", observations, limitations: LIMITATIONS };
}
