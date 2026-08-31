// Jest runner adapter: fixed-argv invocation of the repository's installed
// Jest CLI entry through the trusted Node executable. Never a shell, never an
// npm script (TM-003/TM-009). Focused selection uses `--runTestsByPath` with
// the affected files; structured results come from `--json --outputFile`.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readContainedRegularFile } from "../../repository/paths.js";
import {
  parseSelectedJestFormatResults,
  runFixedArgv,
  runnerEnvironment,
  type RunnerResults,
} from "./process.js";
import {
  readRunnerVersion,
  type RunnerInvocation,
  type RunnerRunOptions,
} from "./vitest.js";
import { resolveRunnerExecution } from "./workspace.js";

const RESULT_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** Fixed Jest argv: CI mode, JSON results to a file, exact focused paths. */
export function buildJestArgs(
  entry: string,
  testFiles: readonly string[],
  outputFile: string,
): string[] {
  return [
    entry,
    "--ci",
    "--json",
    `--outputFile=${outputFile}`,
    "--runTestsByPath",
    ...testFiles,
  ];
}

/** Run the repository's Jest on exactly the given test files. */
export async function runJest(
  options: RunnerRunOptions,
): Promise<RunnerInvocation> {
  const execution = await resolveRunnerExecution(
    options.repoRoot,
    "jest",
    options.testFiles,
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "test-steward-jest-"));
  const outputFile = path.join(scratch, "results.json");
  const args = buildJestArgs(
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
    let results: RunnerResults | null = null;
    let selectedFilesCovered: boolean | null = null;
    if (!outcome.timedOut) {
      try {
        const document = await readContainedRegularFile(
          scratch,
          "results.json",
          RESULT_FILE_MAX_BYTES,
        );
        const parsed = parseSelectedJestFormatResults(
          document.toString("utf8"),
          execution.executionRoot,
          execution.executionTestFiles,
        );
        results = parsed?.results ?? null;
        selectedFilesCovered = parsed?.selectedFilesCovered ?? null;
      } catch {
        const parsed = parseSelectedJestFormatResults(
          outcome.stdout.trim(),
          execution.executionRoot,
          execution.executionTestFiles,
        );
        results = parsed?.results ?? null;
        selectedFilesCovered = parsed?.selectedFilesCovered ?? null;
      }
    }
    return {
      runner: "jest",
      version: await readRunnerVersion(execution.executionRoot, "jest"),
      argv: [process.execPath, ...args],
      cwd: execution.executionRoot,
      testFiles: execution.repositoryTestFiles,
      outcome,
      results,
      selectedFilesCovered,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}
