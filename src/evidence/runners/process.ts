// Fixed-argv trusted process execution (TM-003/TM-009/TM-016): never a shell,
// never an npm script, an explicit environment allowlist, a hard timeout that
// kills the runner's whole process group, and bounded captured output.
// Test failures are ordinary results here, not errors.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface FixedArgvSpec {
  /** Executable to run (usually `process.execPath`). */
  readonly file: string;
  /** Fixed argument vector; interpreted by no shell. */
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes?: number;
}

export interface ProcessOutcome {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
  /** True when the process group was SIGKILLed by the timeout/output cap. */
  readonly processGroupKilled: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  /** Spawn-level failure (for example ENOENT), or null when it started. */
  readonly spawnError: string | null;
}

const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Environment allowlist for trusted runner processes. */
export function runnerEnvironment(): Record<string, string> {
  const env: Record<string, string> = { NO_COLOR: "1", CI: "1" };
  for (const key of ["PATH", "HOME", "TMPDIR"]) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

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

/** Run one fixed-argv process to completion within its bounds. */
export async function runFixedArgv(
  spec: FixedArgvSpec,
): Promise<ProcessOutcome> {
  const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const startedAt = new Date().toISOString();
  const startedMonotonic = process.hrtime.bigint();

  return new Promise((resolve) => {
    // detached: the runner gets its own process group so the timeout kills
    // every descendant with it (TM-016), not only the direct child.
    const child = spawn(spec.file, [...spec.args], {
      cwd: spec.cwd,
      env: spec.env,
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let timedOut = false;
    let outputTruncated = false;
    let processGroupKilled = false;
    let spawnError: string | null = null;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const durationMs = Number(
        (process.hrtime.bigint() - startedMonotonic) / 1_000_000n,
      );
      resolve({
        exitCode,
        timedOut,
        outputTruncated,
        processGroupKilled,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        spawnError,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      processGroupKilled = true;
      killProcessGroup(child.pid);
    }, spec.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        outputTruncated = true;
        processGroupKilled = true;
        killProcessGroup(child.pid);
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        outputTruncated = true;
        processGroupKilled = true;
        killProcessGroup(child.pid);
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      spawnError =
        error.code === "ENOENT"
          ? `Executable not found: ${spec.file}`
          : `Process failed to start: ${error.message}`;
      finish(null);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}

// ---------------------------------------------------------------------------
// Jest-format result parsing (Vitest's JSON reporter emits the same shape).
// ---------------------------------------------------------------------------

export interface RunnerFailure {
  /** Full test name (untrusted repository data, quoted as evidence). */
  readonly name: string;
  /** First failure message, bounded. */
  readonly message: string;
  /** Test file the failure came from, or null. */
  readonly file: string | null;
  /** Digest of the canonical test file, complete name, and first failure message. */
  readonly identityDigest: string;
}

export interface RunnerResults {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly failures: readonly RunnerFailure[];
  readonly success: boolean;
}

/** True only when the structured run actually passed at least one test. */
export function hasPassingTestResults(results: RunnerResults | null): boolean {
  return (
    results !== null &&
    results.success &&
    results.total > 0 &&
    results.passed > 0 &&
    results.failed === 0
  );
}

const FAILURE_MESSAGE_LIMIT = 400;
const FAILURE_COUNT_LIMIT = 25;

interface JestAssertionResult {
  readonly status?: unknown;
  readonly fullName?: unknown;
  readonly title?: unknown;
  readonly failureMessages?: unknown;
}

interface JestTestResult {
  readonly name?: unknown;
  readonly testFilePath?: unknown;
  readonly assertionResults?: unknown;
}

interface ParsedJestFormatDocument {
  readonly results: RunnerResults;
  readonly testFilePaths: readonly (string | null)[];
}

function executionRelativePath(
  executionRoot: string,
  file: string,
): string | null {
  const absolute = path.isAbsolute(file)
    ? path.normalize(file)
    : path.resolve(executionRoot, file);
  const relative = path.relative(executionRoot, absolute);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

/**
 * Parse a Jest-format JSON results document (Jest `--json`, Vitest
 * `--reporter=json`). Returns null when the text is not a parseable result.
 */
function parseJestFormatDocument(
  text: string,
  executionRoot?: string,
): ParsedJestFormatDocument | null {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof document !== "object" || document === null) {
    return null;
  }
  const root = document as Record<string, unknown>;
  const total = root.numTotalTests;
  const passed = root.numPassedTests;
  const failed = root.numFailedTests;
  if (
    typeof total !== "number" ||
    typeof passed !== "number" ||
    typeof failed !== "number"
  ) {
    return null;
  }
  const pending =
    typeof root.numPendingTests === "number" ? root.numPendingTests : 0;
  const todo = typeof root.numTodoTests === "number" ? root.numTodoTests : 0;

  const failures: RunnerFailure[] = [];
  const testResults = Array.isArray(root.testResults) ? root.testResults : [];
  const testFilePaths: Array<string | null> = [];
  for (const entry of testResults as JestTestResult[]) {
    const file =
      typeof entry.name === "string"
        ? entry.name
        : typeof entry.testFilePath === "string"
          ? entry.testFilePath
          : null;
    testFilePaths.push(file);
    const assertions = Array.isArray(entry.assertionResults)
      ? (entry.assertionResults as JestAssertionResult[])
      : [];
    for (const assertion of assertions) {
      if (assertion.status !== "failed") {
        continue;
      }
      if (failures.length >= FAILURE_COUNT_LIMIT) {
        break;
      }
      const name =
        typeof assertion.fullName === "string"
          ? assertion.fullName
          : typeof assertion.title === "string"
            ? assertion.title
            : "(unnamed test)";
      const firstMessage = Array.isArray(assertion.failureMessages)
        ? assertion.failureMessages.find(
            (message): message is string => typeof message === "string",
          )
        : undefined;
      const canonicalFile =
        file !== null && executionRoot !== undefined
          ? executionRelativePath(executionRoot, file)
          : file;
      const identityMessage =
        executionRoot === undefined
          ? (firstMessage ?? "")
          : [
              pathToFileURL(executionRoot).href,
              path.normalize(executionRoot),
            ].reduce(
              (message, root) => message.split(root).join("<execution-root>"),
              firstMessage ?? "",
            );
      failures.push({
        name: name.slice(0, FAILURE_MESSAGE_LIMIT),
        message: (firstMessage ?? "").slice(0, FAILURE_MESSAGE_LIMIT),
        file,
        identityDigest: createHash("sha256")
          .update(JSON.stringify([canonicalFile, name, identityMessage]))
          .digest("hex"),
      });
    }
  }

  return {
    results: {
      total,
      passed,
      failed,
      skipped: pending + todo,
      failures,
      success: root.success === true && failed === 0,
    },
    testFilePaths,
  };
}

export function parseJestFormatResults(text: string): RunnerResults | null {
  return parseJestFormatDocument(text)?.results ?? null;
}

export interface SelectedRunnerResults {
  readonly results: RunnerResults;
  readonly selectedFilesCovered: boolean;
}

/** Parse results and require the runner to report exactly the requested files. */
export function parseSelectedJestFormatResults(
  text: string,
  executionRoot: string,
  selectedTestFiles: readonly string[],
): SelectedRunnerResults | null {
  const parsed = parseJestFormatDocument(text, executionRoot);
  if (parsed === null) {
    return null;
  }
  const expected = selectedTestFiles.map((file) =>
    executionRelativePath(executionRoot, file),
  );
  const executed = parsed.testFilePaths.map((file) =>
    file === null ? null : executionRelativePath(executionRoot, file),
  );
  const expectedSet = new Set(expected);
  const executedSet = new Set(executed);
  const selectedFilesCovered =
    !expected.includes(null) &&
    !executed.includes(null) &&
    expectedSet.size === executedSet.size &&
    [...expectedSet].every((file) => executedSet.has(file));
  return {
    results: selectedFilesCovered
      ? parsed.results
      : { ...parsed.results, success: false },
    selectedFilesCovered,
  };
}
