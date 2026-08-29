// Vitest runner adapter: fixed-argv invocation of the repository's installed
// Vitest entry through the trusted Node executable. Never a shell, never an
// npm script (TM-003/TM-009). Focused selection passes the affected test
// files as positional arguments to `vitest run`; structured results come from
// the JSON reporter written to a scratch file outside the repository.

import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseJestFormatResults,
  runFixedArgv,
  runnerEnvironment,
  type ProcessOutcome,
  type RunnerResults,
} from "./process.js";

export const VITEST_ENTRY = "node_modules/vitest/vitest.mjs";

export interface RunnerInvocation {
  readonly runner: "vitest" | "jest";
  /** Runner package version read inertly from its package.json, or null. */
  readonly version: string | null;
  /** Full argv: [node, entry, ...fixed args, ...test files]. */
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly testFiles: readonly string[];
  readonly outcome: ProcessOutcome;
  readonly results: RunnerResults | null;
}

export interface RunnerRunOptions {
  readonly repoRoot: string;
  readonly testFiles: readonly string[];
  readonly timeoutMs: number;
}

/** Resolve the repository's Vitest entry, or null when it is not installed. */
export async function resolveVitestEntry(
  repoRoot: string,
): Promise<string | null> {
  const entry = path.join(repoRoot, VITEST_ENTRY);
  try {
    await access(entry);
    return entry;
  } catch {
    return null;
  }
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
  outputFile: string,
  outcome: ProcessOutcome,
): Promise<RunnerResults | null> {
  try {
    return parseJestFormatResults(await readFile(outputFile, "utf8"));
  } catch {
    // Fall back to stdout: some failures still print the JSON document.
    return parseJestFormatResults(outcome.stdout.trim());
  }
}

/** Run the repository's Vitest on exactly the given test files. */
export async function runVitest(
  options: RunnerRunOptions,
): Promise<RunnerInvocation> {
  const entry = await resolveVitestEntry(options.repoRoot);
  if (entry === null) {
    throw new RunnerUnavailableError(
      "vitest",
      `Vitest entry ${VITEST_ENTRY} is not installed in the repository.`,
    );
  }
  const scratch = await mkdtemp(path.join(tmpdir(), "test-steward-vitest-"));
  const outputFile = path.join(scratch, "results.json");
  const args = buildVitestArgs(entry, options.testFiles, outputFile);
  try {
    const outcome = await runFixedArgv({
      file: process.execPath,
      args,
      cwd: options.repoRoot,
      env: runnerEnvironment(),
      timeoutMs: options.timeoutMs,
    });
    const results = outcome.timedOut
      ? null
      : await readResults(outputFile, outcome);
    return {
      runner: "vitest",
      version: await readRunnerVersion(options.repoRoot, "vitest"),
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

/** The requested runner is not installed in the repository. */
export class RunnerUnavailableError extends Error {
  constructor(
    readonly runner: "vitest" | "jest",
    message: string,
  ) {
    super(message);
    this.name = "RunnerUnavailableError";
  }
}
