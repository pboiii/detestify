import { spawn, execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OracleResult {
  readonly passed: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly exitCode: number | null;
}

export interface HarnessOptions {
  readonly timeoutMs?: number;
  readonly env?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
export const SPEC_ROOT = path.resolve("spec");

function resolveProjectRoot(): string {
  return process.cwd();
}

async function runProcess(
  command: string,
  args: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string> | undefined;
    timeoutMs: number;
  },
): Promise<OracleResult> {
  const start = Date.now();
  return await new Promise<OracleResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env } as Record<string, string>,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        passed: !timedOut && code === 0,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        exitCode: code,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        passed: false,
        stdout,
        stderr: `${stderr}\n${(err as Error).message}`,
        durationMs: Date.now() - start,
        timedOut,
        exitCode: null,
      });
    });
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    try {
      await readdir(p);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Oracle: task-01 check.mjs
// ---------------------------------------------------------------------------

export async function runTask01Oracle(
  repoDir: string,
  oracleDir: string,
  opts: HarnessOptions = {},
): Promise<OracleResult> {
  const check = path.join(oracleDir, "check.mjs");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return runProcess(process.execPath, [check], {
    cwd: repoDir,
    env: { FIXTURE_REPO: repoDir, ...opts.env },
    timeoutMs,
  });
}

// ---------------------------------------------------------------------------
// Oracle: hidden vitest suites (tasks 02-04)
// ---------------------------------------------------------------------------

function findVitestMjs(): string {
  return path.join(
    resolveProjectRoot(),
    "node_modules",
    "vitest",
    "vitest.mjs",
  );
}

async function runVitestOnFiles(
  execDir: string,
  testFiles: string[],
  opts: HarnessOptions,
): Promise<OracleResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const vitestMjs = findVitestMjs();
  const args = ["--run", ...testFiles, "--reporter=verbose", "--no-coverage"];
  if (await fileExists(vitestMjs)) {
    return runProcess(process.execPath, [vitestMjs, ...args], {
      cwd: execDir,
      env: opts.env,
      timeoutMs,
    });
  }
  const bin = path.join(resolveProjectRoot(), "node_modules", ".bin", "vitest");
  return runProcess(bin, args, { cwd: execDir, env: opts.env, timeoutMs });
}

async function prepareVitestExecDir(
  repoDir: string,
  oracleDir: string,
  hiddenFiles: string[],
): Promise<{ execDir: string; relTestFiles: string[] }> {
  const execDir = await mkdtemp(path.join(tmpdir(), "detestify-oracle-"));
  const repoDest = path.join(execDir, "repo");
  await cp(repoDir, repoDest, { recursive: true, force: true });
  await rm(path.join(repoDest, ".git"), { recursive: true, force: true }).catch(
    () => {},
  );

  const oracleDest = path.join(execDir, "oracle");
  await mkdir(oracleDest, { recursive: true });
  const relTestFiles: string[] = [];
  for (const file of hiddenFiles) {
    const src = path.join(oracleDir, file);
    const dest = path.join(oracleDest, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { force: true });
    relTestFiles.push(path.join("oracle", file));
  }
  return { execDir, relTestFiles };
}

export async function runHiddenVitest(
  repoDir: string,
  oracleDir: string,
  hiddenFiles: string[],
  opts: HarnessOptions = {},
): Promise<OracleResult & { execDir: string }> {
  const { execDir, relTestFiles } = await prepareVitestExecDir(
    repoDir,
    oracleDir,
    hiddenFiles,
  );
  const result = await runVitestOnFiles(execDir, relTestFiles, opts);
  return { ...result, execDir };
}

export async function runTaskOracle(
  taskId: string,
  repoDir: string,
  oracleDir: string,
  opts: HarnessOptions = {},
): Promise<OracleResult & { execDir?: string }> {
  if (taskId === "task-01") return runTask01Oracle(repoDir, oracleDir, opts);
  const entries = await readdir(oracleDir).catch(() => [] as string[]);
  const hiddenFiles = entries.filter((f) => f.endsWith(".hidden.test.ts"));
  if (hiddenFiles.length > 0) {
    // task-04 cleanup-plan requires TEST_STEWARD_CLEANUP_PLAN; exclude it from
    // the generic oracle so fault detection (protected-behavior) is isolated.
    const filtered =
      taskId === "task-04"
        ? hiddenFiles.filter((f) => f !== "cleanup-plan.hidden.test.ts")
        : hiddenFiles;
    const toRun = filtered.length > 0 ? filtered : hiddenFiles;
    return runHiddenVitest(repoDir, oracleDir, toRun, opts);
  }
  return {
    passed: true,
    stdout: "no runnable hidden vitest for this task",
    stderr: "",
    durationMs: 0,
    timedOut: false,
    exitCode: 0,
  };
}

/**
 * Run only the fault-relevant hidden oracle for a task.
 * For task-04 this is protected-behavior; for others it is the task's sole hidden suite.
 */
export async function runFaultOracle(
  taskId: string,
  repoDir: string,
  oracleDir: string,
  opts: HarnessOptions = {},
): Promise<OracleResult & { execDir?: string }> {
  if (taskId === "task-04") {
    return runHiddenVitest(
      repoDir,
      oracleDir,
      ["protected-behavior.hidden.test.ts"],
      opts,
    );
  }
  return runTaskOracle(taskId, repoDir, oracleDir, opts);
}

export async function cleanupExecDir(
  execDir: string | undefined,
): Promise<void> {
  if (!execDir) return;
  await rm(execDir, { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Fault adapter
// ---------------------------------------------------------------------------

export interface FaultInfo {
  readonly id: string;
  readonly patchPath: string;
  readonly runnable: boolean;
}

export async function listFaults(oracleDir: string): Promise<FaultInfo[]> {
  const faultsDir = path.join(oracleDir, "faults");
  let entries: string[] = [];
  try {
    entries = await readdir(faultsDir);
  } catch {
    return [];
  }
  const out: FaultInfo[] = [];
  for (const file of entries.filter((f) => f.endsWith(".patch")).sort()) {
    const patchPath = path.join(faultsDir, file);
    const content = await readFile(patchPath, "utf8");
    const runnable =
      content.includes("diff --git") || content.includes("--- a/");
    out.push({ id: path.basename(file, ".patch"), patchPath, runnable });
  }
  return out;
}

export function isRunnablePatch(_patchPath: string, content: string): boolean {
  return content.includes("diff --git") || content.includes("--- a/");
}

export async function copyToScratch(repoDir: string): Promise<string> {
  const scratch = await mkdtemp(path.join(tmpdir(), "detestify-scratch-"));
  await cp(repoDir, scratch, { recursive: true, force: true });
  return scratch;
}

export async function applyPatch(
  scratchDir: string,
  patchPath: string,
): Promise<void> {
  const content = await readFile(patchPath, "utf8");
  if (!isRunnablePatch(patchPath, content)) {
    throw new Error(
      `patch is not runnable (semantic placeholder): ${patchPath}`,
    );
  }
  // Fixture patches use bare `@@` hunks (shorthand for single-line context). Rather than
  // trying to synthesize line counts that git apply/patch accept, apply them as simple
  // line replacements: each hunk is a single removed line -> single added line.
  const hasBareAtAt = content.split("\n").some((l) => l.trim() === "@@");
  if (hasBareAtAt) {
    const hunks = parseBareHunks(content);
    for (const hunk of hunks) {
      const target = path.join(scratchDir, hunk.file);
      let src = await readFile(target, "utf8");
      // hunk.old already stripped leading '-' ; try exact string replace
      if (src.includes(hunk.old)) {
        src = src.replace(hunk.old, hunk.new);
      } else {
        // Fallback: trimmed comparison
        const oldTrim = hunk.old.trim();
        const newTrim = hunk.new.trim();
        const lines = src.split("\n");
        let replaced = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.trim() === oldTrim) {
            const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
            lines[i] = indent + newTrim;
            replaced = true;
            break;
          }
        }
        if (!replaced)
          throw new Error(
            `hunk old line not found in ${hunk.file}: ${JSON.stringify(hunk.old)}`,
          );
        src = lines.join("\n");
      }
      await writeFile(target, src, "utf8");
    }
    return;
  }
  try {
    await execFileAsync("git", ["apply", "--whitespace=nowarn", patchPath], {
      cwd: scratchDir,
    });
  } catch (err) {
    try {
      await execFileAsync("patch", ["-p1", "-i", patchPath], {
        cwd: scratchDir,
      });
    } catch {
      throw err;
    }
  }
}

function parseBareHunks(
  patchText: string,
): Array<{ file: string; old: string; new: string }> {
  const hunks: Array<{ file: string; old: string; new: string }> = [];
  const lines = patchText.split("\n");
  let currentFile = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^diff --git a\/(.+?) b\/.+/);
    if (m) {
      currentFile = m[1]!;
      continue;
    }
    if (line.trim() === "@@") {
      // Next non-empty '-' is old, next '+' is new (supports multiple @@ per file)
      let old = "";
      let nw = "";
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.startsWith("diff --git")) break;
        if (l.trim() === "@@") {
          i = j - 1; // next iteration will handle next hunk header
          break;
        }
        if (!old && l.startsWith("-") && !l.startsWith("---")) old = l.slice(1);
        else if (old && l.startsWith("+") && !l.startsWith("+++")) {
          nw = l.slice(1);
          break;
        }
      }
      if (old || nw) hunks.push({ file: currentFile, old, new: nw });
    }
  }
  return hunks;
}

// Semantic adapters for T03 placeholder patches.
const T03_SIG_BLOCK =
  "  if (!dependencies.verifySignature(payload, signature)) {\n    throw new Error('invalid signature');\n  }\n\n";
const T03_CLAIM_BLOCK =
  "  const event = JSON.parse(payload) as WebhookEvent;\n  if (!(await dependencies.store.claim(event.id))) {\n    return { status: 'duplicate' };\n  }\n";

export async function applySemanticFaultT03(
  scratchDir: string,
  faultId: string,
): Promise<void> {
  const webhookPath = path.join(scratchDir, "src", "webhook.ts");
  let src: string;
  try {
    src = await readFile(webhookPath, "utf8");
  } catch {
    throw new Error(`webhook.ts not found in scratch: ${scratchDir}`);
  }
  if (faultId === "T03-F1") {
    // Remove failure-path release. Works on fixed code that contains release(); no-op on baseline.
    const next = src.replace(/.*\.release\(.*\).*\n/g, "");
    if (next !== src) await writeFile(webhookPath, next, "utf8");
    return;
  }
  if (faultId === "T03-F2") {
    if (!src.includes("markProcessed"))
      throw new Error("T03-F2: markProcessed not found");
    await writeFile(
      webhookPath,
      src.replace(/markProcessed/g, "release"),
      "utf8",
    );
    return;
  }
  if (faultId === "T03-F3") {
    // Swap signature check and claim blocks. Only valid when both blocks are present adjacent.
    if (src.includes(T03_SIG_BLOCK) && src.includes(T03_CLAIM_BLOCK)) {
      const sigIdx = src.indexOf(T03_SIG_BLOCK);
      const claimIdx = src.indexOf(T03_CLAIM_BLOCK);
      if (sigIdx !== -1 && claimIdx !== -1 && sigIdx < claimIdx) {
        const next = src
          .replace(T03_SIG_BLOCK, "")
          .replace(T03_CLAIM_BLOCK, T03_CLAIM_BLOCK + T03_SIG_BLOCK);
        if (next !== src) {
          await writeFile(webhookPath, next, "utf8");
          return;
        }
      }
      // Fallback: placeholder swap
      const tmp = "__SIG__";
      let swapped = src.replace(T03_SIG_BLOCK, tmp);
      swapped = swapped.replace(
        T03_CLAIM_BLOCK,
        T03_CLAIM_BLOCK + T03_SIG_BLOCK,
      );
      swapped = swapped.replace(tmp, "");
      if (swapped !== src) {
        await writeFile(webhookPath, swapped, "utf8");
        return;
      }
    }
    throw new Error(
      `T03-F3: expected sig+claim blocks not found in this source shape`,
    );
  }
  throw new Error(`unknown semantic fault ${faultId}`);
}

export async function applyFaultToScratch(
  scratchDir: string,
  fault: FaultInfo,
): Promise<void> {
  if (fault.runnable) {
    await applyPatch(scratchDir, fault.patchPath);
    return;
  }
  if (fault.id.startsWith("T03-")) {
    await applySemanticFaultT03(scratchDir, fault.id);
    return;
  }
  throw new Error(`no adapter for non-runnable patch ${fault.id}`);
}

export async function runOracleOnScratch(
  scratchDir: string,
  oracleDir: string,
  taskId: string,
  opts: HarnessOptions = {},
): Promise<OracleResult & { execDir?: string }> {
  return runTaskOracle(taskId, scratchDir, oracleDir, opts);
}
