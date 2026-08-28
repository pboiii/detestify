import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

describe("claude plugin package (spec/hosts/claude-hook-package.md)", () => {
  const plugin = path.join(repoRoot, "plugins", "claude");

  it("ships the required layout", async () => {
    for (const file of [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "bin/test-steward-hook",
      "skills/test-steward/SKILL.md",
      "README.md",
    ]) {
      await expect(stat(path.join(plugin, file))).resolves.toBeDefined();
    }
  });

  it("manifest names the plugin and declares hooks and skills", async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(plugin, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe("test-steward");
    expect(manifest.hooks).toBe("./hooks/hooks.json");
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
      "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude turn_stop",
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
    const info = await stat(path.join(plugin, "bin", "test-steward-hook"));
    expect(info.mode & 0o111).not.toBe(0);
    const script = await readFile(
      path.join(plugin, "bin", "test-steward-hook"),
      "utf8",
    );
    expect(script).toContain("entry.js");
    expect(script).not.toMatch(/\beval\b|\$\(.*\)\s*;/);
  });
});

describe("codex plugin package (spec/hosts/codex-hook-package.md)", () => {
  const plugin = path.join(repoRoot, "plugins", "openai");

  it("ships the required layout", async () => {
    for (const file of [
      ".codex-plugin/plugin.json",
      "hooks/hooks.json",
      "bin/test-steward-hook",
      "skills/test-steward/SKILL.md",
      "README.md",
    ]) {
      await expect(stat(path.join(plugin, file))).resolves.toBeDefined();
    }
  });

  it("manifest points at the hook config", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.name).toBe("test-steward");
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
    expect(config.hooks.Stop![0]!.hooks[0]!.command).toBe(
      "${PLUGIN_ROOT}/bin/test-steward-hook codex turn_stop",
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
    const info = await stat(path.join(plugin, "bin", "test-steward-hook"));
    expect(info.mode & 0o111).not.toBe(0);
    const script = await readFile(
      path.join(plugin, "bin", "test-steward-hook"),
      "utf8",
    );
    expect(script).toContain("entry.js");
  });
});
