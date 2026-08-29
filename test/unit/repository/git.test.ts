import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GitError,
  resolveRepositoryRoot,
  runGit,
  snapshotRepository,
} from "../../../src/repository/git.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
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
  return stdout.trim();
}

async function initRepo(directory: string): Promise<void> {
  await git(directory, ["init", "--initial-branch=main"]);
}

let workspace = "";

beforeAll(async () => {
  workspace = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "test-steward-git-")),
  );
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function freshRepo(name: string): Promise<string> {
  const repo = path.join(workspace, name);
  await mkdir(repo, { recursive: true });
  await initRepo(repo);
  return repo;
}

describe("repository snapshot", () => {
  it("resolves root, head, and modified/untracked/staged files", async () => {
    const repo = await freshRepo("basic");
    await writeFile(path.join(repo, "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(repo, "b.ts"), "export const b = 1;\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "base"]);

    await writeFile(path.join(repo, "a.ts"), "export const a = 2;\n");
    await writeFile(path.join(repo, "untracked.ts"), "export const u = 1;\n");
    await writeFile(path.join(repo, "staged.ts"), "export const s = 1;\n");
    await git(repo, ["add", "staged.ts"]);

    const snapshot = await snapshotRepository(repo);
    expect(snapshot.root).toBe(repo);
    expect(snapshot.headRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.baseRevision).toBe(snapshot.headRevision);
    expect(snapshot.dirty).toBe(true);
    expect(snapshot.gitVersion).toContain("git version");
    expect(snapshot.addedLines).toBeGreaterThan(0);

    const byPath = new Map(
      snapshot.changedFiles.map((file) => [file.path, file]),
    );
    expect(byPath.get("a.ts")?.status).toBe("modified");
    expect(byPath.get("staged.ts")?.status).toBe("added");
    expect(byPath.get("untracked.ts")?.status).toBe("untracked");
    expect([...byPath.keys()]).toEqual([...byPath.keys()].sort());
  });

  it("detects staged renames with the previous path", async () => {
    const repo = await freshRepo("rename");
    await writeFile(
      path.join(repo, "old-name.ts"),
      "export const value = 1;\nexport const other = 2;\n",
    );
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "base"]);
    await git(repo, ["mv", "old-name.ts", "new-name.ts"]);

    const snapshot = await snapshotRepository(repo);
    const renamed = snapshot.changedFiles.find(
      (file) => file.status === "renamed",
    );
    expect(renamed).toMatchObject({
      path: "new-name.ts",
      previousPath: "old-name.ts",
      binary: false,
    });
  });

  it("flags binary changes", async () => {
    const repo = await freshRepo("binary");
    await writeFile(path.join(repo, "blob.bin"), Buffer.from([0, 1, 2, 3]));
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "base"]);
    await writeFile(path.join(repo, "blob.bin"), Buffer.from([0, 9, 9, 9, 0]));

    const snapshot = await snapshotRepository(repo);
    expect(
      snapshot.changedFiles.find((file) => file.path === "blob.bin"),
    ).toMatchObject({ status: "modified", binary: true });
  });

  it("resolves an explicit base to the merge-base and diffs commits since it", async () => {
    const repo = await freshRepo("base");
    await writeFile(path.join(repo, "first.ts"), "export const f = 1;\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "first"]);
    const firstSha = await git(repo, ["rev-parse", "HEAD"]);

    await writeFile(path.join(repo, "second.ts"), "export const s = 1;\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "second"]);

    const snapshot = await snapshotRepository(repo, firstSha);
    expect(snapshot.baseRevision).toBe(firstSha);
    expect(snapshot.headRevision).not.toBe(firstSha);
    expect(snapshot.dirty).toBe(false);
    expect(
      snapshot.changedFiles.find((file) => file.path === "second.ts")?.status,
    ).toBe("added");
  });

  it("reports an unborn repository with null revisions and untracked files", async () => {
    const repo = await freshRepo("unborn");
    await writeFile(path.join(repo, "new.ts"), "export const n = 1;\n");

    const snapshot = await snapshotRepository(repo);
    expect(snapshot.headRevision).toBeNull();
    expect(snapshot.baseRevision).toBeNull();
    expect(snapshot.changedFiles).toEqual([
      { path: "new.ts", status: "untracked", binary: false },
    ]);
    expect(snapshot.dirty).toBe(true);
  });

  it("rejects a directory outside any repository with NOT_A_REPOSITORY", async () => {
    const outside = path.join(workspace, "not-a-repo");
    await mkdir(outside, { recursive: true });
    await expect(resolveRepositoryRoot(outside)).rejects.toMatchObject({
      code: "NOT_A_REPOSITORY",
    });
  });

  it("rejects an unknown --base revision", async () => {
    const repo = await freshRepo("bad-base");
    await writeFile(path.join(repo, "a.ts"), "export const a = 1;\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "base"]);
    await expect(snapshotRepository(repo, "no-such-ref")).rejects.toMatchObject(
      { code: "GIT_FAILED" },
    );
  });
});

describe("git subprocess bounds", () => {
  let fakeBin = "";
  let realPath = "";

  beforeAll(async () => {
    fakeBin = path.join(workspace, "fake-bin");
    await mkdir(fakeBin, { recursive: true });
    realPath = process.env.PATH ?? "";
  });

  afterAll(() => {
    process.env.PATH = realPath;
  });

  async function installFakeGit(script: string): Promise<void> {
    const file = path.join(fakeBin, "git");
    await writeFile(file, `#!/bin/sh\n${script}\n`);
    await chmod(file, 0o755);
    process.env.PATH = `${fakeBin}:${realPath}`;
  }

  it("kills a hung git process group on timeout, descendants included", async () => {
    const pidFile = path.join(workspace, "sleeper.pid");
    await installFakeGit(`sleep 30 &\necho $! > "${pidFile}"\nwait\n`);
    try {
      const started = Date.now();
      await expect(
        runGit(workspace, ["status"], { timeoutMs: 300 }),
      ).rejects.toMatchObject({ code: "GIT_TIMEOUT" });
      expect(Date.now() - started).toBeLessThan(5_000);

      // The descendant sleep must be dead too (TM-016).
      const { readFile } = await import("node:fs/promises");
      const sleeperPid = Number.parseInt(
        (await readFile(pidFile, "utf8")).trim(),
        10,
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
      expect(() => process.kill(sleeperPid, 0)).toThrow();
    } finally {
      process.env.PATH = realPath;
    }
  });

  it("rejects output beyond the configured byte bound", async () => {
    await installFakeGit(
      `i=0\nwhile [ $i -lt 5000 ]; do echo "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; i=$((i+1)); done\n`,
    );
    try {
      await expect(
        runGit(workspace, ["status"], { maxOutputBytes: 2_048 }),
      ).rejects.toMatchObject({ code: "GIT_OUTPUT_TRUNCATED" });
    } finally {
      process.env.PATH = realPath;
    }
  });

  it("reports a missing git executable as GIT_UNAVAILABLE", async () => {
    const emptyBin = path.join(workspace, "empty-bin");
    await mkdir(emptyBin, { recursive: true });
    process.env.PATH = emptyBin;
    try {
      await expect(runGit(workspace, ["--version"])).rejects.toMatchObject({
        code: "GIT_UNAVAILABLE",
      });
    } finally {
      process.env.PATH = realPath;
    }
  });

  it("exposes GitError instances", async () => {
    const outside = path.join(workspace, "git-error-shape");
    await mkdir(outside, { recursive: true });
    const failure = await resolveRepositoryRoot(outside).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(GitError);
  });
});
