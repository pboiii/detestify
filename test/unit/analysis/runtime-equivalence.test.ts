import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasEquivalentNativeRuntimeEmit,
  runtimeEquivalentTypeScriptPaths,
} from "../../../src/analysis/runtime-equivalence.js";
import { snapshotRepository } from "../../../src/repository/git.js";
import { initGitRepo } from "../evidence/helpers.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "detestify-runtime-equivalence-"));
  await mkdir(path.join(repo, "src"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("runtime emit equivalence", () => {
  it("finds erased type-only changes and rejects runtime changes", async () => {
    const source = path.join(repo, "src", "value.ts");
    await writeFile(
      source,
      "export const value = (input: { n: number }): number => input.n;\n",
    );
    await initGitRepo(repo);
    await writeFile(
      source,
      "export const value = (input: { readonly n: number }): number => input.n;\n",
    );
    expect(
      await runtimeEquivalentTypeScriptPaths(
        await snapshotRepository(repo),
        hasEquivalentNativeRuntimeEmit,
      ),
    ).toEqual(["src/value.ts"]);

    await writeFile(
      source,
      "export const value = (input: { readonly n: number }): number => input.n + 1;\n",
    );
    expect(
      await runtimeEquivalentTypeScriptPaths(
        await snapshotRepository(repo),
        hasEquivalentNativeRuntimeEmit,
      ),
    ).toEqual([]);
  });
});
