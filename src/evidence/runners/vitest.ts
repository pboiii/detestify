// Vitest runner adapter: fixed-argv invocation of the repository's installed
// Vitest entry through the trusted Node executable. Never a shell, never an
// npm script (TM-003/TM-009). Focused selection passes the affected test
// files as positional arguments to `vitest run`; structured results come from
// the JSON reporter written to a scratch file outside the repository.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readContainedRegularFile } from "../../repository/paths.js";
import {
  parseSelectedJestFormatResults,
  runFixedArgv,
  runnerEnvironment,
  type ProcessOutcome,
  type RunnerResults,
} from "./process.js";
import { resolveRunnerExecution, RunnerUnavailableError } from "./workspace.js";
export { resolveRunnerExecution, RunnerUnavailableError } from "./workspace.js";

const RESULT_FILE_MAX_BYTES = 8 * 1024 * 1024;

export interface RunnerInvocation {
  readonly runner: "vitest" | "jest" | "node:test";
  /** Runner package version read inertly from its package.json, or null. */
  readonly version: string | null;
  /** Full argv: [node, entry, ...fixed args, ...test files]. */
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly testFiles: readonly string[];
  readonly outcome: ProcessOutcome;
  readonly results: RunnerResults | null;
  /** Whether structured results reported exactly every selected file. */
  readonly selectedFilesCovered?: boolean | null;
}

export interface RunnerRunOptions {
  readonly repoRoot: string;
  readonly testFiles: readonly string[];
  readonly timeoutMs: number;
}

/** Read the installed runner package version inertly. */
export async function readRunnerVersion(
  repoRoot: string,
  packageName: "vitest" | "jest",
): Promise<string | null> {
  try {
    const manifest = path.join(
      repoRoot,
      "node_modules",
      packageName,
      "package.json",
    );
    const document: unknown = JSON.parse(await readFile(manifest, "utf8"));
    const version = (document as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** Fixed Vitest argv: `run` mode, JSON reporter to a file, focused files. */
export function buildVitestArgs(
  entry: string,
  testFiles: readonly string[],
  outputFile: string,
): string[] {
  return [
    entry,
    "run",
    "--reporter=json",
    `--outputFile=${outputFile}`,
    "--no-coverage",
    ...testFiles,
  ];
}

async function readResults(
  scratch: string,
  outcome: ProcessOutcome,
  executionRoot: string,
  selectedTestFiles: readonly string[],
): Promise<{
  results: RunnerResults | null;
  selectedFilesCovered: boolean | null;
}> {
  try {
    const document = await readContainedRegularFile(
      scratch,
      "results.json",
      RESULT_FILE_MAX_BYTES,
    );
    const parsed = parseSelectedJestFormatResults(
      document.toString("utf8"),
      executionRoot,
      selectedTestFiles,
    );
    return {
      results: parsed?.results ?? null,
      selectedFilesCovered: parsed?.selectedFilesCovered ?? null,
    };
  } catch {
    // Fall back to stdout: some failures still print the JSON document.
    const parsed = parseSelectedJestFormatResults(
      outcome.stdout.trim(),
      executionRoot,
      selectedTestFiles,
    );
    return {
      results: parsed?.results ?? null,
      selectedFilesCovered: parsed?.selectedFilesCovered ?? null,
    };
  }
}

/** Run the repository's Vitest on exactly the given test files. */
export async function runVitest(
  options: RunnerRunOptions,
): Promise<RunnerInvocation> {
  const execution = await resolveRunnerExecution(
    options.repoRoot,
    "vitest",
    options.testFiles,
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "test-steward-vitest-"));
  const outputFile = path.join(scratch, "results.json");
  const args = buildVitestArgs(
    execution.entry,
    execution.executionTestFiles,
    outputFile,
  );
  try {
    const outcome = await runFixedArgv({
      file: process.execPath,
      args,
      cwd: execution.executionRoot,
      env: runnerEnvironment(),
      timeoutMs: options.timeoutMs,
    });
    const parsed = outcome.timedOut
      ? { results: null, selectedFilesCovered: null }
      : await readResults(
          scratch,
          outcome,
          execution.executionRoot,
          execution.executionTestFiles,
        );
    return {
      runner: "vitest",
      version: await readRunnerVersion(execution.executionRoot, "vitest"),
      argv: [process.execPath, ...args],
      cwd: execution.executionRoot,
      testFiles: execution.repositoryTestFiles,
      outcome,
      results: parsed.results,
      selectedFilesCovered: parsed.selectedFilesCovered,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}
