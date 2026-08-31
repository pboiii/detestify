import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
} from "../../../src/repository/discovery.js";
import { runGit } from "../../../src/repository/git.js";

let repoRoot = "";

beforeAll(async () => {
  repoRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "test-steward-discovery-")),
  );
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await mkdir(path.join(repoRoot, "test"), { recursive: true });
  await mkdir(path.join(repoRoot, "nested-worktree/test"), {
    recursive: true,
  });
  await mkdir(path.join(repoRoot, "node_modules/depth"), { recursive: true });

  await writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({
      name: "fixture",
      type: "module",
      scripts: { test: "vitest run", evil: "rm -rf /" },
      devDependencies: { vitest: "3.0.0", typescript: "5.0.0" },
    }),
  );
  await writeFile(
    path.join(repoRoot, "vitest.config.ts"),
    "throw new Error('must never execute');\n",
  );
  await writeFile(path.join(repoRoot, "src/math.ts"), "export const a = 1;\n");
  await writeFile(
    path.join(repoRoot, "test/math.test.ts"),
    "export const t = 1;\n",
  );
  await writeFile(
    path.join(repoRoot, "node_modules/depth/index.js"),
    "module.exports = 1;\n",
  );
  await writeFile(path.join(repoRoot, ".gitignore"), "dist/\nnode_modules/\n");
  await runGit(repoRoot, ["init", "-q"]);
  await runGit(repoRoot, [
    "add",
    ".gitignore",
    "package.json",
    "src/math.ts",
    "test/math.test.ts",
    "vitest.config.ts",
  ]);
  await writeFile(
    path.join(repoRoot, "src/untracked.ts"),
    "export const untracked = 1;\n",
  );
  await mkdir(path.join(repoRoot, "dist"), { recursive: true });
  await writeFile(path.join(repoRoot, "dist/package.json"), "{}\n");
  await writeFile(path.join(repoRoot, "dist/vitest.config.ts"), "export {};\n");
  await writeFile(path.join(repoRoot, "dist/copy.test.ts"), "export {};\n");
  await writeFile(
    path.join(repoRoot, "nested-worktree/.git"),
    "gitdir: /outside/worktree\n",
  );
  await writeFile(
    path.join(repoRoot, "nested-worktree/test/ignored.test.ts"),
    "throw new Error('must not be discovered');\n",
  );
});

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("repository file listing", () => {
  it("uses Git's tracked and non-ignored worktree files", async () => {
    const files = await listRepositoryFiles(repoRoot);
    expect(files).toEqual([
      ".gitignore",
      "package.json",
      "src/math.ts",
      "src/untracked.ts",
      "test/math.test.ts",
      "vitest.config.ts",
    ]);
    const shape = await discoverRepositoryShape(repoRoot, files);
    expect(shape.manifests.map((manifest) => manifest.path)).toEqual([
      "package.json",
    ]);
    expect(shape.sourceFiles).toEqual([
      "src/math.ts",
      "src/untracked.ts",
      "vitest.config.ts",
    ]);
    expect(shape.testFiles).toEqual(["test/math.test.ts"]);
  });

  it("skips test files in nested Git worktrees", async () => {
    const files = await listRepositoryFiles(repoRoot);
    expect(files).not.toContain("nested-worktree/test/ignored.test.ts");
  });
});

describe("repository shape discovery", () => {
  it("detects the vitest runner from dependency and config markers", async () => {
    const shape = await discoverRepositoryShape(repoRoot, [
      "package.json",
      "vitest.config.ts",
      "src/math.ts",
      "test/math.test.ts",
    ]);
    expect(shape.runner).toBe("vitest");
    expect(shape.runnerMarkers).toContainEqual({
      path: "package.json",
      runner: "vitest",
      kind: "dependency",
      executable: false,
    });
    expect(shape.runnerMarkers).toContainEqual({
      path: "vitest.config.ts",
      runner: "vitest",
      kind: "config-file",
      executable: true,
    });
  });

  it("parses the manifest inertly: names only, script bodies never run", async () => {
    const shape = await discoverRepositoryShape(repoRoot, ["package.json"]);
    const manifest = shape.manifests[0];
    expect(manifest).toMatchObject({
      path: "package.json",
      name: "fixture",
      moduleType: "module",
      scriptNames: ["evil", "test"],
      devDependencyNames: ["typescript", "vitest"],
    });
    expect(JSON.stringify(shape)).not.toContain("rm -rf /");
  });

  it("reports executable JS/TS runner config as a limitation, not a read", async () => {
    const shape = await discoverRepositoryShape(repoRoot, ["vitest.config.ts"]);
    expect(
      shape.limitations.some(
        (entry) =>
          entry.includes("vitest.config.ts") && entry.includes("executable"),
      ),
    ).toBe(true);
  });

  it("splits source and test topology by naming convention", async () => {
    const shape = await discoverRepositoryShape(repoRoot, [
      "src/math.ts",
      "test/math.test.ts",
      "package.json",
    ]);
    expect(shape.sourceFiles).toEqual(["src/math.ts"]);
    expect(shape.testFiles).toEqual(["test/math.test.ts"]);
  });

  it("excludes name-only fixture modules from runner execution", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-fixture-module-"),
    );
    try {
      await mkdir(path.join(fixtureRoot, "src"));
      await writeFile(
        path.join(fixtureRoot, "package.json"),
        JSON.stringify({ devDependencies: { vitest: "3.0.0" } }),
      );
      await writeFile(
        path.join(fixtureRoot, "src/cases.spec.ts"),
        "export const cases = [1, 2];\n",
      );
      await writeFile(
        path.join(fixtureRoot, "src/math.test.ts"),
        "import { it } from 'vitest';\nit('math', () => {});\n",
      );
      const shape = await discoverRepositoryShape(fixtureRoot, [
        "package.json",
        "src/cases.spec.ts",
        "src/math.test.ts",
      ]);
      expect(shape.runner).toBe("vitest");
      expect(shape.testFiles).toEqual([
        "src/cases.spec.ts",
        "src/math.test.ts",
      ]);
      expect(shape.runnerTestFiles).toEqual(["src/math.test.ts"]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["vitest", "vitest", "test"],
    ["vitest each", "vitest", "test.each([[1]])"],
    ["jest", "jest", "describe"],
  ] as const)(
    "includes %s tests that use configured globals without imports",
    async (_label, runner, registration) => {
      const globalRoot = await mkdtemp(
        path.join(os.tmpdir(), `test-steward-${runner}-globals-`),
      );
      try {
        await mkdir(path.join(globalRoot, "test"));
        await writeFile(
          path.join(globalRoot, "package.json"),
          JSON.stringify({ devDependencies: { [runner]: "3.0.0" } }),
        );
        await writeFile(
          path.join(globalRoot, "test/global.test.ts"),
          `${registration}("global", () => {});\n`,
        );
        await writeFile(
          path.join(globalRoot, "test/cases.test.ts"),
          "export const cases = [1, 2];\n",
        );
        const shape = await discoverRepositoryShape(globalRoot, [
          "package.json",
          "test/cases.test.ts",
          "test/global.test.ts",
        ]);
        expect(shape.runner).toBe(runner);
        expect(shape.runnerTestFiles).toEqual(["test/global.test.ts"]);
      } finally {
        await rm(globalRoot, { recursive: true, force: true });
      }
    },
  );

  it("reports a malformed manifest as a limitation instead of failing", async () => {
    const brokenRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-broken-manifest-"),
    );
    try {
      await writeFile(path.join(brokenRoot, "package.json"), "{ not json");
      const shape = await discoverRepositoryShape(brokenRoot, ["package.json"]);
      expect(shape.manifests).toEqual([]);
      expect(shape.runner).toBe("none");
      expect(shape.limitations.length).toBeGreaterThan(0);
    } finally {
      await rm(brokenRoot, { recursive: true, force: true });
    }
  });

  it("returns unknown when both vitest and jest markers exist", async () => {
    const mixedRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-mixed-"),
    );
    try {
      await writeFile(
        path.join(mixedRoot, "package.json"),
        JSON.stringify({
          devDependencies: { vitest: "3.0.0", jest: "29.0.0" },
        }),
      );
      const shape = await discoverRepositoryShape(mixedRoot, ["package.json"]);
      expect(shape.runner).toBe("unknown");
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });

  it("returns unknown for Vitest plus a node:test script without exposing it", async () => {
    const mixedRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-node-test-"),
    );
    try {
      await writeFile(
        path.join(mixedRoot, "package.json"),
        JSON.stringify({
          scripts: { "test:node": "node --test test/*.test.js" },
          devDependencies: { vitest: "3.0.0" },
        }),
      );
      const shape = await discoverRepositoryShape(mixedRoot, ["package.json"]);
      expect(shape.runner).toBe("unknown");
      expect(shape.runnerMarkers).toContainEqual({
        path: "package.json",
        runner: "node:test",
        kind: "package-script",
        executable: false,
      });
      expect(JSON.stringify(shape)).not.toContain("node --test");
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });

  it("returns unknown for Vitest plus an unread Playwright config", async () => {
    const mixedRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-playwright-"),
    );
    try {
      await writeFile(
        path.join(mixedRoot, "package.json"),
        JSON.stringify({ devDependencies: { vitest: "3.0.0" } }),
      );
      await writeFile(
        path.join(mixedRoot, "playwright.config.ts"),
        "throw new Error('must never execute');\n",
      );
      const shape = await discoverRepositoryShape(mixedRoot, [
        "package.json",
        "playwright.config.ts",
      ]);
      expect(shape.runner).toBe("unknown");
      expect(shape.runnerMarkers).toContainEqual({
        path: "playwright.config.ts",
        runner: "playwright",
        kind: "config-file",
        executable: true,
      });
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });

  it("selects only inertly owned Vitest files in a mixed Playwright repository", async () => {
    const mixedRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-owned-playwright-"),
    );
    try {
      await mkdir(path.join(mixedRoot, "test"));
      await mkdir(path.join(mixedRoot, "e2e"));
      await writeFile(
        path.join(mixedRoot, "package.json"),
        JSON.stringify({
          devDependencies: {
            vitest: "3.0.0",
            "@playwright/test": "1.0.0",
          },
        }),
      );
      await writeFile(
        path.join(mixedRoot, "test/unit.test.ts"),
        "import { it } from 'vitest';\nit('unit', () => {});\n",
      );
      await writeFile(
        path.join(mixedRoot, "e2e/app.spec.ts"),
        "import { test } from '@playwright/test';\ntest('e2e', async () => {});\n",
      );
      await writeFile(
        path.join(mixedRoot, "test/cases.test.ts"),
        "export const cases = [1, 2];\n",
      );
      const shape = await discoverRepositoryShape(mixedRoot, [
        "package.json",
        "test/cases.test.ts",
        "test/unit.test.ts",
        "e2e/app.spec.ts",
      ]);

      expect(shape.runner).toBe("vitest");
      expect(shape.testFiles).toEqual([
        "e2e/app.spec.ts",
        "test/cases.test.ts",
        "test/unit.test.ts",
      ]);
      expect(shape.runnerTestFiles).toEqual(["test/unit.test.ts"]);
      expect(shape.limitations).toContainEqual(
        expect.stringContaining("excluded from execution/replay"),
      );
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });

  it("returns unknown for Vitest plus Bun script/config markers", async () => {
    const mixedRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-bun-"),
    );
    try {
      await writeFile(
        path.join(mixedRoot, "package.json"),
        JSON.stringify({
          scripts: { "test:bun": "bun test" },
          devDependencies: { vitest: "3.0.0" },
        }),
      );
      await writeFile(path.join(mixedRoot, "bunfig.toml"), "[test]\n");
      const shape = await discoverRepositoryShape(mixedRoot, [
        "package.json",
        "bunfig.toml",
      ]);
      expect(shape.runner).toBe("unknown");
      expect(shape.runnerMarkers).toContainEqual({
        path: "package.json",
        runner: "bun",
        kind: "package-script",
        executable: false,
      });
      expect(shape.runnerMarkers).toContainEqual({
        path: "bunfig.toml",
        runner: "bun",
        kind: "config-file",
        executable: false,
      });
    } finally {
      await rm(mixedRoot, { recursive: true, force: true });
    }
  });

  it("detects node:test from an inert package script", async () => {
    const nodeRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-node-only-"),
    );
    try {
      await writeFile(
        path.join(nodeRoot, "package.json"),
        JSON.stringify({ scripts: { test: "node --test" } }),
      );
      const shape = await discoverRepositoryShape(nodeRoot, ["package.json"]);
      expect(shape.runner).toBe("node:test");
      expect(shape.runnerTestFiles).toEqual([]);
    } finally {
      await rm(nodeRoot, { recursive: true, force: true });
    }
  });

  it("detects node:test imports even when a wrapper script hides the command", async () => {
    const nodeRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-node-import-"),
    );
    try {
      await mkdir(path.join(nodeRoot, "test"));
      await writeFile(
        path.join(nodeRoot, "package.json"),
        JSON.stringify({ scripts: { test: "node scripts/run-tests.mjs" } }),
      );
      await writeFile(
        path.join(nodeRoot, "test/native.test.mjs"),
        "import test from 'node:test';\ntest('ok', () => {});\n",
      );
      const shape = await discoverRepositoryShape(nodeRoot, [
        "package.json",
        "test/native.test.mjs",
      ]);
      expect(shape.runner).toBe("node:test");
      expect(shape.runnerTestFiles).toEqual(["test/native.test.mjs"]);
      expect(shape.runnerMarkers).toContainEqual({
        path: "test/native.test.mjs",
        runner: "node:test",
        kind: "package-config",
        executable: false,
      });
    } finally {
      await rm(nodeRoot, { recursive: true, force: true });
    }
  });

  it("detects jest from an inert jest.config.json and package jest field", async () => {
    const jestRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-jest-"),
    );
    try {
      await writeFile(
        path.join(jestRoot, "package.json"),
        JSON.stringify({ jest: { preset: "ts-jest" } }),
      );
      await writeFile(path.join(jestRoot, "jest.config.json"), "{}");
      const shape = await discoverRepositoryShape(jestRoot, [
        "package.json",
        "jest.config.json",
      ]);
      expect(shape.runner).toBe("jest");
      expect(shape.runnerMarkers.filter((marker) => marker.executable)).toEqual(
        [],
      );
    } finally {
      await rm(jestRoot, { recursive: true, force: true });
    }
  });
});
