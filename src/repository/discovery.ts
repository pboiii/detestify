// Inert repository-shape discovery (threat model TM-003): package.json is
// parsed as data, runner presence is inferred from dependency, inert script,
// and file markers, and source/test topology comes from path conventions
// alone. Repository code and executable configuration are never executed or
// imported; JS/TS config files are reported present-but-unreadable as an
// explicit limitation.

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { ts } from "ts-morph";
import { runGit } from "./git.js";
import { normalizeRepositoryPath, realpathContained } from "./paths.js";

// Standard JS/TS test naming conventions. Kept local: the analysis layer is
// deliberately decoupled from this repository layer (ADR-002 layering).
const TEST_FILE_PATTERN =
  /(^|\/)[^/]*\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_DIRECTORY_PATTERN =
  /(^|\/)__tests__\/[^/]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function isTestFilePath(file: string): boolean {
  return TEST_FILE_PATTERN.test(file) || TEST_DIRECTORY_PATTERN.test(file);
}

type SupportedRunner = "vitest" | "jest" | "node:test";
type UnsupportedRunner = "playwright" | "bun";

export type RunnerKind = SupportedRunner | "unknown" | "none";

export interface RunnerMarker {
  /** Repository-relative POSIX path of the marker. */
  readonly path: string;
  readonly runner: SupportedRunner | UnsupportedRunner;
  /** How the marker was recognized. */
  readonly kind:
    | "dependency"
    | "config-file"
    | "package-config"
    | "package-script";
  /** True when an executable JS/TS config was recognized but not read. */
  readonly executable: boolean;
}

export interface PackageManifestFacts {
  /** Repository-relative POSIX path of the manifest. */
  readonly path: string;
  readonly name: string | null;
  /** package.json "type" field, or null when absent. */
  readonly moduleType: string | null;
  /** Script names only; script bodies are untrusted commands, never run. */
  readonly scriptNames: readonly string[];
  readonly dependencyNames: readonly string[];
  readonly devDependencyNames: readonly string[];
  readonly workspaces: readonly string[];
}

export interface RepositoryShape {
  /** Detected runner for report capabilities. */
  readonly runner: RunnerKind;
  readonly runnerMarkers: readonly RunnerMarker[];
  /** Test files that may be passed to the detected supported runner. */
  readonly runnerTestFiles: readonly string[];
  /** Parsed package manifests (root plus workspace-adjacent, when supplied). */
  readonly manifests: readonly PackageManifestFacts[];
  /** Supplied files that follow test naming conventions, sorted. */
  readonly testFiles: readonly string[];
  /** Supplied JS/TS files that are not tests, sorted. */
  readonly sourceFiles: readonly string[];
  /** Discovery limitations (unreadable manifests, executable configs). */
  readonly limitations: readonly string[];
}

const JS_TS_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const VITEST_CONFIG_PATTERN = /(^|\/)vitest\.config\.(ts|mts|cts|js|mjs|cjs)$/;
const JEST_CONFIG_PATTERN = /(^|\/)jest\.config\.(ts|mts|cts|js|mjs|cjs)$/;
const JEST_CONFIG_JSON_PATTERN = /(^|\/)jest\.config\.json$/;
const PLAYWRIGHT_CONFIG_PATTERN =
  /(^|\/)playwright\.config\.(ts|mts|cts|js|mjs|cjs)$/;
const BUNFIG_CONFIG_PATTERN = /(^|\/)bunfig\.toml$/;
const NODE_TEST_COMMAND_PATTERN =
  /(?:^|(?:&&|\|\||;)\s*)(?:node(?:\s+--(?:import|require)(?:=|\s+)\S+)*\s+--test|tsx\s+--test)(?:[=\s]|$)/;
const PLAYWRIGHT_TEST_COMMAND_PATTERN =
  /(?:^|(?:&&|\|\||;)\s*)(?:(?:npx|npm exec|pnpm exec|yarn)\s+)?playwright\s+test(?:\s|$)/;
const BUN_TEST_COMMAND_PATTERN = /(?:^|(?:&&|\|\||;)\s*)bun\s+test(?:\s|$)/;

interface ParsedManifest {
  readonly facts: PackageManifestFacts;
  readonly hasJestConfigField: boolean;
  readonly scriptMarkers: readonly RunnerMarker[];
}

function stringRecordKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort();
}

function workspaceList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (value !== null && typeof value === "object") {
    const packages = (value as { packages?: unknown }).packages;
    if (Array.isArray(packages)) {
      return packages.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
  }
  return [];
}

const MANIFEST_SIZE_LIMIT = 2 * 1024 * 1024;
const TEST_FILE_SIZE_LIMIT = 1024 * 1024;

function unsupportedScriptMarkers(
  manifestPath: string,
  scripts: unknown,
): RunnerMarker[] {
  if (
    scripts === null ||
    typeof scripts !== "object" ||
    Array.isArray(scripts)
  ) {
    return [];
  }

  const runners = new Set<SupportedRunner | UnsupportedRunner>();
  for (const script of Object.values(scripts as Record<string, unknown>)) {
    if (typeof script !== "string") {
      continue;
    }
    if (NODE_TEST_COMMAND_PATTERN.test(script)) {
      runners.add("node:test");
    }
    if (PLAYWRIGHT_TEST_COMMAND_PATTERN.test(script)) {
      runners.add("playwright");
    }
    if (BUN_TEST_COMMAND_PATTERN.test(script)) {
      runners.add("bun");
    }
  }

  return [...runners].sort().map((runner) => ({
    path: manifestPath,
    runner,
    kind: "package-script",
    executable: false,
  }));
}

async function parseManifest(
  repositoryRoot: string,
  manifestPath: string,
): Promise<ParsedManifest> {
  const contained = await realpathContained(repositoryRoot, manifestPath);
  const stat = await lstat(contained);
  if (!stat.isFile()) {
    throw new Error(`Manifest is not a regular file: ${manifestPath}`);
  }
  if (stat.size > MANIFEST_SIZE_LIMIT) {
    throw new Error(`Manifest exceeds 2 MiB: ${manifestPath}`);
  }
  const source = await readFile(contained, "utf8");
  const document: unknown = JSON.parse(source);
  if (document === null || typeof document !== "object") {
    throw new Error(`Manifest is not a JSON object: ${manifestPath}`);
  }
  const manifest = document as Record<string, unknown>;
  return {
    facts: {
      path: manifestPath,
      name: typeof manifest.name === "string" ? manifest.name : null,
      moduleType: typeof manifest.type === "string" ? manifest.type : null,
      scriptNames: stringRecordKeys(manifest.scripts),
      dependencyNames: stringRecordKeys(manifest.dependencies),
      devDependencyNames: stringRecordKeys(manifest.devDependencies),
      workspaces: workspaceList(manifest.workspaces),
    },
    hasJestConfigField: manifest.jest !== undefined,
    scriptMarkers: unsupportedScriptMarkers(manifestPath, manifest.scripts),
  };
}

function dependencyMarkers(manifest: PackageManifestFacts): RunnerMarker[] {
  const markers: RunnerMarker[] = [];
  const all = new Set([
    ...manifest.dependencyNames,
    ...manifest.devDependencyNames,
  ]);
  if (all.has("vitest")) {
    markers.push({
      path: manifest.path,
      runner: "vitest",
      kind: "dependency",
      executable: false,
    });
  }
  if (all.has("jest")) {
    markers.push({
      path: manifest.path,
      runner: "jest",
      kind: "dependency",
      executable: false,
    });
  }
  if (all.has("@playwright/test") || all.has("playwright")) {
    markers.push({
      path: manifest.path,
      runner: "playwright",
      kind: "dependency",
      executable: false,
    });
  }
  return markers;
}

function configMarkers(files: readonly string[]): RunnerMarker[] {
  const markers: RunnerMarker[] = [];
  for (const file of files) {
    if (VITEST_CONFIG_PATTERN.test(file)) {
      markers.push({
        path: file,
        runner: "vitest",
        kind: "config-file",
        executable: true,
      });
    } else if (JEST_CONFIG_PATTERN.test(file)) {
      markers.push({
        path: file,
        runner: "jest",
        kind: "config-file",
        executable: true,
      });
    } else if (JEST_CONFIG_JSON_PATTERN.test(file)) {
      markers.push({
        path: file,
        runner: "jest",
        kind: "config-file",
        executable: false,
      });
    } else if (PLAYWRIGHT_CONFIG_PATTERN.test(file)) {
      markers.push({
        path: file,
        runner: "playwright",
        kind: "config-file",
        executable: true,
      });
    } else if (BUNFIG_CONFIG_PATTERN.test(file)) {
      markers.push({
        path: file,
        runner: "bun",
        kind: "config-file",
        executable: false,
      });
    }
  }
  return markers;
}

function detectRunner(
  markers: readonly RunnerMarker[],
  testFiles: readonly string[],
  registeredTestFiles: ReadonlySet<string>,
): { runner: RunnerKind; runnerTestFiles: string[] } {
  const runners = new Set(markers.map((marker) => marker.runner));
  const supported = [...runners].filter(
    (runner): runner is SupportedRunner =>
      runner === "vitest" || runner === "jest" || runner === "node:test",
  );
  const hasUnsupportedRunner = [...runners].some(
    (runner) =>
      runner !== "vitest" && runner !== "jest" && runner !== "node:test",
  );
  if (supported.length > 1) {
    return { runner: "unknown", runnerTestFiles: [] };
  }
  if (supported.length === 0) {
    return { runner: "none", runnerTestFiles: [] };
  }
  const runner = supported[0]!;
  const testSet = new Set(testFiles);
  const owners = new Map<string, Set<RunnerMarker["runner"]>>();
  for (const marker of markers) {
    if (!testSet.has(marker.path)) continue;
    const fileOwners = owners.get(marker.path) ?? new Set();
    fileOwners.add(marker.runner);
    owners.set(marker.path, fileOwners);
  }
  const ownedTests = testFiles.filter(
    (file) => owners.get(file)?.size === 1 && owners.get(file)?.has(runner),
  );
  if (runner === "node:test") {
    return {
      runner,
      runnerTestFiles: ownedTests.filter((file) =>
        registeredTestFiles.has(file),
      ),
    };
  }
  if (!hasUnsupportedRunner) {
    return {
      runner,
      runnerTestFiles: testFiles.filter((file) =>
        registeredTestFiles.has(file),
      ),
    };
  }
  if (
    registeredTestFiles.size === 0 ||
    [...registeredTestFiles].some((file) => owners.get(file)?.size !== 1)
  ) {
    return { runner: "unknown", runnerTestFiles: [] };
  }
  return {
    runner,
    runnerTestFiles: ownedTests.filter((file) => registeredTestFiles.has(file)),
  };
}

function isTestRegistrationExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return (
      expression.text === "describe" ||
      expression.text === "suite" ||
      expression.text === "it" ||
      expression.text === "test"
    );
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return isTestRegistrationExpression(expression.expression);
  }
  return (
    ts.isCallExpression(expression) &&
    isTestRegistrationExpression(expression.expression)
  );
}

async function testImportMarkers(
  repositoryRoot: string,
  testFiles: readonly string[],
): Promise<{ markers: RunnerMarker[]; registeredTestFiles: Set<string> }> {
  const runnerForModule = new Map<string, RunnerMarker["runner"]>([
    ["vitest", "vitest"],
    ["@jest/globals", "jest"],
    ["node:test", "node:test"],
    ["@playwright/test", "playwright"],
    ["playwright/test", "playwright"],
    ["bun:test", "bun"],
  ]);
  const markers: RunnerMarker[] = [];
  const registeredTestFiles = new Set<string>();
  for (const file of testFiles) {
    try {
      const contained = await realpathContained(repositoryRoot, file);
      const stat = await lstat(contained);
      if (!stat.isFile() || stat.size > TEST_FILE_SIZE_LIMIT) continue;
      const source = await readFile(contained, "utf8");
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        false,
      );
      const modules = new Set<string>();
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          isTestRegistrationExpression(node.expression)
        ) {
          registeredTestFiles.add(file);
        }
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          modules.add(node.moduleSpecifier.text);
        } else if (
          ts.isCallExpression(node) &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0]!) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        ) {
          modules.add(node.arguments[0]!.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      for (const module of modules) {
        const runner = runnerForModule.get(module);
        if (runner === undefined) continue;
        markers.push({
          path: file,
          runner,
          kind: "package-config",
          executable: false,
        });
      }
    } catch {
      // An unreadable test file cannot establish a runner marker.
    }
  }
  return { markers, registeredTestFiles };
}

async function isInsideNestedGitWorktree(
  repositoryRoot: string,
  relative: string,
): Promise<boolean> {
  let directory = path.posix.dirname(relative);
  while (directory !== ".") {
    try {
      await lstat(path.join(repositoryRoot, directory, ".git"));
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    directory = path.posix.dirname(directory);
  }
  return false;
}

/** Enumerate tracked and non-ignored worktree files without executing repo code. */
export async function listRepositoryFiles(
  repositoryRoot: string,
): Promise<string[]> {
  const { stdout } = await runGit(repositoryRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const files: string[] = [];
  for (const candidate of stdout.split("\0")) {
    if (candidate === "") continue;
    const relative = normalizeRepositoryPath(candidate);
    if (await isInsideNestedGitWorktree(repositoryRoot, relative)) continue;
    let stat;
    try {
      stat = await lstat(path.join(repositoryRoot, relative));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    // Symlinks and nested-repository directory entries are not files that
    // discovery may later read. lstat never follows them (TM-002).
    if (stat.isFile()) files.push(relative);
  }
  return files.sort();
}

/**
 * Discover the repository shape from an explicit file list: package/runner
 * markers plus source/test topology. Purely inert reads.
 */
export async function discoverRepositoryShape(
  repositoryRoot: string,
  files: readonly string[],
): Promise<RepositoryShape> {
  const limitations: string[] = [];
  const manifests: PackageManifestFacts[] = [];
  const markers: RunnerMarker[] = [];

  const sorted = [...new Set(files)].sort();

  for (const file of sorted) {
    if (file !== "package.json" && !file.endsWith("/package.json")) {
      continue;
    }
    try {
      const parsed = await parseManifest(repositoryRoot, file);
      manifests.push(parsed.facts);
      markers.push(...dependencyMarkers(parsed.facts));
      markers.push(...parsed.scriptMarkers);
      if (parsed.hasJestConfigField) {
        markers.push({
          path: file,
          runner: "jest",
          kind: "package-config",
          executable: false,
        });
      }
    } catch (error) {
      limitations.push(
        `Package manifest ${file} was not readable as inert JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const fromConfigs = configMarkers(sorted);
  markers.push(...fromConfigs);
  for (const marker of fromConfigs) {
    if (marker.executable) {
      limitations.push(
        `Runner configuration ${marker.path} is executable JS/TS and was not read; zero-config treats it as present but unreadable.`,
      );
    }
  }

  const testFiles: string[] = [];
  const sourceFiles: string[] = [];
  for (const file of sorted) {
    if (!JS_TS_PATTERN.test(file)) {
      continue;
    }
    if (isTestFilePath(file)) {
      testFiles.push(file);
    } else {
      sourceFiles.push(file);
    }
  }
  const testMarkers = await testImportMarkers(repositoryRoot, testFiles);
  markers.push(...testMarkers.markers);

  const selection = detectRunner(
    markers,
    testFiles,
    testMarkers.registeredTestFiles,
  );
  const unsupportedRunners = [
    ...new Set(
      markers
        .filter(
          (marker) =>
            marker.runner !== "vitest" &&
            marker.runner !== "jest" &&
            marker.runner !== "node:test",
        )
        .map((marker) => marker.runner),
    ),
  ].sort();
  if (unsupportedRunners.length > 0) {
    const names = unsupportedRunners.join(", ");
    limitations.push(
      markers.some(
        (marker) =>
          marker.runner === "vitest" ||
          marker.runner === "jest" ||
          marker.runner === "node:test",
      )
        ? selection.runner === "vitest" ||
          selection.runner === "jest" ||
          selection.runner === "node:test"
          ? `Unsupported test runner markers (${names}) coexist with a supported runner; ${selection.runner} was selected because every discovered test registration file has exactly one inert runner import, and ${testFiles.length - selection.runnerTestFiles.length} unsupported-runner test file(s) are excluded from execution/replay.`
          : `Unsupported test runner markers (${names}) coexist with supported tooling; runner selection is ambiguous and execution/replay are disabled. Every discovered test registration file must import exactly one recognized runner module before mixed-runner execution is safe.`
        : `Unsupported test runner markers (${names}) were found; only Vitest, Jest, and node:test can be executed or replayed.`,
    );
  }

  return {
    runner: selection.runner,
    runnerMarkers: markers.sort((left, right) =>
      `${left.path}:${left.runner}:${left.kind}`.localeCompare(
        `${right.path}:${right.runner}:${right.kind}`,
      ),
    ),
    runnerTestFiles: selection.runnerTestFiles,
    manifests,
    testFiles,
    sourceFiles,
    limitations,
  };
}
