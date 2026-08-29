import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** A complete schema-valid Test Steward configuration document. */
export function stewardConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: "1.0",
    mode: "balanced",
    trusted_operations: {
      run_repository_commands: true,
      evaluate_repository_config: false,
      install_dependencies: false,
      network_access: false,
      mutation: false,
      create_hooks: false,
    },
    protected_tests: [],
    declared_obligations: [],
    critical_paths: [],
    framework_overrides: { runner: "auto", config_paths: [] },
    hook_limits: {
      model_visible_bytes: 6000,
      remediation_characters: 1500,
      max_continuations: 1,
    },
    policy: { elevated_rule_ids: [], allow_delete_candidates: false },
    ...overrides,
  };
}

/** Write a config document at `<repo>/<relative>` and return the path. */
export async function writeConfigFile(
  repoDir: string,
  relative: string,
  document: Record<string, unknown>,
): Promise<string> {
  const file = path.join(repoDir, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return file;
}

/** Initialize a Git repository with one baseline commit of its current tree. */
export async function initGitRepo(dir: string): Promise<void> {
  const git = (args: string[]) => execFileAsync("git", args, { cwd: dir });
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@test-steward.local"]);
  await git(["config", "user.name", "Test Steward Tests"]);
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "baseline", "--allow-empty"]);
}
