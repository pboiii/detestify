import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeTypeScript } from "../../../src/analysis/typescript.js";

let repoRoot = "";

beforeAll(async () => {
  repoRoot = await mkdtemp(path.join(os.tmpdir(), "test-steward-analyzer-"));
  await mkdir(path.join(repoRoot, "src"), { recursive: true });

  await writeFile(
    path.join(repoRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: { "@src/*": ["src/*"] },
      },
    }),
  );

  await writeFile(
    path.join(repoRoot, "src", "math.ts"),
    [
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export async function load(id: string): Promise<string> {",
      "  return id;",
      "}",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "consts.ts"),
    [
      'export const VERSION = "1";',
      "export let counter = 0;",
      "export var legacy = 1;",
      "export type Id = string;",
      "export interface Named { name: string }",
      "export enum Color { Red }",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "service.ts"),
    [
      'import { add } from "./math.js";',
      'import { VERSION } from "@src/consts.js";',
      'import { readFile } from "node:fs/promises";',
      'import "./side-effect.js";',
      'import { createHash } from "crypto";',
      'const lazy = await import("./lazy.js");',
      'const legacy = require("./compat.js");',
      "",
      "export default class Service extends Base implements Closeable {",
      "  static create(name: string): Service {",
      "    return new Service();",
      "  }",
      "  async run(input: string): Promise<void> {}",
      "}",
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "re-export.ts"),
    [
      'export { add as plus } from "./math.js";',
      'export * from "./consts.js";',
    ].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "arrow.ts"),
    ["export const normalize = (value: string) => value;"].join("\n"),
  );

  await writeFile(
    path.join(repoRoot, "src", "lazy.ts"),
    "export const loaded = true;\n",
  );
  await writeFile(
    path.join(repoRoot, "src", "side-effect.ts"),
    "export const ran = 1;\n",
  );
  await writeFile(
    path.join(repoRoot, "src", "compat.ts"),
    "export const mode = 1;\n",
  );
  await writeFile(path.join(repoRoot, "src", "broken.ts"), "const x = ;\n");
  await writeFile(path.join(repoRoot, "README.md"), "not code\n");
});

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

const FILES = [
  "src/math.ts",
  "src/consts.ts",
  "src/service.ts",
  "src/re-export.ts",
  "src/arrow.ts",
  "src/lazy.ts",
  "src/side-effect.ts",
  "src/compat.ts",
  "src/broken.ts",
  "README.md",
];

describe("typescript analyzer: syntactic mode", () => {
  it("reports syntactic capability with parser version and path-based resolution", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    expect(analysis.capabilities.mode).toBe("syntactic");
    expect(analysis.capabilities.moduleResolution).toBe("path-based");
    expect(analysis.capabilities.parserVersion).toMatch(/^\d+\.\d+/);
    expect(analysis.capabilities.limitations).toEqual([]);
  });

  it("skips non-JS/TS inputs and reports them", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    expect(analysis.capabilities.skippedFiles).toEqual(["README.md"]);
    expect(analysis.files.map((facts) => facts.file)).not.toContain(
      "README.md",
    );
  });

  it("extracts exported symbols with name, kind, and form", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    const byFile = new Map(analysis.files.map((facts) => [facts.file, facts]));

    expect(byFile.get("src/math.ts")?.exports).toEqual([
      { name: "add", kind: "function", form: "named" },
      { name: "load", kind: "function", form: "named" },
    ]);
    expect(byFile.get("src/consts.ts")?.exports).toEqual([
      { name: "VERSION", kind: "const", form: "named" },
      { name: "counter", kind: "let", form: "named" },
      { name: "legacy", kind: "var", form: "named" },
      { name: "Id", kind: "type-alias", form: "named" },
      { name: "Named", kind: "interface", form: "named" },
      { name: "Color", kind: "enum", form: "named" },
    ]);
    expect(byFile.get("src/service.ts")?.exports).toEqual([
      { name: "default", kind: "class", form: "default" },
    ]);
    // `add` is not local to the re-export file, so its kind is unknown there.
    expect(byFile.get("src/re-export.ts")?.exports).toEqual([
      { name: "plus", kind: "unknown", form: "named" },
      { name: "*", kind: "unknown", form: "star" },
    ]);
  });

  it("extracts canonical function, method, and class signature texts", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    const byFile = new Map(analysis.files.map((facts) => [facts.file, facts]));

    expect(byFile.get("src/math.ts")?.signatures).toEqual([
      {
        name: "add",
        kind: "function",
        text: "function add(a: number, b: number): number",
      },
      {
        name: "load",
        kind: "function",
        text: "async function load(id: string): Promise<string>",
      },
    ]);
    expect(byFile.get("src/arrow.ts")?.signatures).toEqual([
      { name: "normalize", kind: "function", text: "normalize(value: string)" },
    ]);
    const service = byFile.get("src/service.ts")?.signatures ?? [];
    expect(service).toContainEqual({
      name: "Service",
      kind: "class",
      text: "class Service extends Base implements Closeable",
    });
    expect(service).toContainEqual({
      name: "Service.create",
      kind: "method",
      text: "static function create(name: string): Service",
    });
    expect(service).toContainEqual({
      name: "Service.run",
      kind: "method",
      text: "async function run(input: string): Promise<void>",
    });
  });

  it("extracts import graph edges with in-repo, external, and unresolved classes", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    const service = analysis.files.find(
      (facts) => facts.file === "src/service.ts",
    );

    expect(service?.imports).toEqual([
      {
        from: "src/service.ts",
        specifier: "./math.js",
        to: "src/math.ts",
        resolution: "in-repo",
      },
      {
        from: "src/service.ts",
        specifier: "@src/consts.js",
        to: null,
        resolution: "external-package",
      },
      {
        from: "src/service.ts",
        specifier: "node:fs/promises",
        to: null,
        resolution: "external-package",
      },
      {
        from: "src/service.ts",
        specifier: "./side-effect.js",
        to: "src/side-effect.ts",
        resolution: "in-repo",
      },
      {
        from: "src/service.ts",
        specifier: "crypto",
        to: null,
        resolution: "external-package",
      },
      {
        from: "src/service.ts",
        specifier: "./lazy.js",
        to: "src/lazy.ts",
        resolution: "in-repo",
      },
      {
        from: "src/service.ts",
        specifier: "./compat.js",
        to: "src/compat.ts",
        resolution: "in-repo",
      },
    ]);
  });

  it("reports parse diagnostics for files with syntax errors", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "syntactic",
    });
    const broken = analysis.capabilities.parseDiagnostics.filter(
      (d) => d.file === "src/broken.ts",
    );
    expect(broken.length).toBeGreaterThan(0);
    expect(
      broken.every(
        (d) => typeof d.message === "string" && d.message.length > 0,
      ),
    ).toBe(true);
    expect(
      analysis.capabilities.parseDiagnostics.some(
        (d) => typeof d.code === "number",
      ),
    ).toBe(true);
  });
});

describe("typescript analyzer: type-resolved mode", () => {
  it("achieves tsconfig-backed module resolution including path aliases", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: FILES,
      requested: "type-resolved",
    });
    expect(analysis.capabilities.mode).toBe("type-resolved");
    expect(analysis.capabilities.moduleResolution).toBe("tsconfig");

    const service = analysis.files.find(
      (facts) => facts.file === "src/service.ts",
    );
    const aliasEdge = service?.imports.find(
      (edge) => edge.specifier === "@src/consts.js",
    );
    expect(aliasEdge).toEqual({
      from: "src/service.ts",
      specifier: "@src/consts.js",
      to: "src/consts.ts",
      resolution: "in-repo",
    });
  });

  it("degrades to syntactic mode with a limitation when tsconfig is missing", async () => {
    const bareRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-bare-"),
    );
    try {
      await mkdir(path.join(bareRoot, "src"), { recursive: true });
      await writeFile(
        path.join(bareRoot, "src", "a.ts"),
        'import { b } from "./b.js";\n',
      );
      await writeFile(
        path.join(bareRoot, "src", "b.ts"),
        "export const b = 1;\n",
      );

      const analysis = await analyzeTypeScript({
        repoRoot: bareRoot,
        files: ["src/a.ts", "src/b.ts"],
        requested: "type-resolved",
      });
      expect(analysis.capabilities.mode).toBe("syntactic");
      expect(analysis.capabilities.limitations).toHaveLength(1);
      expect(analysis.capabilities.limitations[0]?.code).toBe(
        "TSCONFIG_MISSING",
      );
      expect(analysis.capabilities.moduleResolution).toBe("path-based");
      // Relative resolution still works in the degraded mode.
      expect(analysis.files[0]?.imports[0]).toMatchObject({
        to: "src/b.ts",
        resolution: "in-repo",
      });
    } finally {
      await rm(bareRoot, { recursive: true, force: true });
    }
  });

  it("degrades with a parse-error limitation on a broken tsconfig", async () => {
    const brokenRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-broken-tsconfig-"),
    );
    try {
      await mkdir(path.join(brokenRoot, "src"), { recursive: true });
      await writeFile(path.join(brokenRoot, "tsconfig.json"), "{ not json ]");
      await writeFile(
        path.join(brokenRoot, "src", "a.ts"),
        "export const a = 1;\n",
      );

      const analysis = await analyzeTypeScript({
        repoRoot: brokenRoot,
        files: ["src/a.ts"],
        requested: "type-resolved",
      });
      expect(analysis.capabilities.mode).toBe("syntactic");
      expect(analysis.capabilities.limitations[0]?.code).toBe(
        "TSCONFIG_PARSE_ERROR",
      );
    } finally {
      await rm(brokenRoot, { recursive: true, force: true });
    }
  });
});

describe("typescript analyzer: input handling", () => {
  it("rejects absolute and escaping paths", async () => {
    await expect(
      analyzeTypeScript({
        repoRoot,
        files: ["/etc/passwd"],
        requested: "syntactic",
      }),
    ).rejects.toThrow("repository-relative");
    await expect(
      analyzeTypeScript({
        repoRoot,
        files: ["../outside.ts"],
        requested: "syntactic",
      }),
    ).rejects.toThrow("escapes repository root");
  });

  it("reports unreadable input files as skipped with a diagnostic", async () => {
    const analysis = await analyzeTypeScript({
      repoRoot,
      files: ["src/missing.ts"],
      requested: "syntactic",
    });
    expect(analysis.files).toEqual([]);
    expect(analysis.capabilities.skippedFiles).toEqual(["src/missing.ts"]);
    expect(analysis.capabilities.parseDiagnostics[0]?.file).toBe(
      "src/missing.ts",
    );
  });
});
