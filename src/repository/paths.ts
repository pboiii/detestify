// Canonical repository-contained paths (threat model TM-002/TM-003): every
// repository read resolves symlinks first, verifies the real path stays under
// the repository root, and never touches .git internals. Repository content
// (including path names reported by git) is untrusted data.

import { realpath } from "node:fs/promises";
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
