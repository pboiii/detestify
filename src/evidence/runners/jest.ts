// Jest runner adapter: fixed-argv invocation of the repository's installed
// Jest CLI entry through the trusted Node executable. Never a shell, never an
// npm script (TM-003/TM-009). Focused selection uses `--runTestsByPath` with
// the affected files; structured results come from `--json --outputFile`.

import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseJestFormatResults,
  runFixedArgv,
  runnerEnvironment,
  type RunnerResults,
} from "./process.js";
import {
  readRunnerVersion,
  RunnerUnavailableError,
  type RunnerInvocation,
  type RunnerRunOptions,
} from "./vitest.js";

export const JEST_ENTRY = "node_modules/jest/bin/jest.js";

/** Resolve the repository's Jest entry, or null when it is not installed. */
export async function resolveJestEntry(
  repoRoot: string,
): Promise<string | null> {
  const entry = path.join(repoRoot, JEST_ENTRY);
  try {
    await access(entry);
    return entry;
  } catch {
    return null;
  }
}

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
  const entry = await resolveJestEntry(options.repoRoot);
  if (entry === null) {
    throw new RunnerUnavailableError(
      "jest",
      `Jest entry ${JEST_ENTRY} is not installed in the repository.`,
    );
  }
  const scratch = await mkdtemp(path.join(tmpdir(), "test-steward-jest-"));
  const outputFile = path.join(scratch, "results.json");
  const args = buildJestArgs(entry, options.testFiles, outputFile);
  try {
    const outcome = await runFixedArgv({
      file: process.execPath,
      args,
      cwd: options.repoRoot,
      env: runnerEnvironment(),
      timeoutMs: options.timeoutMs,
    });
    let results: RunnerResults | null = null;
    if (!outcome.timedOut) {
      try {
        results = parseJestFormatResults(await readFile(outputFile, "utf8"));
      } catch {
        results = parseJestFormatResults(outcome.stdout.trim());
      }
    }
    return {
      runner: "jest",
      version: await readRunnerVersion(options.repoRoot, "jest"),
      argv: [process.execPath, ...args],
      cwd: options.repoRoot,
      testFiles: options.testFiles,
      outcome,
      results,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}
