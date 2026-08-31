import { spawn } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Host = "claude" | "codex";
type Arm = "baseline" | "full";
type TaskName = "docs" | "bug" | "type-only" | "pagination";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPOSITORIES = {
  pathToRegexp: "https://github.com/pillarjs/path-to-regexp.git",
  browserOs: "https://github.com/browseros-ai/BrowserOS.git",
} as const;
const MAX_RUNS = 16;
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

const TASKS: Readonly<
  Record<
    TaskName,
    {
      readonly base: string;
      readonly acceptedFix: string;
      readonly prompt: string;
      readonly repository: string;
      readonly cwd?: string;
    }
  >
> = {
  docs: {
    repository: REPOSITORIES.pathToRegexp,
    base: "34cb451ddaeea4783a2fe60579ffb3e4ccfc73a7",
    acceptedFix: "1e796b51fd86c12cf23847523f86f7a7c7a134be",
    prompt:
      "Correct the README's TokenData and custom-path example so it agrees with the current public token schema and the actual result returned by match. Keep this documentation-only. Do not change implementation, package metadata, declarations, or tests. Use any installed project testing guidance, inspect the repository, make the change, and verify it.",
  },
  bug: {
    repository: REPOSITORIES.pathToRegexp,
    base: "7f058760ae0867fdd75e5ed07d7096f782c1f752",
    acceptedFix: "9a788793e7eeb0ccf9c53c1cb54d297b5badfcc3",
    prompt:
      "Fix the parser bug where a path ending in a backslash is accepted instead of rejected. Add the smallest regression evidence at the existing test boundary. Do not change package metadata or unrelated behavior. Use any installed project testing guidance, make the change, and verify it.",
  },
  "type-only": {
    repository: REPOSITORIES.browserOs,
    cwd: "packages/browseros-agent",
    base: "f48070a8694b3027dd1e7189f8b09f3eb4a2d97d",
    acceptedFix: "412e397a430c23da7aefcf7fbfa00aba51a3fa8c",
    prompt:
      "Inline the private ConversationSavePlan and ConversationUploadSchedulerOptions object shapes into their exported function signatures, then remove those two named interfaces. Preserve all runtime behavior and public function signatures. Use any installed project testing guidance, make the smallest change, and verify it appropriately.",
  },
  pagination: {
    repository: REPOSITORIES.browserOs,
    cwd: "packages/browseros-agent",
    base: "af6a34baed5397d113f7c4efe41a371544b4c5d3",
    acceptedFix: "4df440d2bfde7c79748e9868bf5f1a83a1e2c418",
    prompt:
      "Fix listTasks cursor pagination so sessions with dispatch rows on both sides of the cursor are not returned again with truncated aggregates. The cursor is the session's maximum dispatch id. Add the smallest necessary regression evidence. Use any installed project testing guidance, make the smallest change, and verify it.",
  },
};

interface ProcessResult {
  readonly exitCode: number;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly timedOut: boolean;
  readonly wallMs: number;
}

interface Score {
  readonly passed: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
}

interface RunResult {
  readonly host: Host;
  readonly arm: Arm;
  readonly task: TaskName;
  readonly order: number;
  readonly base_sha: string;
  readonly accepted_fix_sha: string;
  readonly final_sha: string;
  readonly changed_paths: readonly string[];
  readonly added_lines: number;
  readonly deleted_lines: number;
  readonly changed_test_paths: readonly string[];
  readonly agent_exit_code: number;
  readonly timed_out: boolean;
  readonly wall_ms: number;
  readonly model: string;
  readonly auth_mode: "subscription";
  readonly hook_trust_mode:
    | "none"
    | "host-session"
    | "automation-vetted-bypass";
  readonly hook_invocations: number;
  readonly hook_events: readonly string[];
  readonly hook_actions: readonly string[];
  readonly hook_reason_codes: readonly string[];
  readonly hook_remediation_requests: number;
  readonly hook_one_shot_downgrades: number;
  readonly score: Score;
  readonly cost: null;
  readonly error: string | null;
}

function parseChoice<T extends string>(
  args: readonly string[],
  flag: string,
  allowed: readonly T[],
  fallback: T | "all",
): T | "all" {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (value === "all" || allowed.includes(value as T))
    return value as T | "all";
  throw new Error(`${flag} must be one of: all, ${allowed.join(", ")}`);
}

function selected<T>(value: T | "all", all: readonly T[]): readonly T[] {
  return value === "all" ? all : [value];
}

function subscriptionEnvironment(
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  for (const key of [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "AZURE_OPENAI_API_KEY",
  ]) {
    delete env[key];
  }
  return env;
}

async function runProcess(input: {
  readonly file: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdin?: string;
  readonly timeoutMs?: number;
}): Promise<ProcessResult> {
  const started = Date.now();
  return await new Promise((resolve, reject) => {
    const child = spawn(input.file, [...input.args], {
      cwd: input.cwd,
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdoutTail = "";
    let stderrTail = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, input.timeoutMs ?? RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString("utf8")).slice(-16_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-16_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdoutTail,
        stderrTail,
        timedOut,
        wallMs: Date.now() - started,
      });
    });
    if (input.stdin !== undefined) child.stdin.end(input.stdin);
    else child.stdin.end();
  });
}

async function mustRun(
  file: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const result = await runProcess({
    file,
    args,
    cwd,
    ...(env === undefined ? {} : { env }),
    timeoutMs: 180_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${file} ${args.join(" ")} failed: ${result.stderrTail.slice(-2_000)}`,
    );
  }
}

async function commandText(
  file: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${file} failed: ${stderr.slice(-2_000)}`));
    });
  });
}

async function changedPaths(
  workspace: string,
  base: string,
): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    commandText("git", ["diff", "--name-only", "--relative", base], workspace),
    commandText(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      workspace,
    ),
  ]);
  return [
    ...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean)),
  ].sort();
}

async function numstat(
  workspace: string,
  base: string,
): Promise<{ added: number; deleted: number }> {
  const output = await commandText(
    "git",
    ["diff", "--numstat", "--relative", base],
    workspace,
  );
  let added = 0;
  let deleted = 0;
  for (const line of output.trim().split(/\r?\n/)) {
    if (line === "") continue;
    const [left, right] = line.split("\t");
    if (left !== "-") added += Number(left);
    if (right !== "-") deleted += Number(right);
  }
  return { added, deleted };
}

function isTestPath(file: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(
    file,
  );
}

async function runVisibleSuite(workspace: string): Promise<boolean> {
  const result = await runProcess({
    file: process.execPath,
    args: [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--no-coverage",
      "src/index.spec.ts",
    ],
    cwd: workspace,
    timeoutMs: 180_000,
  });
  return result.exitCode === 0;
}

async function runBunSuite(
  workspace: string,
  testFiles: readonly string[],
): Promise<boolean> {
  const result = await runProcess({
    file: "bun",
    args: ["test", ...testFiles],
    cwd: workspace,
    timeoutMs: 180_000,
  });
  return result.exitCode === 0;
}

async function scoreDocs(
  workspace: string,
  paths: readonly string[],
): Promise<Score> {
  const readme = await readFile(path.join(workspace, "Readme.md"), "utf8");
  const checks = {
    only_readme_changed: paths.length === 1 && paths[0] === "Readme.md",
    token_kind_is_param:
      /types?[^\n]*`text`[^\n]*`param`[^\n]*`wildcard`[^\n]*`group`/i.test(
        readme,
      ) && !/types?[^\n]*`parameter`/i.test(readme),
    custom_token_uses_param:
      /\{\s*type:\s*["']param["'],\s*name:\s*["']foo["']\s*\}/.test(readme),
    match_result_is_current:
      /fn\(["']\/test["']\)[^\n]*path[^\n]*params/.test(readme) &&
      !/fn\(["']\/test["']\)[^\n]*index/.test(readme),
    existing_suite_passes: await runVisibleSuite(workspace),
    no_test_changed: !paths.some(isTestPath),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

const HIDDEN_BUG_TEST = `import { describe, expect, it } from "vitest";
import { PathError, parse } from "./index.js";

describe("trailing backslash regression", () => {
  for (const input of ["/foo\\\\", "/foo/{bar\\\\", "/foo/:bar\\\\", "/foo/*bar\\\\", '/foo/:"bar\\\\']) {
    it(input, () => {
      expect(() => parse(input)).toThrow(PathError);
    });
  }
});
`;

async function scoreBug(
  workspace: string,
  paths: readonly string[],
): Promise<Score> {
  const hidden = path.join(
    workspace,
    "src",
    ".detestify-canary.hidden.spec.ts",
  );
  await writeFile(hidden, HIDDEN_BUG_TEST, { encoding: "utf8", mode: 0o600 });
  let hiddenPasses = false;
  try {
    const result = await runProcess({
      file: process.execPath,
      args: [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--no-coverage",
        "src/.detestify-canary.hidden.spec.ts",
      ],
      cwd: workspace,
      timeoutMs: 180_000,
    });
    hiddenPasses = result.exitCode === 0;
  } finally {
    await unlink(hidden).catch(() => undefined);
  }
  const checks = {
    source_changed: paths.includes("src/index.ts"),
    regression_at_existing_boundary:
      paths.filter(isTestPath).join("\n") === "src/index.spec.ts",
    package_metadata_unchanged: !paths.includes("package.json"),
    historical_behavior_passes: hiddenPasses,
    existing_suite_passes: await runVisibleSuite(workspace),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

async function scoreTypeOnly(
  workspace: string,
  paths: readonly string[],
): Promise<Score> {
  const expected = [
    "apps/app/lib/conversations/conversation-save.ts",
    "apps/app/lib/conversations/conversation-upload-scheduler.ts",
  ] as const;
  const sources = await Promise.all(
    expected.map((file) => readFile(path.join(workspace, file), "utf8")),
  );
  const checks = {
    only_expected_sources_changed:
      paths.length === expected.length &&
      expected.every((file) => paths.includes(file)),
    helper_types_internal: sources.every(
      (source) =>
        !source.includes("interface ConversationSavePlan") &&
        !source.includes("interface ConversationUploadSchedulerOptions"),
    ),
    no_test_changed: !paths.some(isTestPath),
    existing_suite_passes: await runBunSuite(workspace, [
      expected[0].replace(/\.ts$/, ".test.ts"),
      expected[1].replace(/\.ts$/, ".test.ts"),
    ]),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

async function scorePagination(
  workspace: string,
  paths: readonly string[],
): Promise<Score> {
  const sourcePath = "apps/claw-server/src/services/tasks.ts";
  const testPath = "apps/claw-server/tests/services/tasks.test.ts";
  const [source, test] = await Promise.all([
    readFile(path.join(workspace, sourcePath), "utf8"),
    readFile(path.join(workspace, testPath), "utf8"),
  ]);
  const ownerSuitePasses = await runBunSuite(workspace, [testPath]);
  const baseSource = await commandText(
    "git",
    ["show", `${TASKS.pagination.base}:${TASKS.pagination.cwd}/${sourcePath}`],
    workspace,
  );
  let regressionRejectsBuggyBase = false;
  try {
    await writeFile(path.join(workspace, sourcePath), baseSource, "utf8");
    regressionRejectsBuggyBase = !(await runBunSuite(workspace, [testPath]));
  } finally {
    await writeFile(path.join(workspace, sourcePath), source, "utf8");
  }
  const checks = {
    only_owner_source_and_suite_changed:
      paths.length === 2 &&
      paths.includes(sourcePath) &&
      paths.includes(testPath),
    group_cursor_filter:
      /\.having\([\s\S]*max\([^)]*toolDispatches\.id[^)]*\)[\s\S]*query\.cursor/.test(
        source,
      ) &&
      !/wheres\.push\(lt\(toolDispatches\.id,\s*query\.cursor\)\)/.test(source),
    regression_rejects_buggy_base:
      test.includes("dispatchCount") && regressionRejectsBuggyBase,
    no_new_test_file: paths.filter(isTestPath).join("\n") === testPath,
    owner_suite_passes: ownerSuitePasses,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

async function hookSummary(directory: string): Promise<{
  count: number;
  events: string[];
  actions: string[];
  reasonCodes: string[];
  remediationRequests: number;
  oneShotDowngrades: number;
}> {
  const events: string[] = [];
  const actions: string[] = [];
  const reasonCodes: string[] = [];
  let remediationRequests = 0;
  let oneShotDowngrades = 0;
  async function visit(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const value: unknown = JSON.parse(await readFile(target, "utf8"));
          if (
            typeof value === "object" &&
            value !== null &&
            "recorded_at" in value &&
            "host" in value &&
            "event" in value &&
            typeof (value as { event: unknown }).event === "string"
          ) {
            const receipt = value as {
              event: string;
              action?: unknown;
              reason_code?: unknown;
              one_shot_downgraded?: unknown;
            };
            events.push(receipt.event);
            if (typeof receipt.action === "string") {
              actions.push(receipt.action);
              if (receipt.action === "request_remediation") {
                remediationRequests += 1;
              }
            }
            if (typeof receipt.reason_code === "string") {
              reasonCodes.push(receipt.reason_code);
            }
            if (receipt.one_shot_downgraded === true) {
              oneShotDowngrades += 1;
            }
          }
        } catch {
          // Non-invocation state is not a canary receipt.
        }
      }
    }
  }
  await visit(directory);
  return {
    count: events.length,
    events: [...new Set(events)].sort(),
    actions: [...new Set(actions)].sort(),
    reasonCodes: [...new Set(reasonCodes)].sort(),
    remediationRequests,
    oneShotDowngrades,
  };
}

async function prepareWorkspace(
  runRoot: string,
  task: TaskName,
  host: Host,
  arm: Arm,
): Promise<string> {
  const workspace = path.join(runRoot, `${task}-${host}-${arm}`);
  await mustRun(
    "git",
    ["clone", "--quiet", TASKS[task].repository, workspace],
    runRoot,
  );
  await mustRun("git", ["checkout", "--quiet", TASKS[task].base], workspace);
  await mustRun("git", ["config", "user.name", "Detestify Canary"], workspace);
  await mustRun(
    "git",
    ["config", "user.email", "canary@detestify.local"],
    workspace,
  );
  const taskWorkspace = path.join(workspace, TASKS[task].cwd ?? ".");
  if (TASKS[task].cwd === undefined) {
    await mustRun(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      taskWorkspace,
      subscriptionEnvironment(),
    );
  } else {
    await mustRun(
      "bun",
      ["install", "--ignore-scripts", "--frozen-lockfile"],
      taskWorkspace,
      subscriptionEnvironment(),
    );
  }
  return taskWorkspace;
}

async function installCodexPlugin(
  codexHome: string,
  workspace: string,
): Promise<void> {
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const sourceAuth = path.join(homedir(), ".codex", "auth.json");
  const auth = path.join(codexHome, "auth.json");
  await lstat(sourceAuth);
  await symlink(sourceAuth, auth);
  const env = subscriptionEnvironment({ CODEX_HOME: codexHome });
  await mustRun(
    "codex",
    ["plugin", "marketplace", "add", ROOT, "--json"],
    workspace,
    env,
  );
  await mustRun(
    "codex",
    ["plugin", "add", "detestify@detestify", "--json"],
    workspace,
    env,
  );
}

async function runAgent(
  host: Host,
  arm: Arm,
  task: TaskName,
  workspace: string,
  stateBase: string,
  runRoot: string,
): Promise<{ process: ProcessResult; trust: RunResult["hook_trust_mode"] }> {
  const env = subscriptionEnvironment({ DETESTIFY_STATE_DIR: stateBase });
  if (arm === "full") {
    const toolBin = path.join(runRoot, "bin");
    await mkdir(toolBin, { recursive: true, mode: 0o700 });
    const target = path.join(toolBin, "detestify");
    await unlink(target).catch(() => undefined);
    await symlink(path.join(ROOT, "dist", "bin", "detestify.js"), target);
    env.PATH = `${toolBin}:${env.PATH ?? ""}`;
  }

  if (host === "claude") {
    const args = [
      "-p",
      "--strict-mcp-config",
      "--model",
      "sonnet",
      "--effort",
      "medium",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read,Edit,Write,Bash,Glob,Grep",
      "--tools",
      "Read,Edit,Write,Bash,Glob,Grep",
      "--setting-sources",
      "project",
      "--output-format",
      "stream-json",
      "--include-hook-events",
      "--verbose",
      "--no-session-persistence",
    ];
    if (arm === "full")
      args.push("--plugin-dir", path.join(ROOT, "plugins", "claude"));
    args.push(TASKS[task].prompt);
    return {
      process: await runProcess({ file: "claude", args, cwd: workspace, env }),
      trust: arm === "full" ? "host-session" : "none",
    };
  }

  const codexHome = path.join(runRoot, `codex-home-${task}-${arm}`);
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const sourceAuth = path.join(homedir(), ".codex", "auth.json");
  await symlink(sourceAuth, path.join(codexHome, "auth.json"));
  if (arm === "full") {
    await unlink(path.join(codexHome, "auth.json"));
    await installCodexPlugin(codexHome, workspace);
  }
  env.CODEX_HOME = codexHome;
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "-C",
    workspace,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "--json",
    "-m",
    "gpt-5.6-sol",
    "-c",
    'model_reasoning_effort="medium"',
  ];
  if (arm === "full") args.push("--dangerously-bypass-hook-trust");
  const prompt =
    TASKS[task].cwd === undefined
      ? TASKS[task].prompt
      : `Work only in ${TASKS[task].cwd}. ${TASKS[task].prompt}`;
  args.push("-");
  return {
    process: await runProcess({
      file: "codex",
      args,
      cwd: workspace,
      env,
      stdin: prompt,
    }),
    trust: arm === "full" ? "automation-vetted-bypass" : "none",
  };
}

async function executeRun(
  runRoot: string,
  host: Host,
  arm: Arm,
  task: TaskName,
  order: number,
): Promise<RunResult> {
  process.stdout.write(`[${order}] starting ${host}/${task}/${arm}\n`);
  const workspace = await prepareWorkspace(runRoot, task, host, arm);
  const repositoryRoot = (
    await commandText("git", ["rev-parse", "--show-toplevel"], workspace)
  ).trim();
  const agentWorkspace = host === "codex" ? repositoryRoot : workspace;
  const stateBase = path.join(runRoot, `state-${task}-${host}-${arm}`);
  await mkdir(stateBase, { recursive: true, mode: 0o700 });
  let agent: Awaited<ReturnType<typeof runAgent>>;
  try {
    agent = await runAgent(host, arm, task, agentWorkspace, stateBase, runRoot);
  } catch (error) {
    agent = {
      process: {
        exitCode: -1,
        stdoutTail: "",
        stderrTail: error instanceof Error ? error.message : String(error),
        timedOut: false,
        wallMs: 0,
      },
      trust: "none",
    };
  }
  const paths = await changedPaths(workspace, TASKS[task].base);
  if (TASKS[task].cwd !== undefined) {
    const prefix = `${TASKS[task].cwd}/`;
    const outside = (
      await changedPaths(repositoryRoot, TASKS[task].base)
    ).filter((file) => !file.startsWith(prefix));
    paths.push(...outside.map((file) => `../${file}`));
    paths.sort();
  }
  const lines = await numstat(workspace, TASKS[task].base);
  const score =
    task === "docs"
      ? await scoreDocs(workspace, paths)
      : task === "bug"
        ? await scoreBug(workspace, paths)
        : task === "type-only"
          ? await scoreTypeOnly(workspace, paths)
          : await scorePagination(workspace, paths);
  const hooks = await hookSummary(stateBase);
  const hookProof = arm === "full" ? hooks.count > 0 : hooks.count === 0;
  const remediationProof =
    arm === "baseline" ||
    (task === "type-only"
      ? hooks.remediationRequests === 0
      : hooks.remediationRequests <= 1);
  const finalSha = (
    await commandText("git", ["rev-parse", "HEAD"], workspace)
  ).trim();
  const error =
    agent.process.exitCode === 0 && hookProof && remediationProof
      ? null
      : [
          agent.process.exitCode === 0
            ? null
            : `agent exited ${agent.process.exitCode}${agent.process.timedOut ? " after timeout" : ""}`,
          hookProof
            ? null
            : arm === "full"
              ? "no Detestify hook invocation receipt was recorded"
              : "baseline unexpectedly recorded a Detestify hook invocation",
          remediationProof
            ? null
            : task === "type-only"
              ? "Detestify requested remediation for a compiler-proven no-test change"
              : "Detestify requested remediation more than once for one work item",
          agent.process.stderrTail.trim() ||
            agent.process.stdoutTail.trim() ||
            null,
        ]
          .filter(Boolean)
          .join("; ")
          .slice(0, 2_000);
  const result: RunResult = {
    host,
    arm,
    task,
    order,
    base_sha: TASKS[task].base,
    accepted_fix_sha: TASKS[task].acceptedFix,
    final_sha: finalSha,
    changed_paths: paths,
    added_lines: lines.added,
    deleted_lines: lines.deleted,
    changed_test_paths: paths.filter(isTestPath),
    agent_exit_code: agent.process.exitCode,
    timed_out: agent.process.timedOut,
    wall_ms: agent.process.wallMs,
    model: host === "claude" ? "sonnet" : "gpt-5.6-sol",
    auth_mode: "subscription",
    hook_trust_mode: agent.trust,
    hook_invocations: hooks.count,
    hook_events: hooks.events,
    hook_actions: hooks.actions,
    hook_reason_codes: hooks.reasonCodes,
    hook_remediation_requests: hooks.remediationRequests,
    hook_one_shot_downgrades: hooks.oneShotDowngrades,
    score,
    cost: null,
    error,
  };
  process.stdout.write(
    `[${order}] finished ${host}/${task}/${arm}: agent=${agent.process.exitCode} oracle=${score.passed ? "pass" : "fail"} hooks=${hooks.count}\n`,
  );
  return result;
}

async function preflight(
  hosts: readonly Host[],
  tasks: readonly TaskName[],
): Promise<void> {
  for (const target of [
    path.join(ROOT, "dist", "bin", "detestify.js"),
    path.join(ROOT, "plugins", "claude", "runtime", "entry.js"),
    path.join(ROOT, "plugins", "openai", "runtime", "entry.js"),
    path.join(ROOT, ".claude-plugin", "marketplace.json"),
    path.join(ROOT, ".agents", "plugins", "marketplace.json"),
  ]) {
    await lstat(target);
  }
  if (hosts.includes("claude")) {
    const status = JSON.parse(
      await commandText(
        "claude",
        ["auth", "status"],
        ROOT,
        subscriptionEnvironment(),
      ),
    ) as { loggedIn?: boolean; subscriptionType?: string };
    if (status.loggedIn !== true || status.subscriptionType === undefined) {
      throw new Error("Claude subscription authentication is unavailable.");
    }
  }
  if (hosts.includes("codex")) {
    const status = await runProcess({
      file: "codex",
      args: ["login", "status"],
      cwd: ROOT,
      env: subscriptionEnvironment(),
      timeoutMs: 30_000,
    });
    if (status.exitCode !== 0) {
      throw new Error(
        "Codex ChatGPT subscription authentication is unavailable.",
      );
    }
    await lstat(path.join(homedir(), ".codex", "auth.json"));
  }
  for (const repository of new Set(
    tasks.map((task) => TASKS[task].repository),
  )) {
    await commandText("git", ["ls-remote", repository, "HEAD"], ROOT);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: npm run benchmark:canary -- [--host claude|codex|all] [--task docs|bug|type-only|pagination|all] [--dry-run] [--output path] [--keep-workspaces]\n",
    );
    return;
  }
  const hostChoice = parseChoice(
    args,
    "--host",
    ["claude", "codex"] as const,
    "all",
  );
  const taskChoice = parseChoice(
    args,
    "--task",
    ["docs", "bug", "type-only", "pagination"] as const,
    "all",
  );
  const hosts = selected(hostChoice, ["claude", "codex"] as const);
  const tasks = selected(taskChoice, [
    "docs",
    "bug",
    "type-only",
    "pagination",
  ] as const);
  const pairs = tasks.flatMap((task) => hosts.map((host) => ({ task, host })));
  const planned = pairs.flatMap(({ task, host }) => {
    const arms: Arm[] =
      randomInt(2) === 0 ? ["baseline", "full"] : ["full", "baseline"];
    return arms.map((arm) => ({ task, host, arm }));
  });
  if (planned.length > MAX_RUNS)
    throw new Error(`Canary exceeds ${MAX_RUNS} runs.`);

  await preflight(hosts, tasks);
  if (args.includes("--dry-run")) {
    process.stdout.write(
      `${JSON.stringify({ repositories: [...new Set(tasks.map((task) => TASKS[task].repository))], runs: planned, auth: "subscription", cost: null }, null, 2)}\n`,
    );
    return;
  }

  const runRoot = await mkdtemp(path.join(tmpdir(), "detestify-canary-"));
  await chmod(runRoot, 0o700);
  const results: RunResult[] = [];
  try {
    let order = 0;
    for (const run of planned) {
      order += 1;
      results.push(
        await executeRun(runRoot, run.host, run.arm, run.task, order),
      );
    }
    const comparisons = pairs.map(({ host, task }) => {
      const baseline = results.find(
        (result) =>
          result.host === host &&
          result.task === task &&
          result.arm === "baseline",
      )!;
      const full = results.find(
        (result) =>
          result.host === host && result.task === task && result.arm === "full",
      )!;
      return {
        host,
        task,
        baseline_passed: baseline.score.passed,
        full_passed: full.score.passed,
        full_regressed: baseline.score.passed && !full.score.passed,
        wall_ms_delta: full.wall_ms - baseline.wall_ms,
        test_path_delta:
          full.changed_test_paths.length - baseline.changed_test_paths.length,
        test_paths_not_increased:
          full.changed_test_paths.length <= baseline.changed_test_paths.length,
        no_false_remediation:
          task !== "type-only" || full.hook_remediation_requests === 0,
        one_shot_respected: full.hook_remediation_requests <= 1,
      };
    });
    const report = {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      repositories: [...new Set(tasks.map((task) => TASKS[task].repository))],
      node: process.version,
      npm: (await commandText("npm", ["--version"], ROOT)).trim(),
      runs: results,
      comparisons,
      passed:
        results.every((result) => result.error === null) &&
        results.every((result) => result.score.passed) &&
        comparisons.every(
          (comparison) =>
            !comparison.full_regressed &&
            comparison.test_paths_not_increased &&
            comparison.no_false_remediation &&
            comparison.one_shot_respected,
        ),
    };
    const digest = createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex")
      .slice(0, 12);
    const outputIndex = args.indexOf("--output");
    const output =
      outputIndex >= 0 && args[outputIndex + 1] !== undefined
        ? path.resolve(args[outputIndex + 1]!)
        : path.join(tmpdir(), `detestify-canary-${digest}.json`);
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    process.stdout.write(`Canary report: ${output}\n`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    if (!args.includes("--keep-workspaces")) {
      await rm(runRoot, { recursive: true, force: true });
    } else {
      process.stdout.write(`Canary workspaces: ${runRoot}\n`);
    }
  }
}

await main();
