import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CONFIG_PROTECTION_SOURCE,
  loadProtectionIndex,
  matchExpiry,
  matchProtection,
  pathMatchesPattern,
  PROTECTED_TESTS_LEDGER,
} from "../../../src/cleanup/protection.js";

const TASK_04_REPO = path.resolve("spec/handoff/fixtures/task-04/repo");
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cleanup-protection-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return dir;
}

const validLedger = JSON.stringify({
  schema_version: "1.0",
  tests: [
    {
      path: "test/webhook.test.ts",
      obligation_id: "OBL-1",
      reason: "contract",
      owner: "api",
    },
  ],
});

describe("loadProtectionIndex", () => {
  it("parses the packaged task-04 protected-tests and expiry ledgers", async () => {
    const index = await loadProtectionIndex(TASK_04_REPO);
    expect(index.deletionEligible).toBe(true);
    expect(index.limitations).toEqual([]);
    expect(index.records).toEqual([
      {
        source: PROTECTED_TESTS_LEDGER,
        path: "test/webhook-contract.test.ts",
        obligationIds: ["OBL-WEBHOOK-ACK-CONTRACT"],
        reason:
          "Public consumer contract for webhook acknowledgement wire shape",
      },
    ]);
    expect(index.expiry).toHaveLength(1);
    expect(index.expiry[0]!.testPath).toBe("test/legacy-v1.test.ts");
  });

  it("fails closed when the protected-tests ledger is missing", async () => {
    const repo = await makeRepo({});
    const index = await loadProtectionIndex(repo);
    expect(index.deletionEligible).toBe(false);
    expect(index.limitations.some((l) => l.includes("missing"))).toBe(true);
  });

  it("fails closed when the protected-tests ledger is not JSON", async () => {
    const repo = await makeRepo({
      [PROTECTED_TESTS_LEDGER]: "not json {",
    });
    const index = await loadProtectionIndex(repo);
    expect(index.deletionEligible).toBe(false);
    expect(index.limitations.some((l) => l.includes("unreadable"))).toBe(true);
  });

  it("fails closed when the ledger shape is wrong", async () => {
    const repo = await makeRepo({
      [PROTECTED_TESTS_LEDGER]: JSON.stringify({
        schema_version: "2.0",
        tests: [],
      }),
    });
    const index = await loadProtectionIndex(repo);
    expect(index.deletionEligible).toBe(false);
    expect(index.limitations.some((l) => l.includes("expected shape"))).toBe(
      true,
    );
  });

  it("fails closed when the expiry ledger is corrupt, without dropping valid records", async () => {
    const repo = await makeRepo({
      [PROTECTED_TESTS_LEDGER]: validLedger,
      ".test-steward/expiry.json": "{broken",
    });
    const index = await loadProtectionIndex(repo);
    expect(index.deletionEligible).toBe(false);
    expect(index.records).toHaveLength(1);
  });

  it("treats a missing expiry ledger as fine", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: validLedger });
    const index = await loadProtectionIndex(repo);
    expect(index.deletionEligible).toBe(true);
    expect(index.expiry).toEqual([]);
  });

  it("appends config protected_tests records and fails closed on bad config paths", async () => {
    const repo = await makeRepo({ [PROTECTED_TESTS_LEDGER]: validLedger });
    const index = await loadProtectionIndex(repo, [
      {
        id: "PT-1",
        path: "test/critical/*.test.ts",
        reason: "incident 42",
        obligation_ids: ["OBL-CRIT"],
        source: "policy.md",
      },
      {
        id: "PT-2",
        path: "/absolute/escape.test.ts",
        reason: "bad",
        obligation_ids: [],
        source: "policy.md",
      },
    ]);
    expect(
      index.records.filter((r) => r.source === CONFIG_PROTECTION_SOURCE),
    ).toHaveLength(1);
    expect(index.deletionEligible).toBe(false);
    expect(index.limitations.some((l) => l.includes("PT-2"))).toBe(true);
  });
});

describe("matching", () => {
  it("pathMatchesPattern supports exact, *, and ** patterns", () => {
    expect(pathMatchesPattern("test/a.test.ts", "test/a.test.ts")).toBe(true);
    expect(pathMatchesPattern("test/*.test.ts", "test/a.test.ts")).toBe(true);
    expect(pathMatchesPattern("test/*.test.ts", "test/sub/a.test.ts")).toBe(
      false,
    );
    expect(pathMatchesPattern("test/**", "test/sub/a.test.ts")).toBe(true);
    expect(pathMatchesPattern("test/a.test.ts", "test/aXtest.ts")).toBe(false);
  });

  it("matchProtection matches normalized candidate paths and obligations", async () => {
    const index = await loadProtectionIndex(TASK_04_REPO);
    expect(
      matchProtection(index, ["./test/webhook-contract.test.ts"], []),
    ).toHaveLength(1);
    expect(
      matchProtection(
        index,
        ["test/other.test.ts"],
        ["OBL-WEBHOOK-ACK-CONTRACT"],
      ),
    ).toHaveLength(1);
    expect(matchProtection(index, ["test/other.test.ts"], [])).toHaveLength(0);
  });

  it("matchExpiry matches candidate paths", async () => {
    const index = await loadProtectionIndex(TASK_04_REPO);
    expect(matchExpiry(index, ["test/legacy-v1.test.ts"])).toHaveLength(1);
    expect(matchExpiry(index, ["test/other.test.ts"])).toHaveLength(0);
  });
});
