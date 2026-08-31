// Trivial-test detector (policy NTT-002): files whose every assertion is a
// constant comparison, a plain property read against a literal, or an
// exercise of built-in/framework behavior. Conservative: one non-trivial
// assertion clears the file.

import type { AssertionFact, DetectorContext } from "./context.js";
import {
  detectionId,
  type CleanupDetection,
  type DetectorResult,
} from "./types.js";

const LIMITATIONS = [
  "Classification is per-file: a single non-trivial assertion clears the file.",
  "Pass-through delegation tests require source semantics and are not detected.",
  "Constructor-based subjects (`new X()`) are not classified.",
  "A trivial-assertion signal is structural; a policy, side-effect, or compatibility obligation can still justify the test (NTT-002).",
];

type TrivialKind = "constant" | "getter" | "framework" | null;

function classify(
  assertion: AssertionFact,
  declaredNames: ReadonlySet<string>,
): TrivialKind {
  const subject = assertion.subject;
  if (subject === null) {
    return null;
  }
  if (subject.isLiteral) {
    return "constant";
  }
  if (
    !subject.hasCall &&
    !subject.baseIdentifierFromCall &&
    subject.propertyPath.length > 0 &&
    assertion.expected.isLiteral
  ) {
    return "getter";
  }
  if (
    subject.hasCall &&
    subject.calleeNames.length > 0 &&
    subject.calleeNames.every((name) => !declaredNames.has(name))
  ) {
    // Every callee is neither imported nor declared in the file: the subject
    // exercises only global/built-in behavior.
    return "framework";
  }
  return null;
}

export function detectTrivial(context: DetectorContext): DetectorResult {
  const detections: CleanupDetection[] = [];
  for (const test of context.tests) {
    if (test.assertions.length === 0) {
      continue;
    }
    const kinds = test.assertions.map((assertion) =>
      classify(assertion, test.declaredNames),
    );
    if (kinds.some((kind) => kind === null)) {
      continue;
    }
    const summary = [...new Set(kinds)].sort().join(", ");
    detections.push({
      id: detectionId("trivial", [test.file]),
      detector: "trivial",
      test_paths: [test.file],
      signals: [
        {
          id: `ev-trivial-assertions:${test.file}`,
          kind: "structural",
          detail: `Every assertion is trivial (${summary}): constants, plain property reads, or built-in behavior only.`,
        },
      ],
      rationale:
        "All assertions test constants, plain property reads, or framework/built-in behavior rather than repository logic (NTT-002).",
      limitations: LIMITATIONS,
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "trivial", detections, limitations: LIMITATIONS };
}
