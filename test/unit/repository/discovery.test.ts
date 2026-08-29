import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
} from "../../../src/repository/discovery.js";

let repoRoot = "";

beforeAll(async () => {
  repoRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "test-steward-discovery-")),
  );
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await mkdir(path.join(repoRoot, "test"), { recursive: true });
  await mkdir(path.join(repoRoot, ".git"), { recursive: true });
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
  await writeFile(path.join(repoRoot, ".git/config"), "[core]\n");
  await writeFile(
    path.join(repoRoot, "node_modules/depth/index.js"),
    "module.exports = 1;\n",
  );
});

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("repository file listing", () => {
  it("walks the worktree and skips .git and node_modules", async () => {
    const files = await listRepositoryFiles(repoRoot);
    expect(files).toEqual([
      "package.json",
      "src/math.ts",
      "test/math.test.ts",
      "vitest.config.ts",
    ]);
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
