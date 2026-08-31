import { access, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  normalizeRepositoryPath,
  realpathContained,
} from "../../repository/paths.js";

export type SupportedRunner = "vitest" | "jest" | "node:test";

export const RUNNER_ENTRIES = {
  vitest: "node_modules/vitest/vitest.mjs",
  jest: "node_modules/jest/bin/jest.js",
} as const;

export interface RunnerExecution {
  readonly executionRoot: string;
  readonly entry: string;
  readonly loader: "tsx" | null;
  /** Repository-relative paths retained in receipts. */
  readonly repositoryTestFiles: readonly string[];
  /** Paths relative to executionRoot, passed to the runner. */
  readonly executionTestFiles: readonly string[];
}

export class RunnerUnavailableError extends Error {
  constructor(
    readonly runner: SupportedRunner,
    message: string,
    readonly reason: "unavailable" | "unsupported" = "unavailable",
  ) {
    super(message);
    this.name = "RunnerUnavailableError";
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function localRunnerRoot(
  repositoryRoot: string,
  testFile: string,
  runner: SupportedRunner,
): Promise<string | null> {
  let directory = path.posix.dirname(testFile);
  while (true) {
    const manifest =
      directory === "." ? "package.json" : `${directory}/package.json`;
    try {
      const resolvedManifest = await realpathContained(
        repositoryRoot,
        manifest,
      );
      if ((await lstat(resolvedManifest)).isFile()) {
        const candidateRoot = path.join(repositoryRoot, directory);
        if (runner !== "node:test") {
          await access(path.join(candidateRoot, RUNNER_ENTRIES[runner]));
        }
        return realpath(candidateRoot);
      }
    } catch {
      // This package does not have the selected runner installed; try its parent.
    }
    if (directory === ".") {
      return null;
    }
    directory = path.posix.dirname(directory);
  }
}

const TYPESCRIPT_TEST_PATTERN = /\.(ts|tsx|mts|cts)$/;

async function resolveNodeTestLoader(
  repositoryRoot: string,
  executionRoot: string,
  testFiles: readonly string[],
): Promise<"tsx" | null> {
  if (!testFiles.some((file) => TYPESCRIPT_TEST_PATTERN.test(file))) {
    return null;
  }

  const manifestPath = path.join(executionRoot, "package.json");
  let declaresTsx = false;
  try {
    const document: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (document !== null && typeof document === "object") {
      const manifest = document as Record<string, unknown>;
      const dependencies = [manifest.dependencies, manifest.devDependencies];
      declaresTsx = dependencies.some(
        (value) =>
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof (value as Record<string, unknown>).tsx === "string",
      );
    }
  } catch {
    throw new RunnerUnavailableError(
      "node:test",
      "The package containing the selected TypeScript tests does not have a readable inert package.json; loader selection is unsupported.",
      "unsupported",
    );
  }
  if (!declaresTsx) {
    throw new RunnerUnavailableError(
      "node:test",
      "Selected TypeScript node:test files require a package-local declared tsx loader; native type stripping is not used as evidence.",
      "unsupported",
    );
  }
  try {
    const relativeLoader = normalizeRepositoryPath(
      path.relative(
        repositoryRoot,
        path.join(executionRoot, "node_modules/tsx/package.json"),
      ),
    );
    const loaderManifest = await realpathContained(
      repositoryRoot,
      relativeLoader,
    );
    if (!(await lstat(loaderManifest)).isFile()) throw new Error("not a file");
  } catch {
    throw new RunnerUnavailableError(
      "node:test",
      "The package declares tsx, but its package-local installation is unavailable.",
    );
  }
  return "tsx";
}

/** Resolve one honest package-local execution root for every selected test. */
export async function resolveRunnerExecution(
  repoRoot: string,
  runner: SupportedRunner,
  testFiles: readonly string[],
): Promise<RunnerExecution> {
  const repositoryRoot = await realpath(repoRoot);
  const repositoryTestFiles: string[] = [];
  const roots = new Set<string>();

  for (const requested of testFiles) {
    let testFile: string;
    try {
      testFile = normalizeRepositoryPath(requested);
      await realpathContained(repositoryRoot, testFile);
    } catch {
      throw new RunnerUnavailableError(
        runner,
        "A selected test path is not repository-contained; workspace-local execution is unsupported.",
        "unsupported",
      );
    }
    const executionRoot = await localRunnerRoot(
      repositoryRoot,
      testFile,
      runner,
    );
    if (executionRoot === null) {
      throw new RunnerUnavailableError(
        runner,
        `${runner === "vitest" ? "Vitest" : runner === "jest" ? "Jest" : "node:test"} is not available in a containing package for every selected test file; workspace-local execution evidence is unavailable.`,
      );
    }
    repositoryTestFiles.push(testFile);
    roots.add(executionRoot);
  }

  if (roots.size !== 1) {
    throw new RunnerUnavailableError(
      runner,
      `Selected tests map to ${roots.size === 0 ? "no" : "multiple"} workspace-local ${runner === "vitest" ? "Vitest" : runner === "jest" ? "Jest" : "node:test"} execution roots; focused execution is unsupported.`,
      "unsupported",
    );
  }

  const executionRoot = [...roots][0]!;
  const executionTestFiles = repositoryTestFiles.map((testFile) =>
    toPosix(path.relative(executionRoot, path.join(repositoryRoot, testFile))),
  );
  const loader =
    runner === "node:test"
      ? await resolveNodeTestLoader(
          repositoryRoot,
          executionRoot,
          executionTestFiles,
        )
      : null;
  return {
    executionRoot,
    entry:
      runner === "node:test"
        ? process.execPath
        : path.join(executionRoot, RUNNER_ENTRIES[runner]),
    loader,
    repositoryTestFiles,
    executionTestFiles,
  };
}
