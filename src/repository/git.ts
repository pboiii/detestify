// Safe Git subprocess layer (threat model TM-002/TM-003/TM-007/TM-015/TM-016):
// every invocation is execFile with a fixed argv array (never a shell), an
// explicit cwd, a timeout, bounded output, and its own process group so
// descendants are terminated with it. Git output — including path names —
// is untrusted repository data.

import { spawn } from "node:child_process";
import path from "node:path";

export class GitError extends Error {
  constructor(
    message: string,
    readonly code:
      | "GIT_UNAVAILABLE"
      | "NOT_A_REPOSITORY"
      | "GIT_TIMEOUT"
      | "GIT_OUTPUT_TRUNCATED"
      | "GIT_FAILED",
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface GitRunOptions {
  /** Milliseconds before the git process group is terminated. */
  readonly timeoutMs?: number;
  /** Maximum stdout/stderr bytes each before the run is rejected. */
  readonly maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** Environment allowlist: PATH plus non-interactive/lock-free Git behavior. */
function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  if (process.env.PATH !== undefined) {
    env.PATH = process.env.PATH;
  }
  if (process.env.HOME !== undefined) {
    env.HOME = process.env.HOME;
  }
  return env;
}

/**
 * Run git with a fixed argv array. `-c core.fsmonitor=false` keeps repository
 * configuration from launching a filesystem-monitor daemon (TM-003).
 */
export async function runGit(
  cwd: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const argv = ["-c", "core.fsmonitor=false", ...args];

  return new Promise((resolve, reject) => {
    // detached puts git in its own process group so the timeout can kill the
    // whole group (descendants included, TM-016) rather than only the child.
    const child = spawn("git", argv, {
      cwd,
      env: gitEnvironment(),
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let timedOut = false;
    let overflow = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const finish = (
      error?: GitError,
      result?: { stdout: string; stderr: string },
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) {
        reject(error);
      } else if (result !== undefined) {
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        overflow = true;
        killProcessGroup(child.pid);
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        overflow = true;
        killProcessGroup(child.pid);
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(new GitError("Git executable not found.", "GIT_UNAVAILABLE"));
      } else {
        finish(
          new GitError(`git failed to start: ${error.message}`, "GIT_FAILED"),
        );
      }
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish(
          new GitError(
            `git ${args[0] ?? ""} exceeded ${timeoutMs} ms; its process group was killed.`,
            "GIT_TIMEOUT",
          ),
        );
        return;
      }
      if (overflow) {
        finish(
          new GitError(
            `git ${args[0] ?? ""} output exceeded ${maxOutputBytes} bytes.`,
            "GIT_OUTPUT_TRUNCATED",
          ),
        );
        return;
      }
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) {
        finish(undefined, { stdout, stderr });
        return;
      }
      finish(
        new GitError(
          `git ${args.join(" ")} failed: ${stderr.trim() || `exit ${code ?? "signal"}`}`,
          "GIT_FAILED",
        ),
      );
    });
  });
}

/** SIGKILL an entire process group, falling back to the single pid. */
function killProcessGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already exited.
    }
  }
}

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "untracked";

export interface ChangedFile {
  /** Repository-relative POSIX path (post-rename path for renames). */
  readonly path: string;
  readonly status: ChangeStatus;
  /** Pre-rename path for renamed/copied entries. */
  readonly previousPath?: string;
  /** True when git diff marks the change binary. */
  readonly binary: boolean;
}

export interface RepositorySnapshot {
  /** Canonical absolute repository root. */
  readonly root: string;
  /** Resolved base revision SHA, or null when no base exists (unborn HEAD). */
  readonly baseRevision: string | null;
  /** Resolved HEAD SHA, or null for an unborn repository. */
  readonly headRevision: string | null;
  /** Committed + staged + unstaged + untracked changes relative to base. */
  readonly changedFiles: readonly ChangedFile[];
  /** Total added lines across the tracked diff (binary files excluded). */
  readonly addedLines: number;
  /** Total deleted lines across the tracked diff (binary files excluded). */
  readonly deletedLines: number;
  /** Whether the worktree has uncommitted changes (staged, unstaged, untracked). */
  readonly dirty: boolean;
  /** Git version string, or null when unavailable. */
  readonly gitVersion: string | null;
}

/** Resolve the canonical repository root for a directory, or throw. */
export async function resolveRepositoryRoot(
  start: string,
  options: GitRunOptions = {},
): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await runGit(
      start,
      ["rev-parse", "--show-toplevel"],
      options,
    ));
  } catch (error) {
    if (error instanceof GitError && error.code === "GIT_FAILED") {
      throw new GitError(
        `No Git repository contains ${path.resolve(start)}.`,
        "NOT_A_REPOSITORY",
      );
    }
    throw error;
  }
  const top = stdout.trim();
  if (top === "") {
    throw new GitError(
      `No Git repository contains ${path.resolve(start)}.`,
      "NOT_A_REPOSITORY",
    );
  }
  return top;
}

export async function gitVersion(
  cwd: string,
  options: GitRunOptions = {},
): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, ["--version"], options);
    const trimmed = stdout.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

async function revParse(
  root: string,
  ref: string,
  options: GitRunOptions,
): Promise<string | null> {
  try {
    const { stdout } = await runGit(
      root,
      ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      options,
    );
    const sha = stdout.trim();
    return sha === "" ? null : sha;
  } catch {
    return null;
  }
}

/**
 * Resolve the base revision: an explicit `--base` ref (merge-base with HEAD
 * when possible, else the ref itself), otherwise HEAD.
 */
export async function resolveBaseRevision(
  root: string,
  head: string | null,
  requestedBase: string | undefined,
  options: GitRunOptions = {},
): Promise<string | null> {
  if (requestedBase === undefined) {
    return head;
  }
  const base = await revParse(root, requestedBase, options);
  if (base === null) {
    throw new GitError(
      `Base revision not found: ${requestedBase}`,
      "GIT_FAILED",
    );
  }
  if (head === null) {
    return base;
  }
  try {
    const { stdout } = await runGit(root, ["merge-base", base, head], options);
    const mergeBase = stdout.trim();
    return mergeBase === "" ? base : mergeBase;
  } catch {
    // Disjoint histories: fall back to the requested base itself.
    return base;
  }
}

const STATUS_BY_LETTER: Record<string, ChangeStatus> = {
  A: "added",
  M: "modified",
  D: "deleted",
  T: "type-changed",
};

function parseNameStatusZ(output: string): ChangedFile[] {
  // -z format: STATUS\0path\0 (renames/copies: STATUS\0old\0new\0).
  const fields = output.split("\0").filter((field) => field !== "");
  const files: ChangedFile[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index];
    if (status === undefined) {
      break;
    }
    const letter = status[0] ?? "";
    if (letter === "R" || letter === "C") {
      const previousPath = fields[index + 1];
      const newPath = fields[index + 2];
      if (previousPath !== undefined && newPath !== undefined) {
        files.push({
          path: newPath,
          previousPath,
          status: letter === "R" ? "renamed" : "copied",
          binary: false,
        });
      }
      index += 3;
      continue;
    }
    const filePath = fields[index + 1];
    if (filePath !== undefined) {
      files.push({
        path: filePath,
        status: STATUS_BY_LETTER[letter] ?? "modified",
        binary: false,
      });
    }
    index += 2;
  }
  return files;
}

interface NumstatSummary {
  /** Paths whose diff git marks binary ("-" counts). */
  readonly binaryPaths: ReadonlySet<string>;
  readonly addedLines: number;
  readonly deletedLines: number;
}

/**
 * Parse `git diff --numstat -z -M`. Ordinary entries are
 * `added\tdeleted\tpath`; renamed/copied entries have an empty path field
 * followed by two extra NUL fields (old path, new path).
 */
function parseNumstatZ(output: string): NumstatSummary {
  const records = output.split("\0");
  const binaryPaths = new Set<string>();
  let addedLines = 0;
  let deletedLines = 0;
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    if (record === undefined || record === "") {
      index += 1;
      continue;
    }
    const [added, deleted, filePath] = record.split("\t");
    if (added === undefined || deleted === undefined) {
      index += 1;
      continue;
    }
    let effectivePath = filePath ?? "";
    if (effectivePath === "") {
      // Rename/copy shape: the next two records are old and new path.
      const newPath = records[index + 2];
      effectivePath = newPath ?? "";
      index += 3;
    } else {
      index += 1;
    }
    if (added === "-" && deleted === "-") {
      if (effectivePath !== "") {
        binaryPaths.add(effectivePath);
      }
      continue;
    }
    const addedCount = Number.parseInt(added, 10);
    const deletedCount = Number.parseInt(deleted, 10);
    if (Number.isFinite(addedCount)) {
      addedLines += addedCount;
    }
    if (Number.isFinite(deletedCount)) {
      deletedLines += deletedCount;
    }
  }
  return { binaryPaths, addedLines, deletedLines };
}

async function untrackedFiles(
  root: string,
  options: GitRunOptions,
): Promise<string[]> {
  const { stdout } = await runGit(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    options,
  );
  return stdout.split("\0").filter((file) => file !== "");
}

/**
 * Snapshot the repository: root, base/head revisions, and every changed file
 * (committed-relative-to-base, staged, unstaged, untracked) with rename and
 * binary information. Read-only; never executes repository code.
 */
export async function snapshotRepository(
  start: string,
  requestedBase?: string,
  options: GitRunOptions = {},
): Promise<RepositorySnapshot> {
  const root = await resolveRepositoryRoot(start, options);
  const version = await gitVersion(root, options);
  const head = await revParse(root, "HEAD", options);
  const base = await resolveBaseRevision(root, head, requestedBase, options);

  const byPath = new Map<string, ChangedFile>();
  let addedLines = 0;
  let deletedLines = 0;
  if (base !== null) {
    // One diff from base to the worktree covers committed-since-base, staged,
    // and unstaged changes; -M detects renames; -z keeps paths unescaped.
    const { stdout: nameStatus } = await runGit(
      root,
      ["diff", "--name-status", "-z", "-M", base],
      options,
    );
    const { stdout: numstat } = await runGit(
      root,
      ["diff", "--numstat", "-z", "-M", base],
      options,
    );
    const summary = parseNumstatZ(numstat);
    addedLines = summary.addedLines;
    deletedLines = summary.deletedLines;
    for (const file of parseNameStatusZ(nameStatus)) {
      byPath.set(file.path, {
        ...file,
        binary: summary.binaryPaths.has(file.path),
      });
    }
  }

  for (const file of await untrackedFiles(root, options)) {
    if (!byPath.has(file)) {
      byPath.set(file, { path: file, status: "untracked", binary: false });
    }
  }

  const { stdout: porcelain } = await runGit(
    root,
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    options,
  );
  const dirty = porcelain.split("\0").some((entry) => entry !== "");

  const changedFiles = [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  return {
    root,
    baseRevision: base,
    headRevision: head,
    changedFiles,
    addedLines,
    deletedLines,
    dirty,
    gitVersion: version,
  };
}
