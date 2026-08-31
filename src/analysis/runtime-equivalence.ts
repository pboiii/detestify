import { stripTypeScriptTypes } from "node:module";
import { isTestFilePath } from "./test-path.js";
import {
  runGit,
  type GitRunOptions,
  type RepositorySnapshot,
} from "../repository/git.js";
import { readContainedRegularFile } from "../repository/paths.js";

const SOURCE_FILE_SIZE_LIMIT = 8 * 1024 * 1024;

export type RuntimeEmitComparator = (
  before: string,
  after: string,
  fileName: string,
) => boolean;

/** Native, dependency-free runtime comparison for Stop hooks on Node 22.13+. */
export function hasEquivalentNativeRuntimeEmit(
  before: string,
  after: string,
): boolean {
  const emitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args): void {
    const type = typeof args[0] === "object" ? args[0]?.type : args[0];
    if (
      type === "ExperimentalWarning" &&
      String(warning).includes("stripTypeScriptTypes")
    ) {
      return;
    }
    Reflect.apply(emitWarning, process, [warning, ...args]);
  };
  try {
    const options = { mode: "transform", sourceMap: false } as const;
    return (
      stripTypeScriptTypes(before, options) ===
      stripTypeScriptTypes(after, options)
    );
  } catch {
    return false;
  } finally {
    process.emitWarning = emitWarning;
  }
}

/** Compare modified TypeScript files with their base revision, failing closed. */
export async function runtimeEquivalentTypeScriptPaths(
  snapshot: RepositorySnapshot,
  equivalent: RuntimeEmitComparator,
  gitOptions: GitRunOptions = {},
): Promise<string[]> {
  if (snapshot.baseRevision === null) return [];
  const candidates = snapshot.changedFiles.filter(
    (file) =>
      file.status === "modified" &&
      /\.(?:ts|tsx|mts|cts)$/.test(file.path) &&
      !/\.d\.(?:ts|mts|cts)$/.test(file.path) &&
      !isTestFilePath(file.path),
  );
  const result: string[] = [];
  for (const file of candidates) {
    try {
      const [{ stdout: before }, after] = await Promise.all([
        runGit(
          snapshot.root,
          ["show", `${snapshot.baseRevision}:${file.path}`],
          gitOptions,
        ),
        readContainedRegularFile(
          snapshot.root,
          file.path,
          SOURCE_FILE_SIZE_LIMIT,
        ),
      ]);
      if (equivalent(before, after.toString("utf8"), file.path)) {
        result.push(file.path);
      }
    } catch {
      // Unreadable, unsupported, or ambiguous files fail closed.
    }
  }
  return result.sort();
}
