// Path containment and inert-config security tests for the repository layer
// (threat model TM-002 symlink/traversal, TM-003 config injection).

import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PathContainmentError,
  normalizeRepositoryPath,
  realpathContained,
} from "../../src/repository/paths.js";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
} from "../../src/repository/discovery.js";
import { snapshotRepository } from "../../src/repository/git.js";
import { fingerprintDiff } from "../../src/repository/fingerprint.js";
import { analyzeTypeScript } from "../../src/analysis/typescript.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let workspace = "";
let repoRoot = "";
let outsideDir = "";

beforeAll(async () => {
  workspace = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "test-steward-security-")),
  );
  repoRoot = path.join(workspace, "repo");
  outsideDir = path.join(workspace, "outside");
  await mkdir(path.join(repoRoot, "src"), { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(path.join(outsideDir, "secret.txt"), "top secret\n");
  await writeFile(
    path.join(repoRoot, "src/inside.ts"),
    "export const i = 1;\n",
  );
  await symlink(
    path.join(outsideDir, "secret.txt"),
    path.join(repoRoot, "escape-file"),
  );
  await symlink(outsideDir, path.join(repoRoot, "escape-dir"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("lexical path containment", () => {
  it("rejects absolute paths", () => {
    expect(() => normalizeRepositoryPath("/etc/passwd")).toThrow(
      PathContainmentError,
    );
  });

  it("rejects traversal escapes", () => {
    expect(() => normalizeRepositoryPath("../outside/secret.txt")).toThrow(
      PathContainmentError,
    );
    expect(() => normalizeRepositoryPath("src/../../outside")).toThrow(
      PathContainmentError,
    );
    expect(() => normalizeRepositoryPath("..")).toThrow(PathContainmentError);
  });

  it("rejects .git internals", () => {
    expect(() => normalizeRepositoryPath(".git/config")).toThrow(
      PathContainmentError,
    );
    expect(() => normalizeRepositoryPath("sub/.git/hooks/pre-commit")).toThrow(
      PathContainmentError,
    );
  });

  it("normalizes contained paths to POSIX form", () => {
    expect(normalizeRepositoryPath("src/./inside.ts")).toBe("src/inside.ts");
  });
});

describe("symlink containment", () => {
  it("resolves a contained file to its real path", async () => {
    const resolved = await realpathContained(repoRoot, "src/inside.ts");
    expect(resolved).toBe(path.join(repoRoot, "src/inside.ts"));
  });

  it("rejects a symlinked file that escapes the root", async () => {
    await expect(
      realpathContained(repoRoot, "escape-file"),
    ).rejects.toBeInstanceOf(PathContainmentError);
  });

  it("rejects a path through a symlinked directory that escapes the root", async () => {
    await expect(
      realpathContained(repoRoot, "escape-dir/secret.txt"),
    ).rejects.toBeInstanceOf(PathContainmentError);
  });
});

describe("inert discovery security", () => {
  it("does not follow symlinked directories out of the worktree walk", async () => {
    const files = await listRepositoryFiles(repoRoot);
    expect(files).toEqual(["src/inside.ts"]);
  });

  it("treats executable runner config as unreadable and never evaluates it", async () => {
    const configRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-config-"),
    );
    try {
      const canary = path.join(configRoot, "executed-canary");
      await writeFile(
        path.join(configRoot, "vitest.config.ts"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(canary)}, "executed");\n`,
      );
      const shape = await discoverRepositoryShape(configRoot, [
        "vitest.config.ts",
      ]);
      expect(shape.limitations.some((l) => l.includes("executable"))).toBe(
        true,
      );
      const { access } = await import("node:fs/promises");
      await expect(access(canary)).rejects.toThrow();
    } finally {
      await rm(configRoot, { recursive: true, force: true });
    }
  });

  it("parses a package.json with hostile script bodies without running them", async () => {
    const hostileRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-hostile-"),
    );
    try {
      const canary = path.join(hostileRoot, "script-canary");
      await writeFile(
        path.join(hostileRoot, "package.json"),
        JSON.stringify({
          name: "hostile",
          scripts: {
            preinstall: `touch ${canary}`,
            test: `touch ${canary}`,
          },
        }),
      );
      const shape = await discoverRepositoryShape(hostileRoot, [
        "package.json",
      ]);
      expect(shape.manifests[0]?.scriptNames).toEqual(["preinstall", "test"]);
      const { access } = await import("node:fs/promises");
      await expect(access(canary)).rejects.toThrow();
    } finally {
      await rm(hostileRoot, { recursive: true, force: true });
    }
  });
});

describe("fingerprint symlink containment", () => {
  it("excludes an escaping symlink from content hashing with a limitation", async () => {
    const gitRoot = await mkdtemp(
      path.join(os.tmpdir(), "test-steward-fp-escape-"),
    );
    try {
      const real = await realpath(gitRoot);
      const secret = path.join(workspace, "outside", "secret.txt");
      await execFileAsync("git", ["init", "--initial-branch=main"], {
        cwd: real,
      });
      await symlink(secret, path.join(real, "leak"));
      const snapshot = await snapshotRepository(real);
      expect(
        snapshot.changedFiles.find((file) => file.path === "leak")?.status,
      ).toBe("untracked");
      const diff = await fingerprintDiff(snapshot);
      expect(diff.limitations.some((l) => l.includes("leak"))).toBe(true);
    } finally {
      await rm(gitRoot, { recursive: true, force: true });
    }
  });
});

describe("analyzer symlink containment (TM-002/TM-005)", () => {
  it("does not read an escaping symlink source into AST facts", async () => {
    // escape-file (a repo entry) is a symlink to outside/secret.txt, which
    // contains an export. The analyzer must refuse to follow it out of the
    // repo, so no external symbol name reaches the analysis output.
    const leaked = path.join(repoRoot, "escape-source.ts");
    await symlink(path.join(outsideDir, "leaked-source.ts"), leaked);
    await writeFile(
      path.join(outsideDir, "leaked-source.ts"),
      "export const EXFILTRATED = 1;\n",
    );
    try {
      const analysis = await analyzeTypeScript({
        repoRoot,
        files: ["escape-source.ts", "src/inside.ts"],
      });
      const names = analysis.files.flatMap((file) =>
        file.exports.map((entry) => entry.name),
      );
      expect(names).not.toContain("EXFILTRATED");
      // The contained sibling source is still analyzed normally.
      expect(names).toContain("i");
    } finally {
      await rm(leaked, { force: true });
    }
  });
});
