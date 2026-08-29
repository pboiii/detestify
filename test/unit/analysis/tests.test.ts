import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeTests, isTestFilePath } from "../../../src/analysis/tests.js";

let repoRoot = "";

beforeAll(async () => {
  repoRoot = await mkdtemp(path.join(os.tmpdir(), "test-steward-tests-"));
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await mkdir(path.join(repoRoot, "__tests__"), { recursive: true });

  await writeFile(
    path.join(repoRoot, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  );

  await writeFile(
    path.join(repoRoot, "math.test.ts"),
    [
      'import { describe, expect, it } from "vitest";',
      'import { add } from "./src/math.js";',
      "",
      'describe("add", () => {',
      '  it("adds two numbers", () => {',
      "    expect(add(1, 2)).toBe(3);",
      "  });",
      "",
      '  it("handles zero", () => {',
      "    expect(add(0, 0)).toBe(0);",
      "  });",
      "});",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "mocks.test.ts"),
    [
      'import { expect, it, vi } from "vitest";',
      "",
      'vi.mock("./src/math.js", () => ({ add: () => 0 }));',
      "",
      'it("uses a mock implementation", () => {',
      "  const spy = vi.fn().mockReturnValue(5);",
      "  expect(spy()).toBe(5);",
      "});",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "snapshots.test.ts"),
    [
      'import { expect, it } from "vitest";',
      "",
      'it("matches the snapshot", () => {',
      "  expect({ a: 1 }).toMatchSnapshot();",
      "});",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "__tests__", "nested.spec.ts"),
    [
      'import { expect, test } from "vitest";',
      'import { add } from "../src/math.js";',
      "",
      'test("assert style", () => {',
      "  expect(add(2, 2)).toBe(4);",
      "});",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "test-utils.ts"),
    "export const notTest = 1;\n",
  );
  await writeFile(
    path.join(repoRoot, "helper.ts"),
    'import { add } from "./src/math.js";\n',
  );
});

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("test file discovery", () => {
  it("matches standard naming conventions", () => {
    expect(isTestFilePath("src/add.test.ts")).toBe(true);
    expect(isTestFilePath("src/add.spec.tsx")).toBe(true);
    expect(isTestFilePath("__tests__/add.ts")).toBe(true);
    expect(isTestFilePath("test/migrations.spec.mjs")).toBe(true);
    expect(isTestFilePath("src/add.ts")).toBe(false);
    expect(isTestFilePath("src/contest.ts")).toBe(false);
    expect(isTestFilePath("src/latest.ts")).toBe(false);
  });
});

describe("test inventory", () => {
  it("inventories only files matching test conventions", async () => {
    const { testFiles } = await analyzeTests({
      repoRoot,
      files: [
        "math.test.ts",
        "mocks.test.ts",
        "snapshots.test.ts",
        "__tests__/nested.spec.ts",
        "src/test-utils.ts",
        "helper.ts",
        "src/math.ts",
      ],
    });
    expect(testFiles.map((file) => file.file)).toEqual([
      "__tests__/nested.spec.ts",
      "math.test.ts",
      "mocks.test.ts",
      "snapshots.test.ts",
    ]);
  });

  it("extracts the nested suite tree and import edges", async () => {
    const { testFiles } = await analyzeTests({
      repoRoot,
      files: ["math.test.ts", "src/math.ts"],
    });
    expect(testFiles[0]?.suites).toEqual([
      {
        name: "add",
        kind: "suite",
        children: [
          { name: "adds two numbers", kind: "test", children: [] },
          { name: "handles zero", kind: "test", children: [] },
        ],
      },
    ]);
    expect(testFiles[0]?.imports).toEqual([
      {
        from: "math.test.ts",
        specifier: "vitest",
        to: null,
        resolution: "external-package",
      },
      {
        from: "math.test.ts",
        specifier: "./src/math.js",
        to: "src/math.ts",
        resolution: "in-repo",
      },
    ]);
  });

  it("counts assertions and flags snapshot and mock usage", async () => {
    const { testFiles } = await analyzeTests({
      repoRoot,
      files: ["math.test.ts", "mocks.test.ts", "snapshots.test.ts"],
    });
    const byFile = new Map(testFiles.map((file) => [file.file, file]));
    expect(byFile.get("math.test.ts")?.assertions).toBe(2);
    expect(byFile.get("math.test.ts")?.usesMocks).toBe(false);
    expect(byFile.get("math.test.ts")?.usesSnapshots).toBe(false);
    expect(byFile.get("mocks.test.ts")?.usesMocks).toBe(true);
    expect(byFile.get("snapshots.test.ts")?.usesSnapshots).toBe(true);
  });

  it("reports unreadable test files", async () => {
    const { testFiles, unreadableFiles } = await analyzeTests({
      repoRoot,
      files: ["missing.test.ts"],
    });
    expect(testFiles).toEqual([]);
    expect(unreadableFiles).toEqual(["missing.test.ts"]);
  });
});

describe("task-04 fixture inventory", () => {
  const fixtureRoot = path.resolve("spec/handoff/fixtures/task-04/repo");

  it("finds the six fixture test files and their direct imports", async () => {
    const files = [
      "package.json",
      "tsconfig.json",
      "src/email.ts",
      "src/webhook-response.ts",
      "test/email-normalize-copy.test.ts",
      "test/email-normalize-similar.test.ts",
      "test/email-normalize.test.ts",
      "test/legacy-v1.test.ts",
      "test/webhook-contract.test.ts",
      "test/webhook-unit.test.ts",
    ];
    const { testFiles } = await analyzeTests({ repoRoot: fixtureRoot, files });

    expect(testFiles.map((file) => file.file)).toEqual([
      "test/email-normalize-copy.test.ts",
      "test/email-normalize-similar.test.ts",
      "test/email-normalize.test.ts",
      "test/legacy-v1.test.ts",
      "test/webhook-contract.test.ts",
      "test/webhook-unit.test.ts",
    ]);

    const imports = testFiles.flatMap((file) => file.imports);
    expect(imports.filter((edge) => edge.resolution === "in-repo")).toEqual([
      {
        from: "test/email-normalize-copy.test.ts",
        specifier: "../src/email.js",
        to: "src/email.ts",
        resolution: "in-repo",
      },
      {
        from: "test/email-normalize-similar.test.ts",
        specifier: "../src/email.js",
        to: "src/email.ts",
        resolution: "in-repo",
      },
      {
        from: "test/email-normalize.test.ts",
        specifier: "../src/email.js",
        to: "src/email.ts",
        resolution: "in-repo",
      },
      {
        from: "test/legacy-v1.test.ts",
        specifier: "../src/email.js",
        to: "src/email.ts",
        resolution: "in-repo",
      },
      {
        from: "test/webhook-contract.test.ts",
        specifier: "../src/webhook-response.js",
        to: "src/webhook-response.ts",
        resolution: "in-repo",
      },
      {
        from: "test/webhook-unit.test.ts",
        specifier: "../src/webhook-response.js",
        to: "src/webhook-response.ts",
        resolution: "in-repo",
      },
    ]);
  });

  it("extracts suite names including the it.each parameterized case", async () => {
    const { testFiles } = await analyzeTests({
      repoRoot: fixtureRoot,
      files: ["test/email-normalize-similar.test.ts"],
    });
    expect(testFiles[0]?.suites).toEqual([
      {
        name: "normalizeEmail external input partitions",
        kind: "suite",
        children: [{ name: "normalizes %j", kind: "test", children: [] }],
      },
    ]);
  });
});
