// Acceptance run over the task-04 fixture repository (spec read as input
// data only): the detectors must find the exact duplicate, the similar
// candidate, the expired marker, and the webhook placement relationship —
// and must never flag the protected contract test as the redundant side.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeTypeScript } from "../../../src/analysis/typescript.js";
import {
  detectExactDuplicates,
  detectExpiry,
  detectMockChoreography,
  detectOrphans,
  detectPlacement,
  detectSimilar,
  detectSnapshots,
  detectTrivial,
  loadDetectorContext,
  schemaSignals,
  type CleanupDetection,
  type DetectorContext,
  type DetectorResult,
} from "../../../src/cleanup/detectors/index.js";
import {
  formatSchemaErrors,
  getValidator,
} from "../../../src/core/schemas/index.js";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../spec/handoff/fixtures/task-04/repo", import.meta.url),
);
const TODAY = "2026-08-28";
const PROTECTED_PATH = "test/webhook-contract.test.ts";

let context: DetectorContext;
let results: Record<string, DetectorResult>;

beforeAll(async () => {
  context = await loadDetectorContext(FIXTURE_ROOT);
  const sourceAnalysis = await analyzeTypeScript({
    repoRoot: FIXTURE_ROOT,
    files: context.files,
  });
  results = {
    exact: detectExactDuplicates(context),
    similar: detectSimilar(context),
    orphan: detectOrphans(context, sourceAnalysis.files),
    trivial: detectTrivial(context),
    mock: detectMockChoreography(context),
    snapshot: await detectSnapshots(context),
    placement: detectPlacement(context),
  };
});

describe("task-04 fixture detections", () => {
  it("finds the exact duplicate pair with byte and AST signals", () => {
    const detections = results["exact"]?.detections ?? [];
    expect(detections).toHaveLength(1);
    const detection = detections[0];
    expect(detection?.test_paths).toEqual([
      "test/email-normalize-copy.test.ts",
      "test/email-normalize.test.ts",
    ]);
    const kinds = detection?.signals.map((signal) => signal.kind);
    expect(kinds).toEqual(["structural", "structural"]);
    const ids = detection?.signals.map((signal) => signal.id) ?? [];
    expect(ids.some((id) => id.startsWith("ev-ast-identical:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("ev-byte-identical:"))).toBe(true);
  });

  it("finds the similar candidate as a structural-only signal", () => {
    const detections = results["similar"]?.detections ?? [];
    const group = detections.find((detection) =>
      detection.test_paths.includes("test/email-normalize-similar.test.ts"),
    );
    expect(group).toBeDefined();
    expect(group?.test_paths).toContain("test/email-normalize.test.ts");
    const split = schemaSignals(group?.signals ?? []);
    expect(split.structural_signals.length).toBeGreaterThan(0);
    expect(split.independent_signals).toEqual([]);
  });

  it("finds the expired marker for legacy-v1 as a historical signal", async () => {
    const expiry = await detectExpiry(FIXTURE_ROOT, TODAY);
    expect(expiry.detections).toHaveLength(1);
    const detection = expiry.detections[0];
    expect(detection?.test_paths).toEqual(["test/legacy-v1.test.ts"]);
    expect(detection?.signals[0]?.kind).toBe("historical");
    const split = schemaSignals(detection?.signals ?? []);
    expect(split.independent_signals).toEqual([
      "ev-expiry-record:test/legacy-v1.test.ts",
    ]);
    expect(split.structural_signals).toEqual([]);
  });

  it("emits no expiry detection before the marker date", async () => {
    const expiry = await detectExpiry(FIXTURE_ROOT, "2025-06-01");
    expect(expiry.detections).toEqual([]);
  });

  it("finds the webhook-unit vs webhook-contract placement relationship", () => {
    const placement = detectPlacement(context);
    expect(placement.detections).toHaveLength(1);
    const detection = placement.detections[0];
    expect(detection?.covered_path).toBe("test/webhook-unit.test.ts");
    expect(detection?.covering_path).toBe(PROTECTED_PATH);
    expect(detection?.test_paths).toEqual([
      PROTECTED_PATH,
      "test/webhook-unit.test.ts",
    ]);
  });

  it("never flags the protected contract test as the redundant side", () => {
    for (const key of [
      "exact",
      "similar",
      "orphan",
      "trivial",
      "mock",
      "snapshot",
    ]) {
      for (const detection of results[key]?.detections ?? []) {
        expect(detection.test_paths).not.toContain(PROTECTED_PATH);
      }
    }
    for (const detection of detectPlacement(context).detections) {
      expect(detection.covered_path).not.toBe(PROTECTED_PATH);
    }
  });

  it("carries protected-record identity: paths match protected-tests.json", async () => {
    const raw = await readFile(
      path.join(FIXTURE_ROOT, ".detestify/protected-tests.json"),
      "utf8",
    );
    const protectedRecord = JSON.parse(raw) as {
      tests: readonly { path: string }[];
    };
    const declared = protectedRecord.tests[0]?.path;
    expect(declared).toBe(PROTECTED_PATH);
    const placement = detectPlacement(context).detections[0];
    expect(placement?.covering_path).toBe(declared);
  });

  it("emits nothing from detectors with no matching pattern in the fixture", () => {
    expect(results["orphan"]?.detections).toEqual([]);
    expect(results["trivial"]?.detections).toEqual([]);
    expect(results["mock"]?.detections).toEqual([]);
    expect(results["snapshot"]?.detections).toEqual([]);
  });

  it("reports per-detector limitations", () => {
    for (const result of Object.values(results)) {
      expect(result.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe("schema shaping", () => {
  it("detections assemble into a valid cleanup-plan document", async () => {
    const expiry = await detectExpiry(FIXTURE_ROOT, TODAY);
    const detections: CleanupDetection[] = [
      ...Object.values(results).flatMap((result) => result.detections),
      ...expiry.detections,
    ];
    expect(detections.length).toBeGreaterThan(0);

    // Planner-neutral filling: detectors supply identity, signals, rationale,
    // and limitations; every action-bearing field stays non-destructive.
    const plan = {
      schema_version: "1.0",
      plan_id: "detector-shaping-test",
      generated_at: "2026-08-28T00:00:00Z",
      repository: {
        root: FIXTURE_ROOT,
        revision: "fixture",
        diff_fingerprint: "sha256:fixture",
      },
      candidates: detections.map((detection) => ({
        id: detection.id,
        test_paths: [...detection.test_paths],
        remove_paths: [],
        retain_paths: [],
        action: "INSUFFICIENT_EVIDENCE",
        obligation_ids: [],
        obligation_preservation: [],
        ...schemaSignals(detection.signals),
        protected_checks: [
          {
            source: ".detestify/protected-tests.json",
            passed: true,
            detail:
              "Not evaluated by detectors; protection is the planner's job.",
          },
        ],
        counterfactual: {
          status: "not_run",
          commands_ref: null,
          candidate_id: null,
          remove_paths: [],
          retain_paths: [],
          preserved_obligations: [],
          limitations: ["Detector output only."],
        },
        worktree_validation: {
          status: "not_run",
          worktree_ref: null,
          revision: null,
          cleanup_complete: true,
        },
        human_approval: {
          required: true,
          status: "not_requested",
          approver_ref: null,
        },
        rationale: detection.rationale,
        limitations: [...detection.limitations],
      })),
      limitations: ["Detector-only plan assembled by the acceptance test."],
    };

    const validate = await getValidator("cleanup-plan.schema.json");
    const valid = validate(plan);
    expect(valid, formatSchemaErrors(validate.errors)).toBe(true);
  });
});
