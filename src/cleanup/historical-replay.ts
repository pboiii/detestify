import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  cp,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeTests, isTestFilePath } from "../analysis/tests.js";
import { runJest } from "../evidence/runners/jest.js";
import { runNodeTest } from "../evidence/runners/node-test.js";
import { hasPassingTestResults } from "../evidence/runners/process.js";
import {
  runVitest,
  type RunnerInvocation,
} from "../evidence/runners/vitest.js";
import {
  resolveRunnerExecution,
  RunnerUnavailableError,
} from "../evidence/runners/workspace.js";
import { formatSchemaErrors, getValidator } from "../core/schemas/index.js";
import { CLI_VERSION } from "../cli/version.js";
import { fingerprintDiff } from "../repository/fingerprint.js";
import { runGit, snapshotRepository } from "../repository/git.js";
import {
  normalizeRepositoryPath,
  realpathContained,
} from "../repository/paths.js";

const FILE_SIZE_LIMIT = 1_048_576;
const RUN_TIMEOUT_MS = 120_000;
const REPLAY_RUN_BUDGET_MS = 600_000;
const MAX_FAULTS = 8;
const FULL_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CONFIG_SOURCE_PATTERN =
  /(^|\/)(?:[^/]+\.)?config\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const REQUIRED_PERMISSIONS = [
  "run_repository_commands",
  "evaluate_repository_config",
  "network_access",
  "mutation",
] as const;

export class HistoricalReplayConfigError extends Error {
  constructor(detail: string) {
    super(`Configuration historical replay ${detail}`);
    this.name = "HistoricalReplayConfigError";
  }
}

export class HistoricalReplayTrustError extends Error {
  constructor(detail: string) {
    super(`Historical fault replay requires ${detail}`);
    this.name = "HistoricalReplayTrustError";
  }
}

interface HistoricalFault {
  readonly id: string;
  readonly obligationIds: readonly string[];
  readonly fixCommit: string;
  readonly sourcePaths: readonly string[];
  readonly expectedFailureSubstring: string;
}

interface HistoricalManifest {
  readonly version: "1.0";
  readonly relativePath: string;
  readonly faults: readonly HistoricalFault[];
}

interface SuiteResult {
  readonly passed: boolean;
  readonly detected: boolean;
  readonly expected_signature_observed: boolean;
  readonly expected_observable_keys: readonly string[];
  readonly total: number;
  readonly failed: number;
  readonly identities: readonly string[];
  readonly limitation: string | null;
}

interface FaultReplayResult {
  readonly id: string;
  readonly obligation_ids: readonly string[];
  readonly fix_commit: string;
  readonly parent_commit: string;
  readonly source_paths: readonly string[];
  readonly ignored_test_paths: readonly string[];
  readonly expected_failure_signature: string;
  readonly matching_expected_observable_keys: readonly string[];
  readonly source_binding: {
    readonly mode: "direct-import";
    readonly candidate_only_paths: readonly string[];
    readonly retained_only_paths: readonly string[];
    readonly passed: boolean;
  };
  readonly candidate_only: SuiteResult;
  readonly retained_only: SuiteResult;
  readonly preserved_by_replacement: boolean;
}

export interface HistoricalReplayInput {
  readonly repositoryRoot: string;
  readonly repositoryFiles: readonly string[];
  readonly sourceFiles: readonly string[];
  readonly testFiles: readonly string[];
  readonly runner: "vitest" | "jest" | "node:test" | "unknown" | "none";
  readonly configPath: string;
  readonly manifestPath: string;
  readonly candidateId: string;
  readonly candidateTestPaths: readonly string[];
  readonly excludeTestPaths: readonly string[];
  readonly revision: string | null;
  readonly sourceFingerprint: string;
  readonly observedAt: string;
}

export interface HistoricalReplayResult {
  readonly passed: boolean;
  readonly signalId: string;
  readonly obligationIds: readonly string[];
  readonly summary: string;
  readonly limitations: readonly string[];
  readonly counterfactualStatus: "passed" | "failed" | "partial";
  readonly worktreeStatus: "passed" | "failed" | "partial";
  readonly evidence: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const allowed = new Set(expected);
  return Object.keys(value).every((key) => allowed.has(key));
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validFailureSubstring(value: unknown): value is string {
  return validId(value) && value.length >= 8;
}

async function readContainedJson(
  repositoryRoot: string,
  requested: string,
  label: string,
): Promise<{ document: unknown; relativePath: string }> {
  let contained: string;
  try {
    const root = await realpath(repositoryRoot);
    const target = await realpath(path.resolve(root, requested));
    const relative = path.relative(root, target);
    contained = await realpathContained(root, relative);
  } catch (error) {
    throw new HistoricalReplayConfigError(
      `${label} path is not a contained repository file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const stat = await lstat(contained);
  if (!stat.isFile()) {
    throw new HistoricalReplayConfigError(
      `${label} is not a regular file: ${requested}`,
    );
  }
  if (stat.size > FILE_SIZE_LIMIT) {
    throw new HistoricalReplayConfigError(
      `${label} exceeds 1 MiB: ${requested}`,
    );
  }
  if (path.extname(contained) !== ".json") {
    throw new HistoricalReplayConfigError(
      `${label} must be inert JSON (.json): ${requested}`,
    );
  }
  let document: unknown;
  try {
    document = JSON.parse(await readFile(contained, "utf8"));
  } catch (error) {
    throw new HistoricalReplayConfigError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    document,
    relativePath: path
      .relative(repositoryRoot, contained)
      .split(path.sep)
      .join("/"),
  };
}

async function requirePermissions(
  repositoryRoot: string,
  configPath: string,
): Promise<void> {
  const { document } = await readContainedJson(
    repositoryRoot,
    configPath,
    "configuration",
  );
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new HistoricalReplayConfigError(
      `configuration failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
  const operations = (
    document as {
      trusted_operations: Record<
        (typeof REQUIRED_PERMISSIONS)[number],
        boolean
      >;
    }
  ).trusted_operations;
  const missing = REQUIRED_PERMISSIONS.filter(
    (permission) => !operations[permission],
  );
  if (missing.length > 0) {
    throw new HistoricalReplayTrustError(
      `an explicit --config with these trusted_operations set to true: ${missing.join(", ")}.`,
    );
  }
}

async function loadManifest(
  repositoryRoot: string,
  manifestPath: string,
): Promise<HistoricalManifest> {
  const { document, relativePath } = await readContainedJson(
    repositoryRoot,
    manifestPath,
    "historical-fault manifest",
  );
  if (
    !isRecord(document) ||
    !hasOnlyKeys(document, ["version", "faults"]) ||
    document.version !== "1.0" ||
    !Array.isArray(document.faults) ||
    document.faults.length === 0 ||
    document.faults.length > MAX_FAULTS
  ) {
    throw new HistoricalReplayConfigError(
      `historical-fault manifest must be { version: "1.0", faults: [...] } with 1-${MAX_FAULTS} faults and no extra fields.`,
    );
  }

  const ids = new Set<string>();
  const faults: HistoricalFault[] = [];
  for (const rawFault of document.faults) {
    if (
      !isRecord(rawFault) ||
      !hasOnlyKeys(rawFault, [
        "id",
        "obligation_ids",
        "fix_commit",
        "source_paths",
        "expected_failure_substring",
      ]) ||
      !validId(rawFault.id) ||
      !Array.isArray(rawFault.obligation_ids) ||
      rawFault.obligation_ids.length === 0 ||
      !rawFault.obligation_ids.every(validId) ||
      new Set(rawFault.obligation_ids).size !==
        rawFault.obligation_ids.length ||
      typeof rawFault.fix_commit !== "string" ||
      !FULL_COMMIT_PATTERN.test(rawFault.fix_commit) ||
      !Array.isArray(rawFault.source_paths) ||
      rawFault.source_paths.length === 0 ||
      !rawFault.source_paths.every((sourcePath) => validId(sourcePath)) ||
      !validFailureSubstring(rawFault.expected_failure_substring)
    ) {
      throw new HistoricalReplayConfigError(
        "each historical fault must contain only a non-empty id, unique non-empty obligation_ids, a full lowercase 40- or 64-hex fix_commit, unique repository source_paths, and an expected_failure_substring of 8-200 characters.",
      );
    }
    let sourcePaths: string[];
    try {
      sourcePaths = unique(
        rawFault.source_paths.map((sourcePath) =>
          normalizeRepositoryPath(sourcePath as string),
        ),
      ).sort();
    } catch {
      throw new HistoricalReplayConfigError(
        `historical fault ${rawFault.id} contains an invalid source path.`,
      );
    }
    if (sourcePaths.length !== rawFault.source_paths.length) {
      throw new HistoricalReplayConfigError(
        `historical fault ${rawFault.id} repeats a source path.`,
      );
    }
    if (ids.has(rawFault.id)) {
      throw new HistoricalReplayConfigError(
        `historical-fault manifest repeats fault id ${rawFault.id}.`,
      );
    }
    ids.add(rawFault.id);
    faults.push({
      id: rawFault.id,
      obligationIds: [...rawFault.obligation_ids],
      fixCommit: rawFault.fix_commit,
      sourcePaths,
      expectedFailureSubstring: rawFault.expected_failure_substring,
    });
  }
  return { version: "1.0", relativePath, faults };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalizeCandidateTests(input: HistoricalReplayInput): {
  candidateOnly: string[];
  retainedOnly: string[];
} {
  const allTests = new Set(
    input.testFiles.map((file) => normalizeRepositoryPath(file)),
  );
  const candidateTests = unique(
    input.candidateTestPaths.map((file) => normalizeRepositoryPath(file)),
  );
  const candidateSet = new Set(candidateTests);
  const excluded = unique(
    input.excludeTestPaths.map((file) => normalizeRepositoryPath(file)),
  );
  if (excluded.length === 0) {
    throw new HistoricalReplayConfigError(
      "requires at least one --exclude-test path.",
    );
  }
  for (const file of excluded) {
    if (!allTests.has(file) || !candidateSet.has(file)) {
      throw new HistoricalReplayConfigError(
        `excluded path is not a discovered test on candidate ${input.candidateId}: ${file}`,
      );
    }
  }
  const retainedOnly = candidateTests.filter(
    (file) => !excluded.includes(file),
  );
  if (retainedOnly.length === 0) {
    throw new HistoricalReplayConfigError(
      "cannot exclude every test on the selected candidate; a retained replacement is required.",
    );
  }
  return { candidateOnly: excluded, retainedOnly };
}

interface ScratchExecution {
  readonly sourceRoot: string;
  readonly relativeRoot: string;
}

interface ScratchOptions {
  readonly excludedTestPaths?: readonly string[];
  readonly execution?: ScratchExecution;
}

async function prepareScratch(
  input: HistoricalReplayInput,
  parent: string,
  name: string,
  options: ScratchOptions = {},
): Promise<string> {
  const scratch = path.join(parent, name);
  const excluded = new Set(options.excludedTestPaths ?? []);
  await mkdir(scratch, { recursive: true });
  for (const requested of input.repositoryFiles) {
    const relative = normalizeRepositoryPath(requested);
    if (excluded.has(relative)) {
      continue;
    }
    const source = await realpathContained(input.repositoryRoot, relative);
    const target = path.join(scratch, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  if (options.execution !== undefined) {
    const sourceModules = path.join(
      options.execution.sourceRoot,
      "node_modules",
    );
    const scratchModules = path.join(
      scratch,
      options.execution.relativeRoot,
      "node_modules",
    );
    await mkdir(path.dirname(scratchModules), { recursive: true });
    await cp(sourceModules, scratchModules, {
      recursive: true,
      dereference: true,
      mode: fsConstants.COPYFILE_FICLONE,
      filter: (source) => {
        const first = path.relative(sourceModules, source).split(path.sep)[0];
        return first !== ".cache" && first !== ".vite";
      },
    });
  }
  await runGit(scratch, ["init", "-q"]);
  return scratch;
}

interface NumstatEntry {
  readonly paths: readonly string[];
  readonly binary: boolean;
}

function parseNumstat(output: string): NumstatEntry[] {
  const records = output.split("\0");
  const entries: NumstatEntry[] = [];
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    if (record === undefined || record === "") {
      index += 1;
      continue;
    }
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      throw new HistoricalReplayConfigError(
        "fix commit produced an invalid git numstat record.",
      );
    }
    const binary =
      record.slice(0, firstTab) === "-" &&
      record.slice(firstTab + 1, secondTab) === "-";
    const file = record.slice(secondTab + 1);
    if (file !== "") {
      entries.push({ paths: [file], binary });
      index += 1;
      continue;
    }
    const previous = records[index + 1];
    const next = records[index + 2];
    if (previous === undefined || next === undefined || next === "") {
      throw new HistoricalReplayConfigError(
        "fix commit produced an incomplete rename record.",
      );
    }
    entries.push({ paths: [previous, next], binary });
    index += 3;
  }
  return entries;
}

interface NameStatusEntry {
  readonly status: string;
  readonly paths: readonly string[];
}

function parseNameStatus(output: string): NameStatusEntry[] {
  const fields = output.split("\0").filter((field) => field !== "");
  const entries: NameStatusEntry[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index];
    if (status === undefined) {
      break;
    }
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const paths = fields.slice(index + 1, index + 1 + pathCount);
    if (paths.length !== pathCount) {
      throw new HistoricalReplayConfigError(
        "fix commit produced an incomplete name-status record.",
      );
    }
    entries.push({ status, paths });
    index += pathCount + 1;
  }
  return entries;
}

interface ValidatedHistoricalFault extends HistoricalFault {
  readonly resolvedFixCommit: string;
  readonly parentCommit: string;
  readonly sourcePaths: readonly string[];
  readonly ignoredTestPaths: readonly string[];
  readonly patchPath: string;
}

async function historicalGit(
  repositoryRoot: string,
  args: readonly string[],
  maxOutputBytes = FILE_SIZE_LIMIT,
): Promise<{ stdout: string; stderr: string }> {
  return runGit(repositoryRoot, ["--no-replace-objects", ...args], {
    maxOutputBytes,
  });
}

function normalizeCommitPath(faultId: string, file: string): string {
  try {
    return normalizeRepositoryPath(file);
  } catch (error) {
    throw new HistoricalReplayConfigError(
      `fault ${faultId} has an invalid changed path: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isConfigSourcePath(file: string): boolean {
  return CONFIG_SOURCE_PATTERN.test(file);
}

async function resolveFaults(
  input: HistoricalReplayInput,
  manifest: HistoricalManifest,
  temporaryRoot: string,
): Promise<ValidatedHistoricalFault[]> {
  if (input.revision === null) {
    throw new HistoricalReplayConfigError("requires an analyzed HEAD commit.");
  }
  const { stdout: analyzedOutput } = await historicalGit(
    input.repositoryRoot,
    ["rev-parse", "--verify", "--quiet", `${input.revision}^{commit}`],
    1_024,
  );
  const analyzedHead = analyzedOutput.trim();
  if (!FULL_COMMIT_PATTERN.test(analyzedHead)) {
    throw new HistoricalReplayConfigError(
      "could not resolve the analyzed HEAD to a full commit id.",
    );
  }

  const scratch = await prepareScratch(input, temporaryRoot, "validate");
  const sourceFiles = new Set(input.sourceFiles);
  const validated: ValidatedHistoricalFault[] = [];

  for (const [index, fault] of manifest.faults.entries()) {
    let resolvedFixCommit: string;
    try {
      const { stdout } = await historicalGit(
        input.repositoryRoot,
        ["rev-parse", "--verify", "--quiet", `${fault.fixCommit}^{commit}`],
        1_024,
      );
      resolvedFixCommit = stdout.trim();
    } catch (error) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit does not resolve locally: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!FULL_COMMIT_PATTERN.test(resolvedFixCommit)) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit did not resolve to a full commit id.`,
      );
    }

    const { stdout: parentsOutput } = await historicalGit(
      input.repositoryRoot,
      ["rev-list", "--parents", "-n", "1", resolvedFixCommit],
      1_024,
    );
    const commitAndParents = parentsOutput.trim().split(/\s+/);
    if (
      commitAndParents.length !== 2 ||
      commitAndParents[0] !== resolvedFixCommit
    ) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit must have exactly one parent.`,
      );
    }
    const parentCommit = commitAndParents[1]!;

    try {
      await historicalGit(
        input.repositoryRoot,
        ["merge-base", "--is-ancestor", resolvedFixCommit, analyzedHead],
        1_024,
      );
    } catch {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit is not an ancestor of analyzed HEAD ${analyzedHead}.`,
      );
    }

    const [{ stdout: statusOutput }, { stdout: numstatOutput }] =
      await Promise.all([
        historicalGit(input.repositoryRoot, [
          "diff-tree",
          "--no-commit-id",
          "--name-status",
          "-z",
          "-r",
          "-M",
          "-C",
          parentCommit,
          resolvedFixCommit,
        ]),
        historicalGit(input.repositoryRoot, [
          "diff-tree",
          "--no-commit-id",
          "--numstat",
          "-z",
          "-r",
          "-M",
          "-C",
          parentCommit,
          resolvedFixCommit,
        ]),
      ]);
    const changes = parseNameStatus(statusOutput).map((change) => ({
      status: change.status,
      paths: change.paths.map((file) => normalizeCommitPath(fault.id, file)),
    }));
    const binaryPaths = new Set(
      parseNumstat(numstatOutput)
        .filter((entry) => entry.binary)
        .flatMap((entry) =>
          entry.paths.map((file) => normalizeCommitPath(fault.id, file)),
        ),
    );
    const sourcePaths = new Set<string>();
    const ignoredTestPaths = new Set<string>();
    for (const change of changes) {
      const allTests = change.paths.every((file) => isTestFilePath(file));
      if (allTests) {
        change.paths.forEach((file) => ignoredTestPaths.add(file));
        continue;
      }
      if (change.status !== "M") {
        throw new HistoricalReplayConfigError(
          `fault ${fault.id} fix_commit must only modify source files; rejected ${change.status} ${change.paths.join(" -> ")}.`,
        );
      }
      const [file] = change.paths;
      if (
        file === undefined ||
        !sourceFiles.has(file) ||
        isConfigSourcePath(file)
      ) {
        throw new HistoricalReplayConfigError(
          `fault ${fault.id} fix_commit changed a non-source or configuration path: ${file ?? "(missing path)"}.`,
        );
      }
      if (binaryPaths.has(file)) {
        throw new HistoricalReplayConfigError(
          `fault ${fault.id} fix_commit changed binary source path ${file}.`,
        );
      }
      sourcePaths.add(file);
    }
    if (sourcePaths.size === 0) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit changes no eligible source files.`,
      );
    }
    const resolvedSourcePaths = [...sourcePaths].sort();
    if (
      resolvedSourcePaths.length !== fault.sourcePaths.length ||
      resolvedSourcePaths.some(
        (sourcePath, index) => sourcePath !== fault.sourcePaths[index],
      )
    ) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} fix_commit source paths do not match the predeclared source_paths.`,
      );
    }

    const patchPath = path.join(temporaryRoot, `fault-${index}.patch`);
    let patch: string;
    try {
      const { stdout } = await historicalGit(input.repositoryRoot, [
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        resolvedFixCommit,
        parentCommit,
        "--",
        ...resolvedSourcePaths.map((file) => `:(top,literal)${file}`),
      ]);
      patch = stdout;
    } catch (error) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} reverse source patch could not be derived within 1 MiB: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (patch === "") {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} reverse source patch is empty.`,
      );
    }
    await writeFile(patchPath, patch, "utf8");
    try {
      await runGit(scratch, [
        "apply",
        "--check",
        "--whitespace=nowarn",
        patchPath,
      ]);
    } catch (error) {
      throw new HistoricalReplayConfigError(
        `fault ${fault.id} reverse source patch does not apply cleanly to the analyzed tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    validated.push({
      ...fault,
      resolvedFixCommit,
      parentCommit,
      sourcePaths: resolvedSourcePaths,
      ignoredTestPaths: [...ignoredTestPaths].sort(),
      patchPath,
    });
  }
  return validated;
}

function unavailableSuite(limitation: string): SuiteResult {
  return {
    passed: false,
    detected: false,
    expected_signature_observed: false,
    expected_observable_keys: [],
    total: 0,
    failed: 0,
    identities: [],
    limitation,
  };
}

function expectedObservableKeys(
  invocation: RunnerInvocation,
  expectedFailureSubstring: string | undefined,
): string[] {
  if (expectedFailureSubstring === undefined || invocation.results === null) {
    return [];
  }
  const expected = expectedFailureSubstring.replace(/\s+/g, " ").trim();
  const signature = signatureDigest(expected);
  return unique(
    invocation.results.failures.flatMap((failure) => {
      const headline = failure.message
        .split(/\r?\n/, 1)[0]!
        .replace(/\s+/g, " ")
        .trim();
      return headline.includes(expected)
        ? [
            createHash("sha256")
              .update(signature)
              .update("\0")
              .update(headline)
              .digest("hex"),
          ]
        : [];
    }),
  ).sort();
}

function suiteResult(
  invocation: RunnerInvocation,
  expectedFailureSubstring?: string,
): SuiteResult {
  const { outcome, results } = invocation;
  const invalid =
    outcome.spawnError ??
    (outcome.timedOut
      ? "the runner timed out"
      : outcome.outputTruncated
        ? "the runner output was truncated"
        : invocation.selectedFilesCovered !== true
          ? "the runner did not establish exactly the selected test files"
          : results === null
            ? "the runner returned no structured results"
            : null);
  if (invalid !== null || results === null) {
    return {
      passed: false,
      detected: false,
      expected_signature_observed: false,
      expected_observable_keys: [],
      total: results?.total ?? 0,
      failed: results?.failed ?? 0,
      identities: [],
      limitation: invalid,
    };
  }
  const identities = unique(
    results.failures.map((failure) => failure.identityDigest),
  ).sort();
  const passed = outcome.exitCode === 0 && hasPassingTestResults(results);
  const detected =
    outcome.exitCode !== 0 && results.failed > 0 && identities.length > 0;
  const observedKeys = expectedObservableKeys(
    invocation,
    expectedFailureSubstring,
  );
  return {
    passed,
    detected,
    expected_signature_observed: observedKeys.length > 0,
    expected_observable_keys: observedKeys,
    total: results.total,
    failed: results.failed,
    identities,
    limitation:
      passed || detected
        ? null
        : results.total === 0
          ? "the runner executed no tests"
          : results.passed === 0 && results.failed === 0
            ? "the runner passed no tests"
            : "the run did not establish a structured test-failure identity",
  };
}

async function runSuite(
  runner: "vitest" | "jest" | "node:test",
  repositoryRoot: string,
  testFiles: readonly string[],
  timeoutMs: number,
  expectedFailureSubstring?: string,
): Promise<SuiteResult> {
  try {
    const canonicalRoot = await realpath(repositoryRoot);
    const run =
      runner === "vitest"
        ? runVitest
        : runner === "jest"
          ? runJest
          : runNodeTest;
    const invocation = await run({
      repoRoot: canonicalRoot,
      testFiles,
      timeoutMs,
    });
    return suiteResult(invocation, expectedFailureSubstring);
  } catch (error) {
    return unavailableSuite(
      error instanceof RunnerUnavailableError
        ? error.message
        : `runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function remainingRunBudget(startedAt: bigint): number {
  const elapsed = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  return Math.max(0, REPLAY_RUN_BUDGET_MS - elapsed);
}

async function runSuiteWithinBudget(
  runner: "vitest" | "jest" | "node:test",
  repositoryRoot: string,
  testFiles: readonly string[],
  startedAt: bigint,
  expectedFailureSubstring?: string,
): Promise<SuiteResult> {
  const remaining = remainingRunBudget(startedAt);
  if (remaining === 0) {
    return unavailableSuite(
      `the total runner budget of ${REPLAY_RUN_BUDGET_MS} ms was exhausted`,
    );
  }
  const timeoutMs = Math.min(RUN_TIMEOUT_MS, remaining);
  const result = await runSuite(
    runner,
    repositoryRoot,
    testFiles,
    timeoutMs,
    expectedFailureSubstring,
  );
  if (
    timeoutMs < RUN_TIMEOUT_MS &&
    result.limitation === "the runner timed out"
  ) {
    return {
      ...result,
      limitation: `the total runner budget of ${REPLAY_RUN_BUDGET_MS} ms was exhausted`,
    };
  }
  return result;
}

async function resolveScratchExecution(
  repositoryRoot: string,
  runner: "vitest" | "jest" | "node:test",
  testFiles: readonly string[],
): Promise<ScratchExecution> {
  const root = await realpath(repositoryRoot);
  const execution = await resolveRunnerExecution(root, runner, testFiles);
  const relativeRoot = path.relative(root, execution.executionRoot);
  if (
    relativeRoot === ".." ||
    relativeRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeRoot)
  ) {
    throw new RunnerUnavailableError(
      runner,
      "The workspace-local runner execution root is outside the repository.",
      "unsupported",
    );
  }
  return {
    sourceRoot: execution.executionRoot,
    relativeRoot,
  };
}

interface CandidateSourceImports {
  readonly candidateOnly: readonly string[];
  readonly retainedOnly: readonly string[];
}

async function candidateSourceImports(
  input: HistoricalReplayInput,
  candidateOnlyTests: readonly string[],
  retainedOnlyTests: readonly string[],
): Promise<CandidateSourceImports> {
  const selectedTests = [...candidateOnlyTests, ...retainedOnlyTests];
  const inventory = await analyzeTests({
    repoRoot: input.repositoryRoot,
    files: [...input.sourceFiles, ...selectedTests],
  });
  const factsByPath = new Map(
    inventory.testFiles.map((testFile) => [testFile.file, testFile]),
  );
  const missing = selectedTests.filter(
    (testPath) => !factsByPath.has(testPath),
  );
  if (missing.length > 0) {
    throw new HistoricalReplayConfigError(
      `could not analyze candidate test imports: ${missing.join(", ")}.`,
    );
  }
  const sourceFiles = new Set(input.sourceFiles);
  const importsFor = (testPaths: readonly string[]): string[] =>
    unique(
      testPaths.flatMap((testPath) =>
        factsByPath
          .get(testPath)!
          .imports.filter(
            (edge) =>
              edge.resolution === "in-repo" &&
              edge.to !== null &&
              sourceFiles.has(edge.to),
          )
          .map((edge) => edge.to!),
      ),
    ).sort();
  return {
    candidateOnly: importsFor(candidateOnlyTests),
    retainedOnly: importsFor(retainedOnlyTests),
  };
}

function signatureDigest(expectedFailureSubstring: string): string {
  return createHash("sha256").update(expectedFailureSubstring).digest("hex");
}

function replaySignalId(
  manifest: HistoricalManifest,
  candidateId: string,
  excludedTests: readonly string[],
): string {
  const hash = createHash("sha256")
    .update(manifest.version)
    .update("\0")
    .update(candidateId);
  for (const file of excludedTests) hash.update("\0").update(file);
  for (const fault of manifest.faults) {
    hash.update("\0").update(fault.id);
    for (const obligation of fault.obligationIds) {
      hash.update("\0").update(obligation);
    }
    hash.update("\0").update(fault.fixCommit);
    for (const sourcePath of fault.sourcePaths) {
      hash.update("\0").update(sourcePath);
    }
    hash.update("\0").update(fault.expectedFailureSubstring);
  }
  return `ev-current-suite-reverse-patch:${hash.digest("hex").slice(0, 12)}`;
}

export async function runHistoricalReplay(
  input: HistoricalReplayInput,
): Promise<HistoricalReplayResult> {
  const startedAt = process.hrtime.bigint();
  await requirePermissions(input.repositoryRoot, input.configPath);
  const manifest = await loadManifest(input.repositoryRoot, input.manifestPath);
  const { candidateOnly, retainedOnly } = normalizeCandidateTests(input);
  const sourceImports = await candidateSourceImports(
    input,
    candidateOnly,
    retainedOnly,
  );
  const allTests = input.testFiles.map((file) => normalizeRepositoryPath(file));
  const candidateOnlyExcluded = allTests.filter(
    (file) => !candidateOnly.includes(file),
  );
  const retainedOnlyExcluded = allTests.filter(
    (file) => !retainedOnly.includes(file),
  );
  let scratchExecution: ScratchExecution | null = null;
  let runnerResolutionLimitation: string | null = null;
  if (
    input.runner === "vitest" ||
    input.runner === "jest" ||
    input.runner === "node:test"
  ) {
    try {
      scratchExecution = await resolveScratchExecution(
        input.repositoryRoot,
        input.runner,
        [...candidateOnly, ...retainedOnly],
      );
    } catch (error) {
      runnerResolutionLimitation =
        error instanceof RunnerUnavailableError
          ? error.message
          : `runner resolution failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const signalId = replaySignalId(manifest, input.candidateId, candidateOnly);
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "detestify-current-suite-reverse-patch-"),
  );
  let result: HistoricalReplayResult;
  try {
    const faults = await resolveFaults(input, manifest, temporaryRoot);
    const limitations: string[] = [
      "Current-suite reverse-patch replay uses current tests and dependencies with source-only reverse patches; eligibility is limited to the predeclared candidate-bound faults and is not general historical coverage.",
      "A fault is eligible only when the excluded candidate-only tests and retained-only tests each report one shared normalized failure headline bound to the predeclared observable signature; a shared substring or manifest signature alone is insufficient.",
    ];
    let baselineCandidateOnly = unavailableSuite(
      runnerResolutionLimitation ?? "no supported test runner was detected",
    );
    let baselineRetainedOnly = baselineCandidateOnly;
    const faultResults: FaultReplayResult[] = [];

    if (
      (input.runner === "vitest" ||
        input.runner === "jest" ||
        input.runner === "node:test") &&
      scratchExecution !== null
    ) {
      const baselineCandidateScratch = await prepareScratch(
        input,
        temporaryRoot,
        "baseline-candidate-only",
        {
          excludedTestPaths: candidateOnlyExcluded,
          execution: scratchExecution,
        },
      );
      const baselineRetainedScratch = await prepareScratch(
        input,
        temporaryRoot,
        "baseline-retained-only",
        {
          excludedTestPaths: retainedOnlyExcluded,
          execution: scratchExecution,
        },
      );
      baselineCandidateOnly = await runSuiteWithinBudget(
        input.runner,
        baselineCandidateScratch,
        candidateOnly,
        startedAt,
      );
      baselineRetainedOnly = await runSuiteWithinBudget(
        input.runner,
        baselineRetainedScratch,
        retainedOnly,
        startedAt,
      );

      if (baselineCandidateOnly.passed && baselineRetainedOnly.passed) {
        const candidateImports = new Set(sourceImports.candidateOnly);
        const retainedImports = new Set(sourceImports.retainedOnly);
        for (const [index, fault] of faults.entries()) {
          const candidateBoundPaths = fault.sourcePaths.filter((sourcePath) =>
            candidateImports.has(sourcePath),
          );
          const retainedBoundPaths = fault.sourcePaths.filter((sourcePath) =>
            retainedImports.has(sourcePath),
          );
          const sourceBound =
            candidateBoundPaths.length === fault.sourcePaths.length &&
            retainedBoundPaths.length === fault.sourcePaths.length;
          let candidateResult = unavailableSuite(
            "the fault was not directly source-bound to both candidate groups",
          );
          let retainedResult = candidateResult;
          if (sourceBound && remainingRunBudget(startedAt) > 0) {
            const candidateScratch = await prepareScratch(
              input,
              temporaryRoot,
              `fault-${index}-candidate-only`,
              {
                excludedTestPaths: candidateOnlyExcluded,
                execution: scratchExecution,
              },
            );
            const retainedScratch = await prepareScratch(
              input,
              temporaryRoot,
              `fault-${index}-retained-only`,
              {
                excludedTestPaths: retainedOnlyExcluded,
                execution: scratchExecution,
              },
            );
            await runGit(candidateScratch, [
              "apply",
              "--whitespace=nowarn",
              fault.patchPath,
            ]);
            await runGit(retainedScratch, [
              "apply",
              "--whitespace=nowarn",
              fault.patchPath,
            ]);
            candidateResult = await runSuiteWithinBudget(
              input.runner,
              candidateScratch,
              candidateOnly,
              startedAt,
              fault.expectedFailureSubstring,
            );
            retainedResult = await runSuiteWithinBudget(
              input.runner,
              retainedScratch,
              retainedOnly,
              startedAt,
              fault.expectedFailureSubstring,
            );
          }
          const matchingExpectedObservableKeys =
            candidateResult.expected_observable_keys.filter((key) =>
              retainedResult.expected_observable_keys.includes(key),
            );
          const preservedByReplacement =
            sourceBound &&
            candidateResult.detected &&
            candidateResult.expected_signature_observed &&
            retainedResult.detected &&
            retainedResult.expected_signature_observed &&
            candidateResult.expected_observable_keys.length === 1 &&
            retainedResult.expected_observable_keys.length === 1 &&
            matchingExpectedObservableKeys.length === 1;
          faultResults.push({
            id: fault.id,
            obligation_ids: fault.obligationIds,
            fix_commit: fault.resolvedFixCommit,
            parent_commit: fault.parentCommit,
            source_paths: fault.sourcePaths,
            ignored_test_paths: fault.ignoredTestPaths,
            expected_failure_signature: signatureDigest(
              fault.expectedFailureSubstring.replace(/\s+/g, " ").trim(),
            ),
            matching_expected_observable_keys: matchingExpectedObservableKeys,
            source_binding: {
              mode: "direct-import",
              candidate_only_paths: candidateBoundPaths,
              retained_only_paths: retainedBoundPaths,
              passed: sourceBound,
            },
            candidate_only: candidateResult,
            retained_only: retainedResult,
            preserved_by_replacement: preservedByReplacement,
          });
          if (!preservedByReplacement) {
            limitations.push(
              sourceBound
                ? `Fault ${fault.id} did not establish one shared candidate-only and retained-only failure headline bound to its predeclared observable signature; matching substrings alone do not establish equivalence.`
                : `Fault ${fault.id} was not directly imported by both the candidate-only and retained-only tests; unrelated faults fail closed.`,
            );
          }
        }
      }
    }

    if (!baselineCandidateOnly.passed) {
      limitations.push(
        `The original candidate-only tests did not pass${baselineCandidateOnly.limitation === null ? "." : `: ${baselineCandidateOnly.limitation}.`}`,
      );
    }
    if (!baselineRetainedOnly.passed) {
      limitations.push(
        `The original retained-only tests did not pass${baselineRetainedOnly.limitation === null ? "." : `: ${baselineRetainedOnly.limitation}.`}`,
      );
    }

    let sourceUnchanged = false;
    try {
      const endFingerprint = await fingerprintDiff(
        await snapshotRepository(input.repositoryRoot),
      );
      sourceUnchanged = endFingerprint.fingerprint === input.sourceFingerprint;
    } catch (error) {
      limitations.push(
        `The source repository fingerprint could not be checked after replay: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
    if (
      !sourceUnchanged &&
      !limitations.some((entry) => entry.includes("fingerprint could not"))
    ) {
      limitations.push(
        "The source repository fingerprint changed during current-suite reverse-patch replay; no signal was accepted.",
      );
    }

    const allPreserved =
      baselineCandidateOnly.passed &&
      baselineRetainedOnly.passed &&
      faultResults.length === faults.length &&
      faultResults.every((fault) => fault.preserved_by_replacement) &&
      sourceUnchanged;
    const preservedCount = faultResults.filter(
      (fault) => fault.preserved_by_replacement,
    ).length;
    const counterfactualStatus = allPreserved
      ? "passed"
      : preservedCount > 0
        ? "partial"
        : "failed";
    const obligationIds = allPreserved
      ? unique(faults.flatMap((fault) => fault.obligationIds)).sort()
      : [];
    const summary = allPreserved
      ? `Current-suite reverse-patch replay showed that excluded candidate-only tests (${candidateOnly.join(", ")}) and retained-only tests (${retainedOnly.join(", ")}) detected the same normalized predeclared signal for all ${faults.length} candidate-bound fault(s); the source repository stayed unchanged.`
      : `Current-suite reverse-patch replay preserved ${preservedCount} of ${faults.length} candidate-bound fault(s); evidence was insufficient and the candidate was not promoted.`;
    const findings = [
      ...faultResults.map((fault) => ({
        code: fault.preserved_by_replacement
          ? "CANDIDATE_FAULT_PRESERVED"
          : fault.source_binding.passed
            ? "CANDIDATE_FAULT_NOT_PRESERVED"
            : "CANDIDATE_FAULT_UNBOUND",
        summary: fault.preserved_by_replacement
          ? `Fault ${fault.id} matched one shared predeclared observable failure signature in candidate-only and retained-only runs.`
          : fault.source_binding.passed
            ? `Fault ${fault.id} did not establish one shared predeclared observable failure signature in both candidate groups.`
            : `Fault ${fault.id} was not directly source-bound to both candidate groups.`,
        paths: [...fault.source_paths],
      })),
      {
        code: sourceUnchanged ? "SOURCE_UNCHANGED" : "SOURCE_CHANGED",
        summary: sourceUnchanged
          ? "The source repository fingerprint was unchanged after replay."
          : "The source repository fingerprint was not unchanged after replay.",
        paths: [],
      },
    ];
    const evidence = {
      schema_version: "1.0",
      id: signalId,
      kind: "historical_fault",
      status: allPreserved
        ? "observed"
        : preservedCount > 0
          ? "partial"
          : "failed",
      source: {
        tool: "detestify current-suite reverse-patch replay",
        version: CLI_VERSION,
        path: manifest.relativePath,
        command_fingerprint: input.sourceFingerprint,
        observed_at: input.observedAt,
      },
      findings,
      data: {
        manifest_version: manifest.version,
        candidate_id: input.candidateId,
        protocol: {
          name: "candidate-bound-current-suite-reverse-patch",
          max_faults: MAX_FAULTS,
          per_run_timeout_ms: RUN_TIMEOUT_MS,
          total_runner_budget_ms: REPLAY_RUN_BUDGET_MS,
          source_binding: "direct-import",
          candidate_selection: "exact-selected-files",
          failure_equivalence:
            "single-normalized-headline-bound-to-predeclared-observable",
        },
        candidate_only_test_paths: candidateOnly,
        retained_only_test_paths: retainedOnly,
        baseline: {
          candidate_only: baselineCandidateOnly,
          retained_only: baselineRetainedOnly,
        },
        faults: faultResults,
        source_unchanged: sourceUnchanged,
      },
      gate_trust: allPreserved ? "eligible" : "advisory_only",
      limitations: unique(limitations),
    };
    result = {
      passed: allPreserved,
      signalId,
      obligationIds,
      summary,
      limitations: unique(limitations),
      counterfactualStatus,
      worktreeStatus: counterfactualStatus,
      evidence,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return result;
}
