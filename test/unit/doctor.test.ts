import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { runDoctor } from "../../src/cli/commands/doctor.js";
import { getValidator } from "../../src/core/schemas/index.js";

let packageRoot = "";

beforeAll(async () => {
  packageRoot = await mkdtemp(path.join(os.tmpdir(), "test-steward-doctor-"));
  await mkdir(path.join(packageRoot, ".git"));
});

afterAll(async () => {
  await import("node:fs/promises").then(({ rm }) =>
    rm(packageRoot, { recursive: true, force: true }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("doctor", () => {
  it("produces a report that validates against the packaged report schema", async () => {
    const report = await runDoctor({ repo: packageRoot });
    const validate = await getValidator("report.schema.json");

    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(report).toMatchObject({
      command: "doctor",
      capabilities: {
        repository_commands_trusted: false,
        network_used: false,
      },
    });
    const checks = (
      report as {
        evidence: [
          { data: { checks: Array<{ check: string; status: string }> } },
        ];
      }
    ).evidence[0].data.checks;
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: "node", status: "pass" }),
        expect.objectContaining({ check: "git", status: "pass" }),
        expect.objectContaining({ check: "claude_executable" }),
        expect.objectContaining({ check: "codex_executable" }),
        expect.objectContaining({
          check: "claude_plugin_package",
          status: "pass",
        }),
        expect.objectContaining({
          check: "codex_plugin_package",
          status: "pass",
        }),
        expect.objectContaining({ check: "host_state", status: "advice" }),
        expect.objectContaining({ check: "state_directory", status: "pass" }),
        expect.objectContaining({ check: "trust_config", status: "advice" }),
      ]),
    );
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "claude_plugin_package",
          detail: expect.stringContaining("runtime/entry.js"),
        }),
        expect.objectContaining({
          check: "codex_plugin_package",
          detail: expect.stringContaining("runtime/entry.js"),
        }),
      ]),
    );
    expect((report as { limitations: string[] }).limitations).toContain(
      "Doctor checks packaged plugin contents only; installed, enabled, and trusted host state remains unverified.",
    );
  });

  it("keeps missing host CLIs optional while rejecting repository state", async () => {
    vi.stubEnv("PATH", "/usr/bin:/bin");
    const optional = (await runDoctor({ repo: packageRoot })) as {
      decisions: Array<{ outcome: string; gate_action: string }>;
      evidence: [
        { data: { checks: Array<{ check: string; status: string }> } },
      ];
    };
    const optionalChecks = optional.evidence[0].data.checks;
    expect(optionalChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "claude_executable",
          status: "advice",
        }),
        expect.objectContaining({
          check: "codex_executable",
          status: "advice",
        }),
      ]),
    );
    expect(optional.decisions[0]).toMatchObject({
      outcome: "NO_TEST_SUPPORTED",
      gate_action: "allow",
    });

    vi.stubEnv("DETESTIFY_STATE_DIR", packageRoot);
    const unsafe = (await runDoctor({ repo: packageRoot })) as {
      decisions: Array<{ outcome: string }>;
      evidence: [
        { data: { checks: Array<{ check: string; status: string }> } },
      ];
    };
    expect(unsafe.evidence[0].data.checks).toContainEqual(
      expect.objectContaining({
        check: "state_directory",
        status: "unavailable",
      }),
    );
    expect(unsafe.decisions[0]?.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("validates inert contained configuration and rejects symlink escapes", async () => {
    const config = JSON.parse(
      await readFile(
        path.resolve("schemas/examples/config.valid.json"),
        "utf8",
      ),
    ) as unknown;
    await writeFile(
      path.join(packageRoot, "test-steward.json"),
      JSON.stringify(config),
    );
    await expect(
      runDoctor({ repo: packageRoot, config: "test-steward.json" }),
    ).resolves.toBeDefined();

    const outside = path.join(os.tmpdir(), `outside-${process.pid}.json`);
    await writeFile(outside, JSON.stringify(config));
    await symlink(outside, path.join(packageRoot, "escaped.json"));
    await expect(
      runDoctor({ repo: packageRoot, config: "escaped.json" }),
    ).rejects.toThrow("Path escapes repository root");
  });

  it("writes private reports and does not invoke repository package scripts", async () => {
    const marker = path.join(packageRoot, "executed");
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        scripts: {
          test: `node -e \"require('node:fs').writeFileSync('${marker}', '')\"`,
        },
      }),
    );
    const output = path.join(packageRoot, "reports", "doctor.json");
    await runDoctor({ repo: packageRoot, report: output });

    const { mode } = await import("node:fs/promises").then(({ stat }) =>
      stat(output),
    );
    expect(mode & 0o777).toBe(0o600);
    await expect(
      import("node:fs/promises").then(({ access }) => access(marker)),
    ).rejects.toThrow();
  });
});
