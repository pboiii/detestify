// Synthetic unit fixtures for the detectors task-04 does not exercise:
// mock-choreography, snapshot (blind + oversized), orphan, trivial, and the
// slow/flake reporters. Includes controls that must not be flagged.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeTypeScript } from "../../../src/analysis/typescript.js";
import {
  detectMockChoreography,
  detectOrphans,
  detectSnapshots,
  detectTrivial,
  reportSlowFlake,
  loadDetectorContext,
  schemaSignals,
  SNAPSHOT_FILE_BYTE_LIMIT,
  type DetectorContext,
} from "../../../src/cleanup/detectors/index.js";

let repoRoot = "";
let context: DetectorContext;

const VITEST_IMPORT = 'import { describe, expect, it, vi } from "vitest";';

beforeAll(async () => {
  repoRoot = await mkdtemp(path.join(os.tmpdir(), "test-steward-cleanup-"));
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await mkdir(path.join(repoRoot, "test", "__snapshots__"), {
    recursive: true,
  });

  await writeFile(
    path.join(repoRoot, "src", "real.ts"),
    "export function realThing(value: string): string {\n  return value;\n}\n",
  );
  await writeFile(
    path.join(repoRoot, "src", "config.ts"),
    "export const config = { port: 8080 };\n",
  );

  const files: Record<string, string> = {
    "test/ok.test.ts": [
      VITEST_IMPORT,
      'import { realThing } from "../src/real.js";',
      'it("echoes input", () => {',
      '  expect(realThing("a")).toBe("a");',
      "});",
    ].join("\n"),
    "test/mock-choreo.test.ts": [
      VITEST_IMPORT,
      'it("calls collaborator twice", () => {',
      "  const spy = vi.fn();",
      "  spy();",
      "  spy();",
      "  expect(spy).toHaveBeenCalledTimes(2);",
      "  expect(spy).toHaveBeenCalledWith();",
      "});",
    ].join("\n"),
    "test/mock-mixed.test.ts": [
      VITEST_IMPORT,
      'import { realThing } from "../src/real.js";',
      'it("asserts output too", () => {',
      "  const spy = vi.fn(realThing);",
      '  const result = spy("x");',
      "  expect(spy).toHaveBeenCalledTimes(1);",
      '  expect(result).toBe("x");',
      "});",
    ].join("\n"),
    "test/snapshot-blind.test.ts": [
      VITEST_IMPORT,
      'it("snapshots blindly", () => {',
      "  expect({ a: 1 }).toMatchSnapshot();",
      "});",
    ].join("\n"),
    "test/snapshot-named.test.ts": [
      VITEST_IMPORT,
      'it("snapshots a named contract", () => {',
      '  expect({ a: 1 }).toMatchSnapshot("wire contract v1");',
      "});",
    ].join("\n"),
    "test/snapshot-big.test.ts": [
      VITEST_IMPORT,
      'it("snapshots a large payload", () => {',
      '  expect({ a: 1 }).toMatchSnapshot("bulk payload");',
      "});",
    ].join("\n"),
    "test/orphan-module.test.ts": [
      VITEST_IMPORT,
      'import { gone } from "../src/missing.js";',
      'it("uses a deleted module", () => {',
      '  expect(gone("x")).toBe("x");',
      "});",
    ].join("\n"),
    "test/orphan-symbol.test.ts": [
      VITEST_IMPORT,
      'import { nope } from "../src/real.js";',
      'it("uses a removed export", () => {',
      '  expect(nope("x")).toBe("x");',
      "});",
    ].join("\n"),
    "test/trivial-const.test.ts": [
      VITEST_IMPORT,
      'describe("constants", () => {',
      '  it("compares literals", () => {',
      "    expect(2).toBe(2);",
      "    expect(true).toBe(true);",
      "  });",
      "});",
    ].join("\n"),
    "test/trivial-getter.test.ts": [
      VITEST_IMPORT,
      'import { config } from "../src/config.js";',
      'it("reads a constant field", () => {',
      "  expect(config.port).toBe(8080);",
      "});",
    ].join("\n"),
    "test/trivial-framework.test.ts": [
      VITEST_IMPORT,
      'it("tests JSON built-in behavior", () => {',
      "  expect(JSON.stringify({ a: 1 })).toBe('{\"a\":1}');",
      "});",
    ].join("\n"),
    "test/slow-flake.test.ts": [
      VITEST_IMPORT,
      'import { realThing } from "../src/real.js";',
      'it("slow integration", { timeout: 30000 }, () => {',
      '  expect(realThing("a")).toBe("a");',
      "});",
      'it("flaky network", { retry: 3 }, () => {',
      '  expect(realThing("b")).toBe("b");',
      "});",
    ].join("\n"),
  };
  for (const [file, text] of Object.entries(files)) {
    await writeFile(path.join(repoRoot, file), `${text}\n`);
  }
  await writeFile(
    path.join(repoRoot, "test", "__snapshots__", "snapshot-big.test.ts.snap"),
    `// big snapshot\n${"x".repeat(SNAPSHOT_FILE_BYTE_LIMIT + 1)}\n`,
  );

  context = await loadDetectorContext(repoRoot);
});

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("mock-choreography detector", () => {
  it("flags files asserting only mock call choreography", () => {
    const result = detectMockChoreography(context);
    expect(result.detections.map((d) => d.test_paths)).toEqual([
      ["test/mock-choreo.test.ts"],
    ]);
    const split = schemaSignals(result.detections[0]?.signals ?? []);
    expect(split.structural_signals).toEqual([
      "ev-mock-choreography:test/mock-choreo.test.ts",
    ]);
    expect(split.independent_signals).toEqual([]);
  });
});

describe("snapshot detector", () => {
  it("flags blind and oversized snapshots but not named small ones", async () => {
    const result = await detectSnapshots(context);
    const byFile = new Map(result.detections.map((d) => [d.test_paths[0], d]));
    expect(
      byFile
        .get("test/snapshot-blind.test.ts")
        ?.signals.some((s) => s.id.startsWith("ev-blind-snapshot:")),
    ).toBe(true);
    expect(
      byFile
        .get("test/snapshot-big.test.ts")
        ?.signals.some((s) => s.id.startsWith("ev-oversized-snapshot:file:")),
    ).toBe(true);
    expect(byFile.has("test/snapshot-named.test.ts")).toBe(false);
  });
});

describe("orphan detector", () => {
  it("flags deleted modules and removed symbols deterministically", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: context.files,
    });
    const result = detectOrphans(context, analysis.files);
    const byFile = new Map(result.detections.map((d) => [d.test_paths[0], d]));
    expect(
      byFile.get("test/orphan-module.test.ts")?.signals.map((s) => s.id),
    ).toEqual([
      "ev-orphan-import:test/orphan-module.test.ts->../src/missing.js",
    ]);
    expect(
      byFile.get("test/orphan-symbol.test.ts")?.signals.map((s) => s.id),
    ).toEqual([
      "ev-orphan-symbol:test/orphan-symbol.test.ts->src/real.ts#nope",
    ]);
    expect(byFile.has("test/ok.test.ts")).toBe(false);
  });
});

describe("trivial detector", () => {
  it("flags constant, getter, and framework-only files but not real behavior", () => {
    const result = detectTrivial(context);
    const flagged = result.detections.map((d) => d.test_paths[0]);
    expect(flagged).toContain("test/trivial-const.test.ts");
    expect(flagged).toContain("test/trivial-getter.test.ts");
    expect(flagged).toContain("test/trivial-framework.test.ts");
    expect(flagged).not.toContain("test/ok.test.ts");
    expect(flagged).not.toContain("test/mock-mixed.test.ts");
  });
});

describe("slow/flake reporters", () => {
  it("emits observations with no deletion signals", () => {
    const result = reportSlowFlake(context);
    const kinds = result.observations.map((o) => [o.kind, o.test_paths[0]]);
    expect(kinds).toContainEqual(["slow", "test/slow-flake.test.ts"]);
    expect(kinds).toContainEqual(["flake", "test/slow-flake.test.ts"]);
    for (const observation of result.observations) {
      expect("signals" in observation).toBe(false);
      expect("structural_signals" in observation).toBe(false);
    }
  });
});

describe("determinism", () => {
  it("produces identical output across independent runs", async () => {
    const again = await loadDetectorContext(repoRoot);
    expect(detectTrivial(again)).toEqual(detectTrivial(context));
    expect(detectMockChoreography(again)).toEqual(
      detectMockChoreography(context),
    );
    expect(reportSlowFlake(again)).toEqual(reportSlowFlake(context));
  });
});
