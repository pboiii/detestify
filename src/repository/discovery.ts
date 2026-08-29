// Inert repository-shape discovery (threat model TM-003): package.json is
// parsed as data, runner presence is inferred from dependency and file
// markers, and source/test topology comes from path conventions alone.
// Repository code and executable configuration (vitest.config.ts, jest
// config JS) are never executed or imported; JS/TS config files are reported
// present-but-unreadable as an explicit limitation.

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { realpathContained } from "./paths.js";

// Standard JS/TS test naming conventions. Kept local: the analysis layer is
// deliberately decoupled from this repository layer (ADR-002 layering).
const TEST_FILE_PATTERN =
  /(^|\/)[^/]*\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_DIRECTORY_PATTERN =
  /(^|\/)__tests__\/[^/]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function isTestFilePath(file: string): boolean {
  return TEST_FILE_PATTERN.test(file) || TEST_DIRECTORY_PATTERN.test(file);
}

export type RunnerKind = "vitest" | "jest" | "unknown" | "none";

export interface RunnerMarker {
  /** Repository-relative POSIX path of the marker. */
  readonly path: string;
  readonly runner: "vitest" | "jest";
  /** How the marker was recognized. */
  readonly kind: "dependency" | "config-file" | "package-config";
  /** True when the config file could not be read inertly (JS/TS config). */
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

interface ParsedManifest {
  readonly facts: PackageManifestFacts;
  readonly hasJestConfigField: boolean;
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
    }
  }
  return markers;
}

function detectRunner(markers: readonly RunnerMarker[]): RunnerKind {
  const runners = new Set(markers.map((marker) => marker.runner));
  if (runners.has("vitest") && runners.has("jest")) {
    return "unknown";
  }
  if (runners.has("vitest")) {
    return "vitest";
  }
  if (runners.has("jest")) {
    return "jest";
  }
  return "none";
}

/** Enumerate repository files by walking the worktree, skipping .git and node_modules. */
export async function listRepositoryFiles(
  repositoryRoot: string,
): Promise<string[]> {
  const files: string[] = [];
  const walk = async (relative: string): Promise<void> => {
    const absolute = path.join(repositoryRoot, relative);
    const entries = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const entryRelative =
        relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      // lstat via Dirent: symlinked directories are not followed, so a link
      // pointing outside the repository cannot extend the walk (TM-002).
      if (entry.isDirectory()) {
        await walk(entryRelative);
      } else if (entry.isFile()) {
        files.push(entryRelative);
      }
    }
  };
  await walk("");
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

  return {
    runner: detectRunner(markers),
    runnerMarkers: markers.sort((left, right) =>
      `${left.path}:${left.runner}:${left.kind}`.localeCompare(
        `${right.path}:${right.runner}:${right.kind}`,
      ),
    ),
    manifests,
    testFiles,
    sourceFiles,
    limitations,
  };
}
