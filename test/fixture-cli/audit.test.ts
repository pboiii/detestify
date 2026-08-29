// Fixture-CLI acceptance: `audit` against the materialized task-04 repo.
// Audit is the evidence view: candidates and observations surface as
// evidence records with protection matches, without lifecycle decisions.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materializeFixture } from "../../scripts/materialize-fixtures.js";
import { main } from "../../src/cli/main.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";
import {
  formatSchemaErrors,
  getValidator,
} from "../../src/core/schemas/index.js";

const PROTECTED_PATH = "test/webhook-contract.test.ts";

interface EvidenceRecord {
  id: string;
  kind: string;
  gate_trust: string;
  findings: Array<{ code: string; summary: string; paths: string[] }>;
  data: Record<string, unknown>;
}

interface Report {
  command: string;
  evidence: EvidenceRecord[];
  decisions: Array<{ domain: string; outcome: string; gate_action: string }>;
}

let workDir: string;
let exitCode: number;
let report: Report;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "fixture-cli-audit-"));
  const { repoDir } = await materializeFixture({
    taskId: "task-04",
    targetDir: path.join(workDir, "repo"),
  });
  const jsonPath = path.join(workDir, "audit.json");
  exitCode = await main([
    "node",
    "test-steward",
    "audit",
    "--repo",
    repoDir,
    "--json",
    jsonPath,
  ]);
  report = JSON.parse(await readFile(jsonPath, "utf8")) as Report;
}, 120_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
});

function signalsFor(detector: string): EvidenceRecord[] {
  return report.evidence.filter(
    (record) => record.data["detector"] === detector,
  );
}

describe("audit on task-04", () => {
  it("exits OK and validates against report.schema.json", async () => {
    expect(exitCode).toBe(EXIT_CODES.OK);
    const validate = await getValidator("report.schema.json");
    expect(validate(report), formatSchemaErrors(validate.errors)).toBe(true);
    expect(report.command).toBe("audit");
  });

  it("surfaces the exact-duplicate candidate with byte and AST signals", () => {
    const ids = signalsFor("exact-duplicate").map((record) => record.id);
    expect(ids.some((id) => id.startsWith("ev-ast-identical:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("ev-byte-identical:"))).toBe(true);
    const record = signalsFor("exact-duplicate")[0];
    expect(record?.findings[0]?.paths).toEqual([
      "test/email-normalize-copy.test.ts",
      "test/email-normalize.test.ts",
    ]);
  });

  it("surfaces the similar candidate", () => {
    const similar = signalsFor("similar");
    expect(similar.length).toBeGreaterThan(0);
    expect(
      similar[0]?.findings[0]?.paths.includes(
        "test/email-normalize-similar.test.ts",
      ),
    ).toBe(true);
  });

  it("surfaces the expired legacy marker as declared policy", () => {
    const expiry = signalsFor("expiry");
    expect(expiry.map((record) => record.id)).toContain(
      "ev-expiry-record:test/legacy-v1.test.ts",
    );
    expect(expiry[0]?.kind).toBe("declared_policy");
  });

  it("surfaces the placement candidate and marks webhook-contract protected", () => {
    const placement = signalsFor("placement");
    expect(placement.length).toBeGreaterThan(0);
    expect(placement[0]?.findings[0]?.paths).toEqual([
      PROTECTED_PATH,
      "test/webhook-unit.test.ts",
    ]);
    expect(placement[0]?.data["protected_paths"]).toEqual([PROTECTED_PATH]);

    const protection = report.evidence.find(
      (record) => record.id === "ev-protection-index",
    );
    expect(
      protection?.findings.some(
        (finding) =>
          finding.code === "PROTECTED_TEST" &&
          finding.paths.includes(PROTECTED_PATH),
      ),
    ).toBe(true);
  });

  it("makes no lifecycle decisions", () => {
    expect(report.decisions).toHaveLength(1);
    for (const decision of report.decisions) {
      expect(decision.domain).toBe("change");
      expect(decision.gate_action).toBe("allow");
    }
  });
});
