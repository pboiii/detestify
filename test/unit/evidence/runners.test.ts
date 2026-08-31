import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildVitestArgs,
  resolveRunnerExecution,
} from "../../../src/evidence/runners/vitest.js";
import { buildJestArgs } from "../../../src/evidence/runners/jest.js";
import {
  buildNodeTestArgs,
  parseNodeTestResults,
  runNodeTest,
} from "../../../src/evidence/runners/node-test.js";
import {
  hasPassingTestResults,
  parseJestFormatResults,
  parseSelectedJestFormatResults,
} from "../../../src/evidence/runners/process.js";

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

  it("node:test argv uses Node's JUnit reporter and exact focused paths", () => {
    expect(
      buildNodeTestArgs({
        loader: "tsx",
        executionTestFiles: ["test/a.test.ts", "test/b.test.ts"],
      }),
    ).toEqual([
      "--import=tsx",
      "--test",
      "--test-reporter=junit",
      "test/a.test.ts",
      "test/b.test.ts",
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
      ...buildNodeTestArgs({
        loader: null,
        executionTestFiles: ["t.test.js"],
      }),
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

  it("keeps distinct identities beyond the bounded display text", () => {
    const sharedName = "n".repeat(400);
    const sharedMessage = "m".repeat(400);
    const results = parseJestFormatResults(
      JSON.stringify({
        numTotalTests: 2,
        numPassedTests: 0,
        numFailedTests: 2,
        success: false,
        testResults: [
          {
            name: "/repo/test/collision.test.ts",
            assertionResults: [
              {
                status: "failed",
                fullName: `${sharedName}a`,
                failureMessages: [`${sharedMessage}a`],
              },
              {
                status: "failed",
                fullName: `${sharedName}b`,
                failureMessages: [`${sharedMessage}b`],
              },
            ],
          },
        ],
      }),
    );

    expect(results?.failures[0]?.name).toBe(sharedName);
    expect(results?.failures[1]?.name).toBe(sharedName);
    expect(results?.failures[0]?.message).toBe(sharedMessage);
    expect(results?.failures[1]?.message).toBe(sharedMessage);
    expect(results?.failures[0]?.identityDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(results?.failures[1]?.identityDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(results?.failures[0]?.identityDigest).not.toBe(
      results?.failures[1]?.identityDigest,
    );
  });

  it("binds failure identity to the relative test file, not the scratch root", () => {
    const resultFor = (root: string, relativeFile: string) => {
      const dependency = path.join(root, "node_modules/chai/index.js");
      const message = `same complete failure\n at ${dependency}\n at ${pathToFileURL(dependency).href}`;
      return parseSelectedJestFormatResults(
        JSON.stringify({
          numTotalTests: 1,
          numPassedTests: 0,
          numFailedTests: 1,
          success: false,
          testResults: [
            {
              name: path.join(root, relativeFile),
              assertionResults: [
                {
                  status: "failed",
                  fullName: "same test name",
                  failureMessages: [message],
                },
              ],
            },
          ],
        }),
        root,
        [relativeFile],
      )?.results.failures[0]?.identityDigest;
    };

    expect(resultFor("/scratch/full", "test/a.test.ts")).toBe(
      resultFor("/scratch/retained", "test/a.test.ts"),
    );
    expect(resultFor("/scratch/full", "test/a.test.ts")).not.toBe(
      resultFor("/scratch/full", "test/b.test.ts"),
    );
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

  it("requires at least one passed test while allowing mixed skips", () => {
    expect(
      hasPassingTestResults({
        total: 2,
        passed: 0,
        failed: 0,
        skipped: 2,
        failures: [],
        success: true,
      }),
    ).toBe(false);
    expect(
      hasPassingTestResults({
        total: 2,
        passed: 1,
        failed: 0,
        skipped: 1,
        failures: [],
        success: true,
      }),
    ).toBe(true);
  });

  it("rejects omitted files and Vitest substring supersets", () => {
    const omitted = parseSelectedJestFormatResults(VITEST_JSON, "/repo", [
      "test/webhook.test.ts",
      "test/omitted.test.ts",
    ]);
    expect(omitted?.selectedFilesCovered).toBe(false);
    expect(omitted?.results.success).toBe(false);

    const substring = parseSelectedJestFormatResults(
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        success: true,
        testResults: [{ name: "/repo/test/webhook.test.ts-extra" }],
      }),
      "/repo",
      ["test/webhook.test.ts"],
    );
    expect(substring?.selectedFilesCovered).toBe(false);
    expect(substring?.results.success).toBe(false);
  });

  it("parses node:test JUnit and rejects partial selected-file evidence", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="passes &amp; reports" classname="test" file="/repo/test/a.test.js"/>
  <testcase name="skips" classname="test" file="/repo/test/b.test.js"><skipped type="skipped" message="true"/></testcase>
  <!-- tests 2 -->
  <!-- suites 0 -->
  <!-- pass 1 -->
  <!-- fail 0 -->
  <!-- cancelled 0 -->
  <!-- skipped 1 -->
  <!-- todo 0 -->
</testsuites>`;
    expect(
      parseNodeTestResults(xml, "/repo", ["test/a.test.js", "test/b.test.js"]),
    ).toMatchObject({
      selectedFilesCovered: true,
      results: { total: 2, passed: 1, skipped: 1, success: true },
    });
    expect(
      parseNodeTestResults(xml, "/repo", [
        "test/a.test.js",
        "test/b.test.js",
        "test/omitted.test.js",
      ]),
    ).toMatchObject({
      selectedFilesCovered: false,
      results: { success: false },
    });

    const node22 = xml.replaceAll(/ file="[^"]+"/g, "");
    expect(
      parseNodeTestResults(node22, "/repo", [
        "test/a.test.js",
        "test/b.test.js",
      ]),
    ).toMatchObject({
      selectedFilesCovered: true,
      results: { total: 2, passed: 1, skipped: 1, success: true },
    });
  });
});

describe("workspace-local runner resolution", () => {
  it("uses one nearest package root and rejects selections across roots", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "detestify-workspaces-"));
    try {
      for (const workspace of ["apps/api", "apps/web"]) {
        await mkdir(path.join(repo, workspace, "test"), { recursive: true });
        await mkdir(path.join(repo, workspace, "node_modules/vitest"), {
          recursive: true,
        });
        await writeFile(path.join(repo, workspace, "package.json"), "{}");
        await writeFile(
          path.join(repo, workspace, "node_modules/vitest/vitest.mjs"),
          "",
        );
      }
      await writeFile(path.join(repo, "apps/api/test/a.test.ts"), "");
      await writeFile(path.join(repo, "apps/api/test/b.test.ts"), "");
      await writeFile(path.join(repo, "apps/web/test/c.test.ts"), "");

      const execution = await resolveRunnerExecution(repo, "vitest", [
        "apps/api/test/a.test.ts",
        "apps/api/test/b.test.ts",
      ]);
      expect(execution.executionRoot).toBe(
        await realpath(path.join(repo, "apps/api")),
      );
      expect(execution.executionTestFiles).toEqual([
        "test/a.test.ts",
        "test/b.test.ts",
      ]);
      expect(execution.repositoryTestFiles).toEqual([
        "apps/api/test/a.test.ts",
        "apps/api/test/b.test.ts",
      ]);

      await expect(
        resolveRunnerExecution(repo, "vitest", [
          "apps/api/test/a.test.ts",
          "apps/web/test/c.test.ts",
        ]),
      ).rejects.toMatchObject({ reason: "unsupported" });
      await writeFile(path.join(repo, "apps/api/test/a.test.js"), "");
      await writeFile(path.join(repo, "apps/web/test/c.test.js"), "");
      await expect(
        resolveRunnerExecution(repo, "node:test", [
          "apps/api/test/a.test.js",
          "apps/web/test/c.test.js",
        ]),
      ).rejects.toMatchObject({ reason: "unsupported" });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("requires a declared, installed tsx loader for TypeScript node:test files", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "detestify-node-loader-"));
    try {
      await mkdir(path.join(repo, "test"));
      await mkdir(path.join(repo, "node_modules/tsx"), { recursive: true });
      await writeFile(
        path.join(repo, "package.json"),
        JSON.stringify({ devDependencies: { tsx: "4.0.0" } }),
      );
      await writeFile(path.join(repo, "node_modules/tsx/package.json"), "{}");
      await writeFile(path.join(repo, "test/a.test.ts"), "");
      const execution = await resolveRunnerExecution(repo, "node:test", [
        "test/a.test.ts",
      ]);
      expect(execution.loader).toBe("tsx");

      await writeFile(path.join(repo, "package.json"), "{}");
      await expect(
        resolveRunnerExecution(repo, "node:test", ["test/a.test.ts"]),
      ).rejects.toMatchObject({ reason: "unsupported" });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("runs JavaScript node:test files without a package script", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "detestify-node-run-"));
    try {
      await mkdir(path.join(repo, "test"));
      await writeFile(
        path.join(repo, "package.json"),
        JSON.stringify({ type: "module" }),
      );
      await writeFile(
        path.join(repo, "test/a.test.js"),
        "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('works', () => assert.equal(2 + 2, 4));\n",
      );
      const invocation = await runNodeTest({
        repoRoot: repo,
        testFiles: ["test/a.test.js"],
        timeoutMs: 10_000,
      });
      expect(invocation.argv).toEqual([
        process.execPath,
        "--test",
        "--test-reporter=junit",
        "test/a.test.js",
      ]);
      expect(invocation.selectedFilesCovered).toBe(true);
      expect(invocation.results).toMatchObject({
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
