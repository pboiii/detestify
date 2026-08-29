// Cleanup candidate detectors (M8 part 1). Every detector is read-only and
// deterministic, consumes src/analysis facts, and emits signals only —
// deletion eligibility, protected-record enforcement, and actions belong to
// the planner (ADR-006).

export * from "./types.js";
export {
  loadDetectorContext,
  type AssertionFact,
  type AssertionSubjectFacts,
  type DetectorContext,
  type NamedImportFacts,
  type TestDeclarationFacts,
  type TestFileSource,
} from "./context.js";
export { detectExactDuplicates } from "./exact-duplicate.js";
export { detectSimilar } from "./similar.js";
export { detectOrphans } from "./orphan.js";
export { detectTrivial } from "./trivial.js";
export { detectMockChoreography } from "./mock-choreography.js";
export {
  detectSnapshots,
  INLINE_SNAPSHOT_LINE_LIMIT,
  SNAPSHOT_FILE_BYTE_LIMIT,
} from "./snapshot.js";
export { detectExpiry, EXPIRY_MARKER_PATH } from "./expiry.js";
export { detectPlacement } from "./placement.js";
export { reportSlowFlake, SLOW_TIMEOUT_MS } from "./slow-flake.js";
