import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { snapshotRepository } from "../../../src/repository/git.js";
import {
  buildGitDiffEvidence,
  fingerprintDiff,
} from "../../../src/repository/fingerprint.js";
import { getValidator } from "../../../src/core/schemas/index.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=steward@example.invalid",
      "-c",
      "user.name=Test Steward",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd },
  );
}

let repo = "";

beforeAll(async () => {
  repo = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "test-steward-fingerprint-")),
  );
  await git(repo, ["init", "--initial-branch=main"]);
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "src/a.ts"), "export const a = 1;\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  await writeFile(path.join(repo, "src/a.ts"), "export const a = 2;\n");
  await writeFile(path.join(repo, "src/new.ts"), "export const n = 1;\n");
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("diff fingerprint", () => {
  it("is identical across two runs on an unchanged tree", async () => {
    const first = await fingerprintDiff(await snapshotRepository(repo));
    const second = await fingerprintDiff(await snapshotRepository(repo));
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(first.limitations).toEqual([]);
  });

  it("changes when a changed file's content changes", async () => {
    const before = await fingerprintDiff(await snapshotRepository(repo));
    await writeFile(path.join(repo, "src/new.ts"), "export const n = 2;\n");
    const after = await fingerprintDiff(await snapshotRepository(repo));
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it("changes when a changed regular file becomes executable", async () => {
    const file = path.join(repo, "src/new.ts");
    await chmod(file, 0o644);
    const before = await fingerprintDiff(await snapshotRepository(repo));
    try {
      await chmod(file, 0o755);
      const after = await fingerprintDiff(await snapshotRepository(repo));
      expect(after.fingerprint).not.toBe(before.fingerprint);
    } finally {
      await chmod(file, 0o644);
    }
  });

  it("does not depend on changed-file input order", async () => {
    const snapshot = await snapshotRepository(repo);
    const reversed = {
      ...snapshot,
      changedFiles: [...snapshot.changedFiles].reverse(),
    };
    const ordered = await fingerprintDiff(snapshot);
    const shuffled = await fingerprintDiff(reversed);
    expect(shuffled.fingerprint).toBe(ordered.fingerprint);
  });

  it("records a limitation when a changed path disappears mid-run", async () => {
    const snapshot = await snapshotRepository(repo);
    const withGhost = {
      ...snapshot,
      changedFiles: [
        ...snapshot.changedFiles,
        { path: "src/ghost.ts", status: "modified" as const, binary: false },
      ],
    };
    const result = await fingerprintDiff(withGhost);
    expect(result.limitations.some((l) => l.includes("src/ghost.ts"))).toBe(
      true,
    );
  });

  it("does not buffer an oversized changed file", async () => {
    const file = path.join(repo, "src/large.bin");
    await writeFile(file, "");
    await truncate(file, 64 * 1024 * 1024 + 1);
    try {
      const result = await fingerprintDiff(await snapshotRepository(repo));
      expect(
        result.limitations.some((entry) => entry.includes("large.bin")),
      ).toBe(true);
    } finally {
      await rm(file);
    }
  });
});

describe("git_diff evidence record", () => {
  it("validates against evidence.schema.json", async () => {
    const snapshot = await snapshotRepository(repo);
    const diff = await fingerprintDiff(snapshot);
    const evidence = buildGitDiffEvidence(snapshot, diff, {
      id: "ev-git-diff",
      observedAt: "2026-08-28T15:00:00Z",
    });

    const validate = await getValidator("evidence.schema.json");
    expect(validate(evidence)).toBe(true);
    expect(evidence.kind).toBe("git_diff");
    expect(evidence.source.command_fingerprint).toBe(diff.fingerprint);
    expect(evidence.data.added_lines).toBeGreaterThan(0);
    expect(evidence.findings[0]?.paths).toContain("src/a.ts");
  });
});
