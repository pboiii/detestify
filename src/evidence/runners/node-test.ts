import { createHash } from "node:crypto";
import path from "node:path";
import {
  runFixedArgv,
  runnerEnvironment,
  type RunnerFailure,
  type RunnerResults,
} from "./process.js";
import { resolveRunnerExecution, type RunnerExecution } from "./workspace.js";
import type { RunnerInvocation, RunnerRunOptions } from "./vitest.js";

const FAILURE_COUNT_LIMIT = 25;
const FAILURE_TEXT_LIMIT = 400;

function decodeXml(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|quot|apos|lt|gt|amp);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
      if (hexadecimal !== undefined) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      }
      return (
        {
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
          "&amp;": "&",
        }[entity] ?? entity
      );
    },
  );
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match === null ? null : decodeXml(match[1]!);
}

function summary(xml: string, name: string): number | null {
  const match = new RegExp(`<!--\\s*${name}\\s+(\\d+)\\s*-->`).exec(xml);
  return match === null ? null : Number(match[1]);
}

function relativeFile(executionRoot: string, file: string): string | null {
  const relative = path.relative(
    executionRoot,
    path.isAbsolute(file) ? file : path.resolve(executionRoot, file),
  );
  return relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
    ? null
    : relative.split(path.sep).join("/");
}

export function parseNodeTestResults(
  xml: string,
  executionRoot: string,
  selectedTestFiles: readonly string[],
): { results: RunnerResults; selectedFilesCovered: boolean } | null {
  const total = summary(xml, "tests");
  const passed = summary(xml, "pass");
  const failed = summary(xml, "fail");
  const cancelled = summary(xml, "cancelled");
  const skipped = summary(xml, "skipped");
  const todo = summary(xml, "todo");
  if (
    total === null ||
    passed === null ||
    failed === null ||
    cancelled === null ||
    skipped === null ||
    todo === null ||
    total !== passed + failed + cancelled + skipped + todo
  ) {
    return null;
  }

  const executed = new Set<string>();
  const failures: RunnerFailure[] = [];
  let testCases = 0;
  const testCasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(testCasePattern)) {
    testCases += 1;
    const attributes = match[1]!;
    const rawFile = attribute(attributes, "file");
    const file = rawFile === null ? null : relativeFile(executionRoot, rawFile);
    if (file !== null) executed.add(file);
    const body = match[2] ?? "";
    const failure = /<failure\b([^>]*)>([\s\S]*?)<\/failure>/.exec(body);
    if (failure === null || failures.length >= FAILURE_COUNT_LIMIT) continue;
    const name = attribute(attributes, "name") ?? "(unnamed test)";
    const message = decodeXml(
      failure[2]!.trim() || attribute(failure[1]!, "message") || "test failed",
    );
    failures.push({
      name: name.slice(0, FAILURE_TEXT_LIMIT),
      message: message.slice(0, FAILURE_TEXT_LIMIT),
      file: rawFile,
      identityDigest: createHash("sha256")
        .update(JSON.stringify([file, name, message]))
        .digest("hex"),
    });
  }

  const expected = new Set(
    selectedTestFiles.map((file) => relativeFile(executionRoot, file)),
  );
  // Node 22.13's built-in JUnit reporter omits testcase file attributes.
  // The fixed positional argv still establishes the exact selected files.
  const selectedFilesCovered =
    !expected.has(null) &&
    (executed.size === 0
      ? testCases > 0
      : expected.size === executed.size &&
        [...expected].every((file) => file !== null && executed.has(file)));
  return {
    results: {
      total,
      passed,
      failed,
      skipped: cancelled + skipped + todo,
      failures,
      success: selectedFilesCovered && failed === 0 && cancelled === 0,
    },
    selectedFilesCovered,
  };
}

export function buildNodeTestArgs(
  execution: Pick<RunnerExecution, "loader" | "executionTestFiles">,
): string[] {
  return [
    ...(execution.loader === null ? [] : [`--import=${execution.loader}`]),
    "--test",
    "--test-reporter=junit",
    ...execution.executionTestFiles,
  ];
}

export async function runNodeTest(
  options: RunnerRunOptions,
): Promise<RunnerInvocation> {
  const execution = await resolveRunnerExecution(
    options.repoRoot,
    "node:test",
    options.testFiles,
  );
  const args = buildNodeTestArgs(execution);
  const outcome = await runFixedArgv({
    file: process.execPath,
    args,
    cwd: execution.executionRoot,
    env: runnerEnvironment(),
    timeoutMs: options.timeoutMs,
  });
  const parsed = outcome.timedOut
    ? null
    : parseNodeTestResults(
        outcome.stdout,
        execution.executionRoot,
        execution.executionTestFiles,
      );
  return {
    runner: "node:test",
    version: process.version,
    argv: [process.execPath, ...args],
    cwd: execution.executionRoot,
    testFiles: execution.repositoryTestFiles,
    outcome,
    results: parsed?.results ?? null,
    selectedFilesCovered: parsed?.selectedFilesCovered ?? null,
  };
}
