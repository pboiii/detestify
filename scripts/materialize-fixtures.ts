import { cp, mkdir, readdir, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FIXTURE_IDS = ["task-01", "task-02", "task-03", "task-04"] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export interface MaterializeOptions {
  readonly taskId: FixtureId;
  readonly targetDir: string;
  readonly specRoot?: string | undefined;
}

export interface MaterializeResult {
  readonly taskId: FixtureId;
  readonly repoDir: string;
  readonly oracleDir: string;
}

function resolveSpecRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "spec");
}

async function pathExists(p: string): Promise<boolean> {
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

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

export async function materializeFixture(
  options: MaterializeOptions,
): Promise<MaterializeResult> {
  const specRoot = resolveSpecRoot(options.specRoot);
  const taskId = options.taskId;
  if (!FIXTURE_IDS.includes(taskId as FixtureId)) {
    throw new Error(`unknown fixture: ${taskId}`);
  }
  const fixtureDir = path.join(specRoot, "handoff", "fixtures", taskId);
  const repoSrc = path.join(fixtureDir, "repo");
  const oracleDir = path.join(fixtureDir, "oracle");
  const changesDir = path.join(fixtureDir, "changes");
  const targetDir = path.resolve(options.targetDir);

  if (!(await pathExists(repoSrc))) {
    throw new Error(`repo source missing: ${repoSrc}`);
  }
  if (targetDir.includes(path.resolve(specRoot))) {
    // Guard: never write into spec/ even if caller passes nested path
    const specResolved = path.resolve(specRoot);
    if (
      targetDir === specResolved ||
      targetDir.startsWith(specResolved + path.sep)
    ) {
      throw new Error(`targetDir must not be inside spec/: ${targetDir}`);
    }
  }

  // Idempotent: remove existing target
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  // Copy repo/** verbatim (no oracle)
  await cp(repoSrc, targetDir, { recursive: true, force: true });

  // Verify oracle was not copied
  // (cp only copied repoSrc, so safe)

  // Init git repo
  await runGit(targetDir, ["init", "-q"]);
  await runGit(targetDir, ["config", "user.email", "fixture@detestify.local"]);
  await runGit(targetDir, ["config", "user.name", "Fixture Materializer"]);
  await runGit(targetDir, ["add", "-A"]);
  await runGit(targetDir, [
    "commit",
    "-q",
    "-m",
    `baseline: materialize ${taskId} repo`,
  ]);

  // Apply changes/*.patch as working-tree diff (not committed) when present
  // Only patch files that look like real diffs (contain diff header); semantic placeholders are skipped.
  if (await pathExists(changesDir)) {
    const entries = await readdir(changesDir);
    const patches = entries.filter((f) => f.endsWith(".patch")).sort();
    for (const patchFile of patches) {
      const patchPath = path.join(changesDir, patchFile);
      const content = await readFile(patchPath, "utf8");
      const isRealPatch =
        content.includes("diff --git") ||
        content.includes("--- a/") ||
        content.includes("*** Begin Patch");
      if (!isRealPatch) continue;
      try {
        await execFileAsync(
          "git",
          ["apply", "--whitespace=nowarn", patchPath],
          {
            cwd: targetDir,
          },
        );
      } catch (err) {
        // Fallback to `patch -p1` for patches that git apply rejects (e.g. placeholder index hashes)
        try {
          await execFileAsync("patch", ["-p1", "-i", patchPath], {
            cwd: targetDir,
          });
        } catch {
          throw err;
        }
      }
    }
  }

  return { taskId, repoDir: targetDir, oracleDir };
}

export async function materializeAll(options: {
  readonly outRoot: string;
  readonly specRoot?: string | undefined;
}): Promise<MaterializeResult[]> {
  const outRoot = path.resolve(options.outRoot);
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const results: MaterializeResult[] = [];
  for (const taskId of FIXTURE_IDS) {
    const target = path.join(outRoot, taskId);
    const res = await materializeFixture({
      taskId,
      targetDir: target,
      specRoot: options.specRoot,
    });
    results.push(res);
  }
  return results;
}

// CLI: tsx scripts/materialize-fixtures.ts <outDir> [taskId]
//   <outDir> is caller-supplied temp dir
//   if taskId given, materialize single fixture directly into <outDir>
//   otherwise materialize all fixtures as subdirs <outDir>/task-0N
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outArg = args[0];
  const taskArg = args[1] as FixtureId | undefined;
  const help = !outArg || outArg === "--help" || outArg === "-h";
  if (help) {
    process.stdout.write(
      "Usage: tsx scripts/materialize-fixtures.ts <outDir> [task-01|task-02|task-03|task-04]\n" +
        "  Without taskId: materializes all fixtures as <outDir>/task-0N\n" +
        "  With taskId: materializes that fixture directly into <outDir>\n",
    );
    process.exit(help && outArg ? 0 : 2);
  }
  const run = async (): Promise<void> => {
    if (taskArg) {
      if (!FIXTURE_IDS.includes(taskArg)) {
        throw new Error(
          `unknown task ${taskArg}, expected ${FIXTURE_IDS.join("|")}`,
        );
      }
      const res = await materializeFixture({
        taskId: taskArg,
        targetDir: outArg,
      });
      process.stdout.write(`materialized ${res.taskId} -> ${res.repoDir}\n`);
    } else {
      const results = await materializeAll({ outRoot: outArg });
      for (const r of results)
        process.stdout.write(`materialized ${r.taskId} -> ${r.repoDir}\n`);
    }
  };
  run().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
