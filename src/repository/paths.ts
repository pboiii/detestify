// Canonical repository-contained paths (threat model TM-002/TM-003): every
// repository read resolves symlinks first, verifies the real path stays under
// the repository root, and never touches .git internals. Repository content
// (including path names reported by git) is untrusted data.

import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import path from "node:path";

export class PathContainmentError extends Error {
  readonly code = "PATH_NOT_CONTAINED";

  constructor(message: string) {
    super(message);
    this.name = "PathContainmentError";
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function isGitInternal(relativePosix: string): boolean {
  return (
    relativePosix === ".git" ||
    relativePosix.startsWith(".git/") ||
    relativePosix.endsWith("/.git") ||
    relativePosix.includes("/.git/")
  );
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function canonicalTarget(target: string): Promise<string> {
  let current = path.resolve(target);
  const remainder: string[] = [];
  while (true) {
    try {
      return path.join(await realpath(current), ...remainder.reverse());
    } catch (error) {
      if (!isMissing(error)) throw error;
      try {
        if ((await lstat(current)).isSymbolicLink()) {
          current = path.resolve(
            path.dirname(current),
            await readlink(current),
          );
          continue;
        }
      } catch (statError) {
        if (!isMissing(statError)) throw statError;
      }
      const parent = path.dirname(current);
      if (parent === current) throw error;
      remainder.push(path.basename(current));
      current = parent;
    }
  }
}

/** Check a possibly nonexistent mutation target against the real repository root. */
export async function isRepositoryMutationTargetContained(
  repositoryRoot: string,
  cwd: string,
  requested: string,
): Promise<boolean> {
  try {
    const lexicalRoot = path.resolve(repositoryRoot);
    const lexicalTarget = path.resolve(cwd, requested);
    if (!isWithin(lexicalRoot, lexicalTarget)) return false;
    return isWithin(
      await realpath(lexicalRoot),
      await canonicalTarget(lexicalTarget),
    );
  } catch {
    return false;
  }
}

/**
 * Lexically normalize a repository-relative path. Throws when the path is
 * absolute, empty, escapes the repository root, or names a .git internal.
 * Symlink resolution is `realpathContained`'s responsibility.
 */
export function normalizeRepositoryPath(requested: string): string {
  if (requested === "" || path.isAbsolute(requested)) {
    throw new PathContainmentError(
      `Path is not repository-relative: ${requested}`,
    );
  }
  const normalized = path.posix.normalize(toPosix(requested));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new PathContainmentError(
      `Path escapes the repository root: ${requested}`,
    );
  }
  if (isGitInternal(normalized)) {
    throw new PathContainmentError(
      `Git internal paths are not readable: ${requested}`,
    );
  }
  return normalized;
}

/**
 * Resolve a repository-relative path to its real absolute path and enforce
 * containment under the repository root after full symlink resolution
 * (TM-002). The target must exist.
 */
export async function realpathContained(
  repositoryRoot: string,
  requested: string,
): Promise<string> {
  const relative = normalizeRepositoryPath(requested);
  const root = await realpath(repositoryRoot);
  const resolved = await realpath(path.join(root, relative));
  const resolvedRelative = path.relative(root, resolved);
  if (
    resolvedRelative === "" ||
    resolvedRelative === ".." ||
    resolvedRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(resolvedRelative)
  ) {
    throw new PathContainmentError(
      `Path escapes the repository root after symlink resolution: ${requested}`,
    );
  }
  if (isGitInternal(toPosix(resolvedRelative))) {
    throw new PathContainmentError(
      `Git internal paths are not readable: ${requested}`,
    );
  }
  return resolved;
}

/** Read one contained regular file without ever buffering past `maxBytes`. */
export async function readContainedRegularFile(
  repositoryRoot: string,
  requested: string,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError(`Invalid repository file size limit: ${maxBytes}`);
  }
  const resolved = await realpathContained(repositoryRoot, requested);
  const file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) {
      throw new PathContainmentError(
        `Path is not a regular file: ${requested}`,
      );
    }
    if (stat.size > maxBytes) {
      throw new PathContainmentError(
        `Path exceeds the ${maxBytes}-byte read limit: ${requested}`,
      );
    }

    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maxBytes + 1 - total),
      );
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        return Buffer.concat(chunks, total);
      }
      total += bytesRead;
      if (total > maxBytes) {
        throw new PathContainmentError(
          `Path exceeds the ${maxBytes}-byte read limit: ${requested}`,
        );
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    throw new PathContainmentError(
      `Path exceeds the ${maxBytes}-byte read limit: ${requested}`,
    );
  } finally {
    await file.close();
  }
}
