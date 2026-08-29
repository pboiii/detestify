import { describe, expect, it } from "vitest";
import { buildVitestArgs } from "../../../src/evidence/runners/vitest.js";
import { buildJestArgs } from "../../../src/evidence/runners/jest.js";
import { parseJestFormatResults } from "../../../src/evidence/runners/process.js";

describe("runner argv construction (TM-003/TM-009)", () => {
  it("vitest argv is fixed: run mode, JSON reporter, focused files", () => {
    const args = buildVitestArgs(
      "/repo/node_modules/vitest/vitest.mjs",
      ["test/a.test.ts", "test/b.test.ts"],
      "/tmp/out.json",
    );
    expect(args).toEqual([
      "/repo/node_modules/vitest/vitest.mjs",
      "run",
      "--reporter=json",
      "--outputFile=/tmp/out.json",
      "--no-coverage",
      "test/a.test.ts",
      "test/b.test.ts",
    ]);
  });

  it("jest argv is fixed: ci mode, JSON output, exact paths", () => {
    const args = buildJestArgs(
      "/repo/node_modules/jest/bin/jest.js",
      ["test/a.test.ts"],
      "/tmp/out.json",
    );
    expect(args).toEqual([
      "/repo/node_modules/jest/bin/jest.js",
      "--ci",
      "--json",
      "--outputFile=/tmp/out.json",
      "--runTestsByPath",
      "test/a.test.ts",
    ]);
  });

  it("hostile file names stay single verbatim argv elements", () => {
    const hostile = "test/x; rm -rf ~ $(evil) `boom`.test.ts";
    const args = buildVitestArgs("/e", [hostile], "/o");
    expect(args).toContain(hostile);
    expect(args.filter((entry) => entry.includes("rm -rf"))).toEqual([hostile]);
  });

  it("no argv ever routes through npm or package scripts", () => {
    const all = [
      ...buildVitestArgs("/e", ["t.test.ts"], "/o"),
      ...buildJestArgs("/e", ["t.test.ts"], "/o"),
    ];
    for (const entry of all) {
      expect(entry).not.toMatch(/^npm$|^npx$|^yarn$|^pnpm$/);
      expect(entry).not.toBe("test");
    }
  });
});

const VITEST_JSON = JSON.stringify({
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  success: false,
  testResults: [
    {
      name: "/repo/test/webhook.test.ts",
      assertionResults: [
        { status: "passed", fullName: "processes once", failureMessages: [] },
        { status: "passed", fullName: "rejects bad signature" },
        {
          status: "failed",
          fullName: "releases a failed claim",
          failureMessages: [
            "expected false to be true\n  at webhook.test.ts:9",
          ],
        },
      ],
    },
  ],
});

describe("structured result parsing", () => {
  it("parses jest-format counts and failing test names", () => {
    const results = parseJestFormatResults(VITEST_JSON);
    expect(results).not.toBeNull();
    expect(results).toMatchObject({
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      success: false,
    });
    expect(results?.failures).toHaveLength(1);
    expect(results?.failures[0]).toMatchObject({
      name: "releases a failed claim",
      file: "/repo/test/webhook.test.ts",
    });
    expect(results?.failures[0]?.message).toContain("expected false");
  });

  it("returns null for non-JSON and non-result JSON", () => {
    expect(parseJestFormatResults("plain runner banner")).toBeNull();
    expect(parseJestFormatResults('{"hello": true}')).toBeNull();
  });

  it("success requires both the success flag and zero failures", () => {
    const passing = parseJestFormatResults(
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        success: true,
        testResults: [],
      }),
    );
    expect(passing?.success).toBe(true);
  });
});
