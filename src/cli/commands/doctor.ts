import { access, lstat, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { formatSchemaErrors, getValidator } from "../../core/schemas/index.js";
import { repositoryStateDirectory } from "../../security/state.js";
import { writeJsonReport } from "../output.js";
import { CLI_VERSION } from "../version.js";

interface DoctorOptions {
  readonly repo?: string;
  readonly config?: string;
  readonly report?: string;
  readonly json?: string;
}

interface CheckData {
  readonly check: string;
  readonly status: "pass" | "advice" | "unavailable";
  readonly detail: string;
  readonly blocking?: boolean;
}

interface GitSnapshot {
  readonly head: string | null;
  readonly status: string;
}

const supportedPlatforms = new Set(["darwin", "linux"]);
const hostStateLimitation =
  "Doctor checks packaged plugin contents only; installed, enabled, and trusted host state remains unverified.";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(start: string): Promise<string | null> {
  let current: string;
  try {
    current = await realpath(start);
  } catch {
    return null;
  }

  while (true) {
    const gitMarker = path.join(current, ".git");
    if (await pathExists(gitMarker)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function canonicalContainedPath(
  repositoryRoot: string,
  requestedPath: string,
): Promise<string> {
  const root = await realpath(repositoryRoot);
  const resolved = await realpath(path.resolve(root, requestedPath));
  const relative = path.relative(root, resolved);
  if (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  ) {
    return resolved;
  }
  throw new Error(`Path escapes repository root: ${requestedPath}`);
}

async function readInertConfig(
  repositoryRoot: string,
  configPath: string,
): Promise<{
  readonly relative: string;
  readonly repositoryCommandsTrusted: boolean;
}> {
  const contained = await canonicalContainedPath(repositoryRoot, configPath);
  const stat = await lstat(contained);
  if (!stat.isFile()) {
    throw new Error(`Configuration is not a regular file: ${configPath}`);
  }
  if (stat.size > 1_048_576) {
    throw new Error(`Configuration exceeds 1 MiB: ${configPath}`);
  }
  if (path.extname(contained) !== ".json") {
    throw new Error("M0 doctor accepts inert JSON configuration only.");
  }

  const source = await readFile(contained, "utf8");
  const document: unknown = JSON.parse(source);
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new Error(
      `Configuration failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }
  const config = document as {
    trusted_operations: {
      run_repository_commands: boolean;
      evaluate_repository_config: boolean;
      network_access: boolean;
    };
  };
  const trusted = config.trusted_operations;
  return {
    relative: path.relative(repositoryRoot, contained),
    repositoryCommandsTrusted:
      trusted.run_repository_commands &&
      trusted.evaluate_repository_config &&
      trusted.network_access,
  };
}

function runVersion(executable: string): string | null {
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 2_000,
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.status !== 0) {
    return null;
  }
  const version = result.stdout.trim();
  return version === "" ? null : version;
}

async function packageRoot(): Promise<string | null> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.resolve(here, "../../.."),
    path.resolve(here, "../../../.."),
  ]) {
    if (await pathExists(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

async function packagedPluginCheck(
  root: string | null,
  host: "claude" | "openai",
): Promise<CheckData> {
  const label =
    host === "claude" ? "claude_plugin_package" : "codex_plugin_package";
  const hostName = host === "claude" ? "Claude" : "Codex";
  if (root === null) {
    return {
      check: label,
      status: "unavailable",
      detail: `The package root could not be resolved; ${hostName} plugin package contents are unverified.`,
    };
  }
  const plugin = path.join(root, "plugins", host);
  const manifest = path.join(
    plugin,
    host === "claude"
      ? ".claude-plugin/plugin.json"
      : ".codex-plugin/plugin.json",
  );
  const launcher = path.join(plugin, "bin", "detestify-hook");
  const runtime = path.join(plugin, "runtime", "entry.js");
  try {
    const parsed = JSON.parse(await readFile(manifest, "utf8")) as {
      name?: unknown;
      hooks?: unknown;
    };
    const launcherStat = await lstat(launcher);
    const runtimeStat = await lstat(runtime);
    if (
      parsed.name !== "detestify" ||
      parsed.hooks !== (host === "claude" ? undefined : "./hooks/hooks.json") ||
      !launcherStat.isFile() ||
      (launcherStat.mode & 0o111) === 0 ||
      !runtimeStat.isFile()
    ) {
      throw new Error(
        "manifest, executable launcher, or plugin-local runtime is invalid",
      );
    }
    return {
      check: label,
      status: "pass",
      detail: `${hostName} plugin package contents are present (${path.relative(root, runtime)}; manifest and executable launcher).`,
    };
  } catch (error) {
    return {
      check: label,
      status: "unavailable",
      detail: `${hostName} plugin package content check failed for ${path.relative(root, runtime)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function readGitSnapshot(repositoryRoot: string): GitSnapshot {
  const environment = {
    PATH: process.env.PATH ?? "",
    GIT_OPTIONAL_LOCKS: "0",
  };
  const run = (arguments_: readonly string[]) =>
    spawnSync(
      "git",
      ["-c", "core.fsmonitor=false", "-C", repositoryRoot, ...arguments_],
      {
        encoding: "utf8",
        shell: false,
        timeout: 2_000,
        env: environment,
      },
    );
  const headResult = run(["rev-parse", "--verify", "HEAD"]);
  const statusResult = run([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  return {
    head: headResult.status === 0 ? headResult.stdout.trim() : null,
    status: statusResult.status === 0 ? statusResult.stdout : "",
  };
}

function operationalDecision(checks: readonly CheckData[]) {
  const issues = checks.filter((check) => check.status !== "pass");
  const blockingIssues = issues.filter((check) => check.blocking !== false);
  const summary =
    blockingIssues.length === 0 && issues.length === 0
      ? "Doctor found no compatibility problems."
      : blockingIssues.length === 0
        ? `Doctor found ${issues.length} optional capability limitation${issues.length === 1 ? "" : "s"}; the core CLI is ready.`
        : `Doctor found ${blockingIssues.length} compatibility limitation${blockingIssues.length === 1 ? "" : "s"}.`;
  return {
    schema_version: "1.0",
    id: "doctor-operational-status",
    domain: "change",
    outcome:
      blockingIssues.length === 0
        ? "NO_TEST_SUPPORTED"
        : "INSUFFICIENT_EVIDENCE",
    gate_action: blockingIssues.length === 0 ? "allow" : "advise",
    confidence: "high",
    reason_code:
      blockingIssues.length === 0 ? "DOCTOR_COMPATIBLE" : "DOCTOR_LIMITATIONS",
    summary,
    rationale:
      issues.length === 0
        ? "Local platform, Node, Git, packaged schemas, and requested inert configuration checks passed."
        : issues.map((issue) => `${issue.check}: ${issue.detail}`).join(" "),
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: ["doctor-environment"],
    target: {
      scope: "static",
      purpose: "compatibility",
      technique: "existing_evidence",
      cadence: "completion",
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
    limitations: issues.map((issue) => issue.detail),
  } as const;
}

export async function runDoctor(options: DoctorOptions): Promise<unknown> {
  const startedAt = process.hrtime.bigint();
  const generatedAt = new Date().toISOString();
  const requestedRepo = options.repo ?? process.cwd();
  const repositoryRoot = await findGitRoot(requestedRepo);
  const gitVersion = runVersion("git");
  const claudeVersion = runVersion("claude");
  const codexVersion = runVersion("codex");
  const bundledRoot = await packageRoot();
  const checks: CheckData[] = [
    {
      check: "platform",
      status: supportedPlatforms.has(process.platform) ? "pass" : "advice",
      detail: supportedPlatforms.has(process.platform)
        ? `${process.platform} is supported for alpha.`
        : `${process.platform} is not a supported alpha platform.`,
    },
    {
      check: "node",
      status:
        Number(process.versions.node.split(".")[0]) > 22 ||
        (Number(process.versions.node.split(".")[0]) === 22 &&
          Number(process.versions.node.split(".")[1]) >= 13)
          ? "pass"
          : "advice",
      detail: `Node ${process.versions.node}; package baseline is >=22.13.0.`,
    },
    {
      check: "git",
      status: gitVersion === null ? "unavailable" : "pass",
      detail: gitVersion === null ? "Git is unavailable." : gitVersion,
    },
    {
      check: "repository",
      status: repositoryRoot === null ? "advice" : "pass",
      detail:
        repositoryRoot === null
          ? `No Git repository contains ${path.resolve(requestedRepo)}.`
          : repositoryRoot,
    },
    {
      check: "schemas",
      status: "pass",
      detail: "Packaged runtime schemas loaded and compiled.",
    },
    {
      check: "network",
      status: "pass",
      detail: "Doctor performed no network access.",
    },
    {
      check: "repository_code",
      status: "pass",
      detail: "Doctor executed no repository code or package scripts.",
    },
    {
      check: "claude_executable",
      status: claudeVersion === null ? "advice" : "pass",
      detail:
        claudeVersion === null
          ? "Claude CLI is unavailable; Claude host integration cannot launch."
          : claudeVersion,
      blocking: false,
    },
    {
      check: "codex_executable",
      status: codexVersion === null ? "advice" : "pass",
      detail:
        codexVersion === null
          ? "Codex CLI is unavailable; Codex host integration cannot launch."
          : codexVersion,
      blocking: false,
    },
    {
      check: "host_state",
      status: "advice",
      detail: hostStateLimitation,
      blocking: false,
    },
  ];

  checks.push(
    await packagedPluginCheck(bundledRoot, "claude"),
    await packagedPluginCheck(bundledRoot, "openai"),
  );

  if (repositoryRoot === null) {
    checks.push({
      check: "state_directory",
      status: "advice",
      detail:
        "External state safety was not checked because no repository root was found.",
    });
  } else {
    try {
      checks.push({
        check: "state_directory",
        status: "pass",
        detail: `External state resolves outside the repository: ${repositoryStateDirectory(repositoryRoot)}.`,
      });
    } catch (error) {
      checks.push({
        check: "state_directory",
        status: "unavailable",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await getValidator("report.schema.json");

  let configRelative: string | null = null;
  if (options.config !== undefined) {
    if (repositoryRoot === null) {
      checks.push({
        check: "config",
        status: "advice",
        detail:
          "Configuration was not read because no repository root was found.",
      });
    } else {
      const config = await readInertConfig(repositoryRoot, options.config);
      configRelative = config.relative;
      checks.push({
        check: "trust_config",
        status: "pass",
        detail: `Validated explicit inert configuration ${configRelative}; repository commands are ${
          config.repositoryCommandsTrusted ? "trusted" : "not trusted"
        }.`,
      });
    }
  } else {
    checks.push({
      check: "trust_config",
      status: "advice",
      detail:
        "No explicit configuration was supplied; repository commands remain untrusted.",
      blocking: false,
    });
  }

  const repository = repositoryRoot ?? path.resolve(requestedRepo);
  const gitSnapshot =
    repositoryRoot === null || gitVersion === null
      ? { head: null, status: "" }
      : readGitSnapshot(repositoryRoot);
  const decision = operationalDecision(checks);
  const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  const report = {
    schema_version: "1.0",
    report_id: randomUUID(),
    command: "doctor",
    generated_at: generatedAt,
    repository: {
      root: repository,
      base_revision: null,
      head_revision: gitSnapshot.head,
      diff_fingerprint: `sha256:${createHash("sha256")
        .update(repository)
        .update("\0")
        .update(gitSnapshot.head ?? "")
        .update("\0")
        .update(gitSnapshot.status)
        .digest("hex")}`,
      dirty: gitSnapshot.status !== "",
    },
    change: {
      classes: ["configuration"],
      confidence: "high",
      changed_paths: [],
      test_paths: [],
    },
    capabilities: {
      runner: "none",
      ast: "unavailable",
      coverage: "not_requested",
      mutation: "not_requested",
      repository_commands_trusted: false,
      network_used: false,
    },
    obligation_candidates: [],
    evidence: [
      {
        schema_version: "1.0",
        id: "doctor-environment",
        kind: "capability",
        status: "observed",
        source: {
          tool: "test-steward doctor",
          version: CLI_VERSION,
          path: configRelative,
          command_fingerprint: null,
          observed_at: generatedAt,
        },
        findings: checks.map((check) => ({
          code: `DOCTOR_${check.check.toUpperCase()}`,
          summary: check.detail,
          paths: [],
        })),
        data: {
          platform: process.platform,
          architecture: process.arch,
          operating_system: `${os.type()} ${os.release()}`,
          node: process.versions.node,
          git: gitVersion,
          claude: claudeVersion,
          codex: codexVersion,
          checks,
        },
        gate_trust: "advisory_only",
        limitations: decision.limitations,
      },
    ],
    decisions: [decision],
    limitations: [
      "Doctor did not execute repository commands or inspect executable configuration.",
      ...decision.limitations,
    ],
    timing: {
      elapsed_ms: elapsedMs,
      phases: { environment_checks: elapsedMs },
    },
  };

  const validate = await getValidator("report.schema.json");
  if (!validate(report)) {
    throw new Error(
      `Doctor report failed schema validation: ${formatSchemaErrors(validate.errors)}`,
    );
  }

  if (options.report !== undefined) {
    await writeJsonReport(options.report, report);
  }
  if (options.json !== undefined && options.json !== "-") {
    await writeJsonReport(options.json, report);
  }

  return report;
}
