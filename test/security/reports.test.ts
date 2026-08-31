// Report-writing security suite (M3): path containment for --report/--json
// targets (TM-002/TM-017), output-injection redaction for hostile repository
// strings (TM-011), and atomic-write behavior that never leaves a partial
// report.

import { execFile, spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertContainedReportTarget,
  buildPlanReport,
  detectStaleReport,
  renderPlanSummary,
  sanitizeTerminal,
  validatePlanReport,
  writePlanReportAtomic,
  type PlanReport,
} from "../../src/core/reports/index.js";
import type {
  Decision,
  MaterialityTier,
  ObligationCandidate,
} from "../../src/core/model/index.js";
import { writeJsonReport } from "../../src/cli/output.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const TSX = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const BIN = path.join(PROJECT_ROOT, "bin", "detestify.ts");

// eslint-disable-next-line no-control-regex
const CONTROL_BYTES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    schema_version: "1.0",
    id: "dec-test",
    domain: "change",
    outcome: "NO_TEST_SUPPORTED",
    gate_action: "allow",
    confidence: "high",
    reason_code: "EMPTY_DIFF",
    summary: "Nothing changed.",
    rationale: "Nothing changed in the analyzed diff.",
    remediation: null,
    obligation_candidate_ids: [],
    evidence_ids: ["ev-git-diff"],
    target: {
      scope: null,
      purpose: null,
      technique: "existing_evidence",
      cadence: "completion",
      failure_class: null,
      test_path: null,
    },
    cleanup_requirements: null,
    limitations: [],
    ...overrides,
  };
}

function makeReport(overrides: {
  decision?: Partial<Decision>;
  decisions?: readonly Decision[];
  obligations?: readonly ObligationCandidate[];
  limitations?: readonly string[];
}): PlanReport {
  return buildPlanReport({
    reportId: "plan-security-test",
    generatedAt: "2026-08-28T00:00:00.000Z",
    repository: {
      root: "/tmp/security-test",
      base_revision: "a".repeat(40),
      head_revision: "a".repeat(40),
      diff_fingerprint: `sha256:${"b".repeat(64)}`,
      dirty: false,
    },
    change: {
      classes: ["documentation"],
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
    obligations: overrides.obligations ?? [],
    evidence: [
      {
        schema_version: "1.0",
        id: "ev-git-diff",
        kind: "git_diff",
        status: "observed",
        source: {
          tool: "git",
          version: null,
          path: null,
          command_fingerprint: `sha256:${"b".repeat(64)}`,
          observed_at: "2026-08-28T00:00:00.000Z",
        },
        findings: [
          { code: "NO_CHANGED_PATHS", summary: "Empty diff.", paths: [] },
        ],
        data: { added_lines: 0, deleted_lines: 0, binary_files: 0 },
        gate_trust: "eligible",
        limitations: [],
      },
    ],
    decisions: overrides.decisions ?? [makeDecision(overrides.decision ?? {})],
    limitations: [...(overrides.limitations ?? ["No commands executed."])],
    timing: { elapsed_ms: 1, phases: { repository_discovery: 1 } },
  });
}

function makeObligation(
  id: string,
  tier: MaterialityTier,
): ObligationCandidate {
  return {
    schema_version: "1.0",
    id,
    title: id,
    statement: `${id} changed.`,
    provenance: "observed",
    source_refs: ["ev-git-diff"],
    materiality: {
      consequence: tier === "T3" ? "irreversible" : "degraded",
      exposure: tier === "T3" ? "cross_system" : "user_facing",
      change_mechanism:
        tier === "T3" ? "stateful_or_irreversible" : "pure_behavior",
      evidence_gap: tier === "TU" ? "unknown" : "material",
      confidence: "observed",
      tier,
    },
    gate_eligible: false,
    rationale: `${id} rationale.`,
    limitations: [],
  };
}

let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "reports-security-"));
});

afterAll(async () => {
  // Restore permissions dropped by the atomic-write test before removal.
  await chmod(path.join(scratch, "readonly"), 0o700).catch(() => undefined);
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
});

describe("report target containment", () => {
  it("refuses a repository-contained target whose parent symlinks out of the repository", async () => {
    const repo = path.join(scratch, "repo-symlink");
    const outside = path.join(scratch, "outside-target");
    await mkdir(repo, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(repo, ".detestify"));

    const target = path.join(repo, ".detestify", "reports", "r.json");
    await expect(assertContainedReportTarget(target, repo)).rejects.toThrow(
      /Report I\/O error: .*escapes the repository root/,
    );
    await expect(
      writePlanReportAtomic(target, makeReport({}), repo),
    ).rejects.toThrow(/Report I\/O error/);
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses to write through a symlink at the target path itself", async () => {
    const repo = path.join(scratch, "repo-linkfile");
    await mkdir(repo, { recursive: true });
    const victim = path.join(scratch, "victim.json");
    await writeFile(victim, "{}\n", "utf8");
    const target = path.join(repo, "report.json");
    await symlink(victim, target);
    await expect(
      writePlanReportAtomic(target, makeReport({}), repo),
    ).rejects.toThrow(
      /Report I\/O error: refusing to write the report through a symlink/,
    );
    expect(await readFile(victim, "utf8")).toBe("{}\n");
  });

  it("refuses .git targets and allows an explicit target outside the repository", async () => {
    const repo = path.join(scratch, "repo-git");
    await mkdir(path.join(repo, ".git"), { recursive: true });
    await expect(
      assertContainedReportTarget(path.join(repo, ".git", "r.json"), repo),
    ).rejects.toThrow(
      /Report I\/O error: refusing to write the report into \.git/,
    );

    const explicit = path.join(scratch, "explicit-outside", "report.json");
    await writePlanReportAtomic(explicit, makeReport({}), repo);
    const written = JSON.parse(await readFile(explicit, "utf8")) as {
      report_id: string;
    };
    expect(written.report_id).toBe("plan-security-test");
  });

  it("is enforced end to end: the default report path never follows repository symlinks", async () => {
    const repo = path.join(scratch, "repo-e2e");
    const outside = path.join(scratch, "outside-e2e");
    await mkdir(repo, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(repo, "file.txt"), "hello\n", "utf8");
    const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
    await git(["init", "-q"]);
    await git(["config", "user.email", "t@example.invalid"]);
    await git(["config", "user.name", "t"]);
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "baseline"]);
    await symlink(outside, path.join(repo, ".detestify"));
    await writeFile(path.join(repo, "file.txt"), "changed\n", "utf8");

    const result = await new Promise<{
      code: number | null;
      stderr: string;
    }>((resolve) => {
      const child = spawn(process.execPath, [TSX, BIN, "plan", "--diff"], {
        cwd: repo,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("close", (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(9);
    expect(result.stderr).toContain("Report I/O error");
    expect(await readdir(outside)).toEqual([]);
  }, 60_000);
});

describe("output-injection redaction", () => {
  const hostile =
    "evil\u001b[2J\u0007\u001b]0;owned\u0007\r\nDecision: HACKED \u009b31m";

  it("keeps hostile strings inside valid JSON", async () => {
    const report = makeReport({
      decision: { summary: hostile },
      limitations: [hostile],
    });
    await validatePlanReport(report);
    const round = JSON.parse(JSON.stringify(report)) as PlanReport;
    expect(round.decisions[0]?.summary).toBe(hostile);
    expect(round.limitations).toContain(hostile);
  });

  it("strips terminal control bytes and line breaks from the summary", () => {
    const report = makeReport({
      decision: { summary: hostile },
      limitations: [hostile],
    });
    const rendered = renderPlanSummary(report, ".detestify/reports/r.json");
    expect(CONTROL_BYTES.test(rendered)).toBe(false);
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\u0007");
    expect(rendered).not.toContain("\r");
    // The injected "Decision:" line cannot start a line of its own.
    expect(rendered.match(/^Decision:/gm)).toHaveLength(1);
  });

  it("sanitizes hostile file names surfaced by the real CLI", async () => {
    const repo = path.join(scratch, "repo-hostile-name");
    await mkdir(repo, { recursive: true });
    const git = (args: string[]) => execFileAsync("git", args, { cwd: repo });
    await git(["init", "-q"]);
    await git(["config", "user.email", "t@example.invalid"]);
    await git(["config", "user.name", "t"]);
    await writeFile(path.join(repo, "keep.txt"), "x\n", "utf8");
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "baseline"]);
    await writeFile(
      path.join(repo, "evil\u001b[31m$(touch pwned).ts"),
      "export const x = 1;\n",
      "utf8",
    );

    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const child = spawn(
        process.execPath,
        [TSX, BIN, "plan", "--diff", "--json=-"],
        { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    expect(result.code).toBe(0);
    // Machine stdout is valid JSON despite the hostile name.
    const report = JSON.parse(result.stdout) as {
      change: { changed_paths: string[] };
    };
    expect(report.change.changed_paths.some((p) => p.startsWith("evil"))).toBe(
      true,
    );
    // The human summary (stderr in JSON mode) carries no raw control bytes.
    expect(result.stderr).not.toContain("\u001b");
    expect(result.stderr).not.toContain("\u0007");
    expect(await readdir(repo)).not.toContain("pwned");
  }, 60_000);

  it("sanitizeTerminal bounds field length", () => {
    const long = "a".repeat(5000);
    expect(sanitizeTerminal(long).length).toBeLessThan(320);
  });
});

describe("decision selection", () => {
  it("prefers minimum sufficient evidence for one material obligation and still surfaces uncertainty", () => {
    const obligation = makeObligation("ob-retry", "T3");
    const report = makeReport({
      obligations: [obligation],
      decisions: [
        makeDecision({
          id: "dec-new",
          outcome: "NEW_TEST_CANDIDATE",
          obligation_candidate_ids: [obligation.id],
        }),
        makeDecision({
          id: "dec-insufficient",
          outcome: "INSUFFICIENT_EVIDENCE",
          obligation_candidate_ids: [obligation.id],
        }),
        makeDecision({
          id: "dec-update",
          outcome: "EXISTING_TEST_UPDATE_CANDIDATE",
          obligation_candidate_ids: [obligation.id],
        }),
        makeDecision({
          id: "dec-sufficient",
          outcome: "EXISTING_EVIDENCE_SUFFICIENT",
          obligation_candidate_ids: [obligation.id],
          target: {
            scope: "integration",
            purpose: "regression",
            technique: "existing_evidence",
            cadence: "pull_request",
            failure_class: "retry-after-failed-claim",
            test_path: "test/integration/webhook.test.ts",
          },
        }),
      ],
    });

    expect(report.decisions.map((decision) => decision.outcome)).toEqual([
      "EXISTING_EVIDENCE_SUFFICIENT",
      "EXISTING_TEST_UPDATE_CANDIDATE",
      "NEW_TEST_CANDIDATE",
      "INSUFFICIENT_EVIDENCE",
    ]);
    expect(renderPlanSummary(report, null)).toContain(
      "Unresolved: 1 decision needs more evidence",
    );
  });

  it("ranks materiality before evidence cost across obligations", () => {
    const high = makeObligation("ob-high", "T3");
    const low = makeObligation("ob-low", "T1");
    const report = makeReport({
      obligations: [low, high],
      decisions: [
        makeDecision({
          id: "dec-low-sufficient",
          outcome: "EXISTING_EVIDENCE_SUFFICIENT",
          obligation_candidate_ids: [low.id],
        }),
        makeDecision({
          id: "dec-high-new",
          outcome: "NEW_TEST_CANDIDATE",
          obligation_candidate_ids: [high.id],
        }),
      ],
    });

    expect(report.decisions[0]?.id).toBe("dec-high-new");
  });
});

describe("atomic report writing", () => {
  it("uses private files and rejects symlink parents and targets", async () => {
    const directory = path.join(scratch, "shared-json-writer");
    await mkdir(directory);
    const target = path.join(directory, "report.json");
    await writeJsonReport(target, { ok: true });
    expect((await stat(target)).mode & 0o777).toBe(0o600);

    const victim = path.join(directory, "victim.json");
    const targetLink = path.join(directory, "target-link.json");
    await writeFile(victim, "{}\n", "utf8");
    await symlink(victim, targetLink);
    await expect(writeJsonReport(targetLink, { ok: false })).rejects.toThrow(
      /Report I\/O error: .*symlink/,
    );

    const outside = path.join(scratch, "shared-json-outside");
    const parentLink = path.join(directory, "parent-link");
    await mkdir(outside);
    await symlink(outside, parentLink);
    await expect(
      writeJsonReport(path.join(parentLink, "escaped.json"), { ok: false }),
    ).rejects.toThrow(/Report I\/O error: .*symlink parent/);
    expect(await readdir(outside)).toEqual([]);
  });

  it("does not read an oversized previous report", async () => {
    const dir = path.join(scratch, "oversized-previous");
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, "report.json");
    await writeFile(target, "");
    await truncate(target, 8 * 1024 * 1024 + 1);
    await expect(detectStaleReport(target, "sha256:current")).resolves.toEqual({
      exists: true,
      previousFingerprint: null,
      stale: false,
    });
  });

  it("leaves no partial file when the write fails", async () => {
    const readonly = path.join(scratch, "readonly");
    await mkdir(readonly, { recursive: true });
    await chmod(readonly, 0o500);
    const target = path.join(readonly, "report.json");
    await expect(
      writePlanReportAtomic(target, makeReport({}), readonly),
    ).rejects.toThrow(/Report I\/O error/);
    await chmod(readonly, 0o700);
    expect(await readdir(readonly)).toEqual([]);
  });

  it("replaces an existing report atomically and reports staleness", async () => {
    const dir = path.join(scratch, "replace");
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, "report.json");
    const report = makeReport({});
    await writePlanReportAtomic(target, report, dir);

    const fresh = await detectStaleReport(
      target,
      report.repository.diff_fingerprint,
    );
    expect(fresh).toEqual({
      exists: true,
      previousFingerprint: report.repository.diff_fingerprint,
      stale: false,
    });
    const drifted = await detectStaleReport(target, "sha256:other");
    expect(drifted.stale).toBe(true);

    await writePlanReportAtomic(target, report, dir);
    const files = await readdir(dir);
    expect(files).toEqual(["report.json"]);

    await writeFile(target, "not json", "utf8");
    const garbage = await detectStaleReport(target, "sha256:other");
    expect(garbage).toEqual({
      exists: true,
      previousFingerprint: null,
      stale: false,
    });
  });
});
