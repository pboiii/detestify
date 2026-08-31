// `inventory` command (M8): deterministic, read-only inventory of the
// repository's test portfolio — suites, test files, imports, and framework
// (runner) markers — emitted as a report.schema.json envelope. Also hosts the
// small helpers the other M8 portfolio commands (audit, cleanup-plan) share:
// repository context loading, inert config reading, envelope assembly, and
// report emission.

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { CommanderError } from "commander";
import { EXIT_CODES, type ExitCode } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";
import { writeJsonReport } from "../output.js";
import { CLI_VERSION } from "../version.js";
import {
  GitError,
  snapshotRepository,
  type RepositorySnapshot,
} from "../../repository/git.js";
import {
  fingerprintDiff,
  type DiffFingerprint,
} from "../../repository/fingerprint.js";
import {
  discoverRepositoryShape,
  listRepositoryFiles,
  type RepositoryShape,
} from "../../repository/discovery.js";
import { realpathContained } from "../../repository/paths.js";
import {
  analyzeTests,
  type SuiteNode,
  type TestInventory,
} from "../../analysis/tests.js";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import type { ConfigProtectedTest } from "../../cleanup/protection.js";

export { CLI_VERSION };

/**
 * Throw with an explicit exit code. `main.ts` passes `exitCode` through only
 * for CommanderErrors carrying this code string.
 */
export function fail(exitCode: ExitCode, message: string): never {
  process.stderr.write(`${message}\n`);
  throw new CommanderError(exitCode, "detestify.notImplemented", message);
}

export interface LoadedConfig {
  /** Repository-relative config path, or null when no config was supplied. */
  readonly path: string | null;
  readonly protectedTests: readonly ConfigProtectedTest[];
  readonly allowDeleteCandidates: boolean;
}

const NO_CONFIG: LoadedConfig = {
  path: null,
  protectedTests: [],
  allowDeleteCandidates: true,
};

/** Read and validate an inert JSON configuration (config.schema.json). */
export async function loadInertConfig(
  repositoryRoot: string,
  configPath: string | undefined,
): Promise<LoadedConfig> {
  if (configPath === undefined) {
    return NO_CONFIG;
  }
  const root = await realpath(repositoryRoot);
  const requested = await realpath(path.resolve(root, configPath));
  const relative = path.relative(root, requested);
  const contained = await realpathContained(root, relative);
  const stat = await lstat(contained);
  if (!stat.isFile()) {
    throw new Error(`Configuration is not a regular file: ${configPath}`);
  }
  if (stat.size > 1_048_576) {
    throw new Error(`Configuration exceeds 1 MiB: ${configPath}`);
  }
  if (path.extname(contained) !== ".json") {
    throw new Error(
      `Configuration must be inert JSON (.json only): ${configPath}`,
    );
  }
  const document: unknown = JSON.parse(await readFile(contained, "utf8"));
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new Error(
      `Configuration failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
  const config = document as {
    protected_tests?: readonly ConfigProtectedTest[];
    policy?: { allow_delete_candidates?: boolean };
  };
  return {
    path: path.relative(repositoryRoot, contained),
    protectedTests: config.protected_tests ?? [],
    allowDeleteCandidates: config.policy?.allow_delete_candidates ?? true,
  };
}

export interface RepoContext {
  readonly snapshot: RepositorySnapshot;
  readonly diff: DiffFingerprint;
  /** Full repository file universe (sorted, .git and node_modules excluded). */
  readonly files: readonly string[];
  readonly shape: RepositoryShape;
  readonly config: LoadedConfig;
}

/** Resolve the repository, fingerprint its diff, and discover its shape. */
export async function loadRepoContext(
  options: CommandOptions,
): Promise<RepoContext> {
  let snapshot: RepositorySnapshot;
  try {
    snapshot = await snapshotRepository(options.repo ?? process.cwd());
  } catch (error) {
    if (error instanceof GitError && error.code === "NOT_A_REPOSITORY") {
      fail(EXIT_CODES.REPOSITORY_NOT_FOUND, error.message);
    }
    throw error;
  }
  const diff = await fingerprintDiff(snapshot);
  const files = await listRepositoryFiles(snapshot.root);
  const shape = await discoverRepositoryShape(snapshot.root, files);
  const config = await loadInertConfig(snapshot.root, options.config);
  return { snapshot, diff, files, shape, config };
}

export function deterministicReportId(
  command: string,
  ctx: RepoContext,
): string {
  const digest = createHash("sha256")
    .update(ctx.snapshot.root)
    .update("\0")
    .update(ctx.diff.fingerprint)
    .digest("hex")
    .slice(0, 12);
  return `report-${command}-${digest}`;
}

export interface EnvelopeInput {
  readonly command: "inventory" | "audit" | "cleanup-plan";
  readonly ctx: RepoContext;
  readonly generatedAt: string;
  readonly ast: "type_resolved" | "syntactic_only" | "unavailable";
  readonly evidence: readonly unknown[];
  readonly decisions: readonly unknown[];
  readonly limitations: readonly string[];
  readonly elapsedMs: number;
  readonly phases: Readonly<Record<string, number>>;
}

/** Assemble the shared report.schema.json envelope for a portfolio command. */
export function buildReportEnvelope(
  input: EnvelopeInput,
): Record<string, unknown> {
  const { ctx } = input;
  return {
    schema_version: "1.0",
    report_id: deterministicReportId(input.command, ctx),
    command: input.command,
    generated_at: input.generatedAt,
    repository: {
      root: ctx.snapshot.root,
      base_revision: ctx.snapshot.baseRevision,
      head_revision: ctx.snapshot.headRevision,
      diff_fingerprint: ctx.diff.fingerprint,
      dirty: ctx.snapshot.dirty,
    },
    // Portfolio commands analyze the test portfolio, not a diff; the subject
    // class is test_only and test_paths carry the discovered test files.
    change: {
      classes: ["test_only"],
      confidence: "high",
      changed_paths: ctx.snapshot.changedFiles.map((file) => file.path),
      test_paths: [...ctx.shape.testFiles],
    },
    capabilities: {
      runner: ctx.shape.runner,
      ast: input.ast,
      coverage: "not_requested",
      mutation: "not_requested",
      repository_commands_trusted: false,
      network_used: false,
    },
    obligation_candidates: [],
    evidence: [...input.evidence],
    decisions: [...input.decisions],
    limitations: [...new Set(input.limitations)],
    timing: { elapsed_ms: input.elapsedMs, phases: { ...input.phases } },
  };
}

/** Validate a report against report.schema.json or exit SCHEMA_CONTRACT_ERROR. */
export async function validateReport(report: unknown): Promise<void> {
  const validate = await getValidator("report.schema.json");
  if (!validate(report)) {
    fail(
      EXIT_CODES.SCHEMA_CONTRACT_ERROR,
      `Report failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
}

/**
 * Validate, then emit the report: `--report`/`--json <path>` write the report
 * JSON atomically; `--json -` puts JSON alone on stdout with human status on
 * stderr; otherwise the human summary goes to stdout.
 */
export async function finishReport(
  options: CommandOptions,
  report: Record<string, unknown>,
  humanLines: readonly string[],
): Promise<void> {
  await validateReport(report);
  if (options.report !== undefined) {
    await writeJsonReport(options.report, report);
  }
  if (options.json !== undefined && options.json !== "-") {
    await writeJsonReport(options.json, report);
  }
  const human = `${humanLines.join("\n")}\n`;
  if (options.json === "-") {
    process.stderr.write(human);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    process.stdout.write(human);
  }
}

export function countSuiteNodes(nodes: readonly SuiteNode[]): {
  suites: number;
  tests: number;
} {
  let suites = 0;
  let tests = 0;
  for (const node of nodes) {
    if (node.kind === "suite") {
      suites += 1;
      const nested = countSuiteNodes(node.children);
      suites += nested.suites;
      tests += nested.tests;
    } else {
      tests += 1;
    }
  }
  return { suites, tests };
}

function inventoryEvidence(
  ctx: RepoContext,
  tests: TestInventory,
  generatedAt: string,
): unknown[] {
  const source = {
    tool: "test-steward inventory",
    version: CLI_VERSION,
    path: null,
    command_fingerprint: ctx.diff.fingerprint,
    observed_at: generatedAt,
  };
  return [
    {
      schema_version: "1.0",
      id: "ev-runner-inventory",
      kind: "runner_inventory",
      status: "observed",
      source,
      findings: [
        {
          code: "RUNNER_DETECTED",
          summary: `Detected runner: ${ctx.shape.runner}.`,
          paths: [],
        },
        ...ctx.shape.runnerMarkers.map((marker) => ({
          code: "RUNNER_MARKER",
          summary: `${marker.runner} ${marker.kind} marker${
            marker.executable
              ? " (executable config, present but not read)"
              : ""
          }.`,
          paths: [marker.path],
        })),
      ],
      data: {
        runner: ctx.shape.runner,
        markers: ctx.shape.runnerMarkers,
        manifests: ctx.shape.manifests,
      },
      gate_trust: "advisory_only",
      limitations: [...ctx.shape.limitations],
    },
    {
      schema_version: "1.0",
      id: "ev-test-inventory",
      kind: "ast_fact",
      status: tests.unreadableFiles.length === 0 ? "observed" : "partial",
      source,
      findings: tests.testFiles.map((file) => {
        const counts = countSuiteNodes(file.suites);
        return {
          code: "TEST_FILE",
          summary: `${counts.suites} suite(s), ${counts.tests} test(s), ${file.assertions} assertion(s); snapshots: ${file.usesSnapshots}, mocks: ${file.usesMocks}.`,
          paths: [file.file],
        };
      }),
      data: {
        test_files: tests.testFiles.map((file) => ({
          file: file.file,
          ...countSuiteNodes(file.suites),
          suite_tree: file.suites,
          assertions: file.assertions,
          uses_snapshots: file.usesSnapshots,
          uses_mocks: file.usesMocks,
          imports: file.imports.map((edge) => ({
            specifier: edge.specifier,
            to: edge.to,
            resolution: edge.resolution,
          })),
        })),
        source_files: ctx.shape.sourceFiles,
        unreadable_files: tests.unreadableFiles,
      },
      gate_trust: "advisory_only",
      limitations: tests.unreadableFiles.map(
        (file) =>
          `Test file ${file} matched a test convention but could not be read.`,
      ),
    },
    {
      schema_version: "1.0",
      id: "ev-inventory-capabilities",
      kind: "capability",
      status: "observed",
      source,
      findings: [
        {
          code: "ZERO_CONFIG_READ_ONLY",
          summary:
            "Inventory read repository files inertly; no repository code, package scripts, or network access were used.",
          paths: [],
        },
      ],
      data: {
        ast: "syntactic_only",
        node: process.versions.node,
        platform: process.platform,
      },
      gate_trust: "advisory_only",
      limitations: [],
    },
  ];
}

export async function run(options: CommandOptions): Promise<void> {
  const started = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const ctx = await loadRepoContext(options);
  const snapshotMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const tests = await analyzeTests({
    repoRoot: ctx.snapshot.root,
    files: ctx.files,
  });
  const elapsedMs = Number((process.hrtime.bigint() - started) / 1_000_000n);

  const totals = tests.testFiles.reduce(
    (sum, file) => {
      const counts = countSuiteNodes(file.suites);
      return {
        suites: sum.suites + counts.suites,
        tests: sum.tests + counts.tests,
      };
    },
    { suites: 0, tests: 0 },
  );
  const summary = `Inventory found ${tests.testFiles.length} test file(s) (${totals.suites} suite(s), ${totals.tests} test(s)), ${ctx.shape.sourceFiles.length} source file(s); runner: ${ctx.shape.runner}.`;
  const decision = {
    schema_version: "1.0",
    id: "inventory-summary",
    domain: "change",
    outcome: "NO_TEST_SUPPORTED",
    gate_action: "allow",
    confidence: "high",
    reason_code: "INVENTORY_COMPLETE",
    summary,
    rationale:
      "The inventory enumerates suites, test files, imports, and framework markers from inert repository reads only; it requests no test and gates nothing.",
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: [
      "ev-runner-inventory",
      "ev-test-inventory",
      "ev-inventory-capabilities",
    ],
    target: {
      scope: null,
      purpose: null,
      technique: null,
      cadence: null,
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
    limitations: [],
  };

  const report = buildReportEnvelope({
    command: "inventory",
    ctx,
    generatedAt,
    ast: "syntactic_only",
    evidence: inventoryEvidence(ctx, tests, generatedAt),
    decisions: [decision],
    limitations: [
      "Inventory is read-only: no repository code, package scripts, or executable configuration were run.",
      ...ctx.shape.limitations,
      ...tests.unreadableFiles.map(
        (file) =>
          `Test file ${file} matched a test convention but could not be read.`,
      ),
    ],
    elapsedMs,
    phases: { repository: snapshotMs, analysis: elapsedMs - snapshotMs },
  });

  const humanLines = [summary];
  if (options.report !== undefined) {
    humanLines.push(`Report: ${options.report}`);
  }
  if (options.json !== undefined && options.json !== "-") {
    humanLines.push(`JSON: ${options.json}`);
  }
  await finishReport(options, report, humanLines);
}
