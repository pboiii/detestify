import { readFile, stat } from "node:fs/promises";
import { execFile, spawnSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runHook as runSourceHook } from "../../src/hooks/entry.js";

const execFileAsync = promisify(execFile);

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

describe("generated plugin runtimes", () => {
  it("match the current TypeScript source", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ["scripts/build-plugins.mjs", "--check"],
        {
          cwd: repoRoot,
        },
      ),
    ).resolves.toBeDefined();
  });

  it("execute the same hook behavior as the TypeScript entry", async () => {
    const decision = {
      schema_version: "1.0" as const,
      action: "advise" as const,
      confidence: "high" as const,
      reason_code: "PACKAGE_PARITY",
      summary: "Package parity check.",
      remediation: null,
      report_path: null,
      limitations: [],
      loop_guard: { next_attempt: 1, max_attempts: 2 as const },
    };
    const argv = ["codex", "session_start"];
    const stdin = JSON.stringify({
      session_id: "package-parity",
      hook_event_name: "SessionStart",
      cwd: repoRoot,
    });
    const options = {
      repoRoot: null,
      decide: async () => decision,
    };
    const expected = await runSourceHook(argv, stdin, options);
    const launchedExpected = await runSourceHook(argv, stdin, {
      repoRoot: null,
    });

    for (const host of ["claude", "openai"]) {
      const runtime = (await import(
        path.join(repoRoot, "plugins", host, "runtime", "entry.js")
      )) as { runHook: typeof runSourceHook };
      await expect(runtime.runHook(argv, stdin, options)).resolves.toEqual(
        expected,
      );
      const launched = spawnSync(
        path.join(repoRoot, "plugins", host, "bin", "detestify-hook"),
        argv,
        { cwd: repoRoot, input: stdin, encoding: "utf8" },
      );
      expect(launched.status).toBe(launchedExpected.exitCode);
      expect(launched.stdout).toBe(launchedExpected.stdout ?? "");
      expect(launched.stderr).toBe(launchedExpected.stderr ?? "");
    }
  }, 15_000);
});

describe("claude plugin package (spec/hosts/claude-hook-package.md)", () => {
  const plugin = path.join(repoRoot, "plugins", "claude");

  it("ships the required layout", async () => {
    for (const file of [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "bin/detestify-hook",
      "runtime/entry.js",
      "schemas/hook-io.schema.json",
      "skills/detestify/SKILL.md",
      "README.md",
    ]) {
      await expect(stat(path.join(plugin, file))).resolves.toBeDefined();
    }
  });

  it("manifest names the plugin and declares skills", async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(plugin, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe("detestify");
    expect(manifest.version).toBe("0.1.0-alpha.0");
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.skills).toBe("./skills/");
  });

  it("hooks config registers exactly the mapped events with launchers", async () => {
    const config = JSON.parse(
      await readFile(path.join(plugin, "hooks", "hooks.json"), "utf8"),
    ) as {
      hooks: Record<
        string,
        { hooks: { type: string; command: string; timeout: number }[] }[]
      >;
    };
    const events = Object.keys(config.hooks).sort();
    expect(events).toEqual([
      "PostToolUse",
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "SubagentStop",
      "TaskCompleted",
    ]);
    expect(config.hooks.FileChanged).toBeUndefined();
    expect(config.hooks.Stop![0]!.hooks[0]!.command).toBe(
      "${CLAUDE_PLUGIN_ROOT}/bin/detestify-hook claude turn_stop",
    );
    expect(config.hooks.TaskCompleted![0]!.hooks[0]!.command).toContain(
      "claude task_complete",
    );
    for (const group of Object.values(config.hooks)) {
      for (const entry of group) {
        for (const hook of entry.hooks) {
          expect(hook.type).toBe("command");
          expect(hook.command.startsWith("${CLAUDE_PLUGIN_ROOT}/")).toBe(true);
          expect(hook.timeout).toBeGreaterThan(0);
        }
      }
    }
  });

  it("launcher is executable and invokes the shared entry", async () => {
    const info = await stat(path.join(plugin, "bin", "detestify-hook"));
    expect(info.mode & 0o111).not.toBe(0);
    const script = await readFile(
      path.join(plugin, "bin", "detestify-hook"),
      "utf8",
    );
    expect(script).toContain("entry.js");
    expect(script).toContain('case "$ENTRY" in');
    expect(script).toContain('"$PLUGIN_ROOT"/*)');
    expect(script).toContain("unset NODE_OPTIONS NODE_PATH");
    expect(script).toContain(
      "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    );
    expect(script).toContain('"$USER_NODE_ROOT"/.local/node-v*/bin/node');
    expect(script).not.toContain("command -v node");
    expect(script).not.toContain("/dist/");
    expect(script).not.toMatch(/\beval\b|\$\(.*\)\s*;/);
  });

  it("bundles a self-contained runtime with its local schemas and skill metadata", async () => {
    const runtime = await readFile(
      path.join(plugin, "runtime", "entry.js"),
      "utf8",
    );
    expect(runtime).toContain('new URL("../schemas/", import.meta.url)');
    const skill = await readFile(
      path.join(plugin, "skills", "detestify", "SKILL.md"),
      "utf8",
    );
    expect(skill).toMatch(/^---\nname: detestify\n/);
    expect(skill).not.toMatch(/certif(?:ied|ication)/i);
  });
});

describe("codex plugin package (spec/hosts/codex-hook-package.md)", () => {
  const plugin = path.join(repoRoot, "plugins", "openai");

  it("ships the required layout", async () => {
    for (const file of [
      ".codex-plugin/plugin.json",
      "hooks/hooks.json",
      "bin/detestify-hook",
      "runtime/entry.js",
      "schemas/hook-io.schema.json",
      "skills/detestify/SKILL.md",
      "README.md",
    ]) {
      await expect(stat(path.join(plugin, file))).resolves.toBeDefined();
    }
  });

  it("manifest points at the hook config", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe("detestify");
    expect(manifest.version).toBe("0.1.0-alpha.0");
    expect(manifest.hooks).toBe("./hooks/hooks.json");
  });

  it("hooks config registers supported events and never TaskCompleted", async () => {
    const config = JSON.parse(
      await readFile(path.join(plugin, "hooks", "hooks.json"), "utf8"),
    ) as {
      hooks: Record<
        string,
        { hooks: { type: string; command: string; timeout: number }[] }[]
      >;
    };
    const events = Object.keys(config.hooks).sort();
    expect(events).toEqual([
      "PostToolUse",
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "SubagentStop",
    ]);
    expect(config.hooks.TaskCompleted).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("additionalContextLimit");
    expect(config.hooks.Stop![0]!.hooks[0]!.command).toBe(
      "${PLUGIN_ROOT}/bin/detestify-hook codex turn_stop",
    );
    for (const group of Object.values(config.hooks)) {
      for (const entry of group) {
        for (const hook of entry.hooks) {
          expect(hook.type).toBe("command");
          expect(hook.command.startsWith("${PLUGIN_ROOT}/")).toBe(true);
        }
      }
    }
  });

  it("launcher is executable and invokes the shared entry", async () => {
    const info = await stat(path.join(plugin, "bin", "detestify-hook"));
    expect(info.mode & 0o111).not.toBe(0);
    const script = await readFile(
      path.join(plugin, "bin", "detestify-hook"),
      "utf8",
    );
    expect(script).toContain("entry.js");
    expect(script).toContain('case "$ENTRY" in');
    expect(script).toContain('"$PLUGIN_ROOT"/*)');
    expect(script).toContain("unset NODE_OPTIONS NODE_PATH");
    expect(script).toContain(
      "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    );
    expect(script).toContain('"$USER_NODE_ROOT"/.local/node-v*/bin/node');
    expect(script).not.toContain("command -v node");
    expect(script).not.toContain("/dist/");
  });

  it("bundles a self-contained runtime with its local schemas and skill metadata", async () => {
    const runtime = await readFile(
      path.join(plugin, "runtime", "entry.js"),
      "utf8",
    );
    expect(runtime).toContain('new URL("../schemas/", import.meta.url)');
    const skill = await readFile(
      path.join(plugin, "skills", "detestify", "SKILL.md"),
      "utf8",
    );
    expect(skill).toMatch(/^---\nname: detestify\n/);
    expect(skill).not.toMatch(/certif(?:ied|ication)/i);
  });
});

describe("local plugin marketplace catalogs", () => {
  it("points each host at its self-contained plugin package", async () => {
    const claude = JSON.parse(
      await readFile(
        path.join(repoRoot, ".claude-plugin", "marketplace.json"),
        "utf8",
      ),
    ) as {
      name: string;
      plugins: { name: string; source: string; version: string }[];
    };
    expect(claude.name).toBe("detestify");
    expect(claude.plugins).toContainEqual(
      expect.objectContaining({
        name: "detestify",
        source: "./plugins/claude",
        version: "0.1.0-alpha.0",
      }),
    );

    const codex = JSON.parse(
      await readFile(
        path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
        "utf8",
      ),
    ) as {
      name: string;
      plugins: { name: string; source: { source: string; path: string } }[];
    };
    expect(codex.name).toBe("detestify");
    expect(codex.plugins).toContainEqual(
      expect.objectContaining({
        name: "detestify",
        source: { source: "local", path: "./plugins/openai" },
      }),
    );
  });
});
