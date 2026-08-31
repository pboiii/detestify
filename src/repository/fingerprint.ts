// Stable diff fingerprint (threat model TM-015): reports and receipts bind to
// base/head revisions plus a digest of every changed path and its current
// worktree content. Two runs over an unchanged tree produce the same value;
// any TOCTOU mutation of a changed file changes the fingerprint.

import { createHash } from "node:crypto";
import { lstat, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import type { ChangedFile, RepositorySnapshot } from "./git.js";
import {
  normalizeRepositoryPath,
  PathContainmentError,
  readContainedRegularFile,
  realpathContained,
} from "./paths.js";

export interface DiffFingerprint {
  /** `sha256:<hex>` digest for report `repository.diff_fingerprint`. */
  readonly fingerprint: string;
  /** Paths whose content could not be hashed (with the reason). */
  readonly limitations: readonly string[];
}

const FINGERPRINT_FILE_SIZE_LIMIT = 64 * 1024 * 1024;

async function contentDigest(
  root: string,
  file: ChangedFile,
): Promise<{ digest: string; limitation?: string }> {
  if (file.status === "deleted") {
    return { digest: "deleted" };
  }
  let relative: string;
  let entry: string;
  try {
    relative = normalizeRepositoryPath(file.path);
    const realRoot = await realpath(root);
    const parentRelative = path.posix.dirname(relative);
    const parent =
      parentRelative === "."
        ? realRoot
        : await realpathContained(realRoot, parentRelative);
    entry = path.join(parent, path.posix.basename(relative));
  } catch (error) {
    if (error instanceof PathContainmentError) {
      return {
        digest: "uncontained",
        limitation: `Changed path ${file.path} was excluded from content hashing: ${error.message}`,
      };
    }
    // realpath ENOENT: the file disappeared between diff and hashing.
    return {
      digest: "unreadable",
      limitation: `Changed path ${file.path} could not be resolved for hashing.`,
    };
  }

  try {
    const stat = await lstat(entry);
    if (stat.isSymbolicLink()) {
      const target = await readlink(entry);
      return {
        digest: createHash("sha256")
          .update("symlink\u0000")
          .update(String(stat.mode))
          .update("\u0000")
          .update(target)
          .digest("hex"),
      };
    }
    if (!stat.isFile()) {
      return {
        digest: createHash("sha256")
          .update("non-regular\u0000")
          .update(String(stat.mode))
          .digest("hex"),
        limitation: `Changed path ${file.path} is not a regular file or symbolic link; only its type and mode were hashed.`,
      };
    }

    const content = await readContainedRegularFile(
      root,
      relative,
      FINGERPRINT_FILE_SIZE_LIMIT,
    );
    return {
      digest: createHash("sha256")
        .update("regular\u0000")
        .update(
          (stat.mode & 0o111) === 0
            ? "non-executable\u0000"
            : "executable\u0000",
        )
        .update(content)
        .digest("hex"),
    };
  } catch {
    return {
      digest: "unreadable",
      limitation: `Changed path ${file.path} could not be read for hashing.`,
    };
  }
}

/**
 * Compute the stable fingerprint of a repository snapshot. Input order does
 * not matter: entries are canonicalized and sorted before hashing.
 */
export async function fingerprintDiff(
  snapshot: RepositorySnapshot,
): Promise<DiffFingerprint> {
  const limitations: string[] = [];
  const entries: string[] = [];

  const sorted = [...snapshot.changedFiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  for (const file of sorted) {
    const { digest, limitation } = await contentDigest(snapshot.root, file);
    if (limitation !== undefined) {
      limitations.push(limitation);
    }
    entries.push(
      [file.path, file.status, file.previousPath ?? "", digest].join("\u0001"),
    );
  }

  const hash = createHash("sha256");
  hash.update(snapshot.baseRevision ?? "no-base");
  hash.update("\u0000");
  hash.update(snapshot.headRevision ?? "no-head");
  for (const entry of entries) {
    hash.update("\u0000");
    hash.update(entry);
  }

  return {
    fingerprint: `sha256:${hash.digest("hex")}`,
    limitations,
  };
}

/** One finding of a `git_diff` evidence record (evidence.schema.json). */
export interface GitDiffEvidenceFinding {
  readonly code: string;
  readonly summary: string;
  readonly paths: readonly string[];
}

/** A `git_diff` evidence record shaped for evidence.schema.json. */
export interface GitDiffEvidence {
  readonly schema_version: "1.0";
  readonly id: string;
  readonly kind: "git_diff";
  readonly status: "observed";
  readonly source: {
    readonly tool: "git";
    readonly version: string | null;
    readonly path: null;
    readonly command_fingerprint: string;
    readonly observed_at: string;
  };
  readonly findings: readonly GitDiffEvidenceFinding[];
  readonly data: {
    readonly added_lines: number;
    readonly deleted_lines: number;
    readonly binary_files: number;
  };
  readonly gate_trust: "eligible";
  readonly limitations: readonly string[];
}

/**
 * Build the `git_diff` evidence record for a snapshot (see
 * spec/schemas/examples/evidence-git-diff.json). The command fingerprint is
 * the diff fingerprint, binding the evidence to the analyzed tree (TM-015).
 */
export function buildGitDiffEvidence(
  snapshot: RepositorySnapshot,
  diff: DiffFingerprint,
  options: { readonly id: string; readonly observedAt: string },
): GitDiffEvidence {
  const changedPaths = snapshot.changedFiles.map((file) => file.path);
  const findings: GitDiffEvidenceFinding[] =
    changedPaths.length === 0
      ? [
          {
            code: "NO_CHANGED_PATHS",
            summary: "The diff contains no changed paths.",
            paths: [],
          },
        ]
      : [
          {
            code: "CHANGED_PATHS",
            summary: `The diff changes ${changedPaths.length} path${
              changedPaths.length === 1 ? "" : "s"
            }.`,
            paths: changedPaths,
          },
        ];
  return {
    schema_version: "1.0",
    id: options.id,
    kind: "git_diff",
    status: "observed",
    source: {
      tool: "git",
      version: snapshot.gitVersion,
      path: null,
      command_fingerprint: diff.fingerprint,
      observed_at: options.observedAt,
    },
    findings,
    data: {
      added_lines: snapshot.addedLines,
      deleted_lines: snapshot.deletedLines,
      binary_files: snapshot.changedFiles.filter((file) => file.binary).length,
    },
    gate_trust: "eligible",
    limitations: diff.limitations,
  };
}
