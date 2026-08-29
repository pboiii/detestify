// Deterministic boundary facts over caller-supplied file lists. Output uses
// the boundary vocabulary the policy rules consume (rules.md: routes,
// persistence/migration markers, serialization/schema files, configuration,
// generated code). Pure path/text/AST matching; repository code never runs.

import path from "node:path";
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";
import {
  normalizeRelativePath,
  readContainedFile,
  type AnalyzerInput,
} from "./typescript.js";

export type BoundaryKind =
  | "route-registration"
  | "route-handler-export"
  | "migration"
  | "schema-serialization"
  | "config"
  | "generated-code";

export interface BoundaryFact {
  /** Repository-relative POSIX path of the file carrying the boundary. */
  readonly file: string;
  readonly kind: BoundaryKind;
  /** HTTP method for route facts (lowercase). */
  readonly method?: string;
  /** Route path, or the matched path pattern for non-route facts. */
  readonly path?: string;
  /** Extra detail: matched import specifier, marker text, or pattern name. */
  readonly detail?: string;
}

export interface BoundariesAnalysis {
  readonly boundaries: readonly BoundaryFact[];
  /** Files skipped because they could not be read. */
  readonly unreadableFiles: readonly string[];
}

const ROUTE_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "all",
  "route",
  "use",
]);

/** Common router variable names; reduces false member-call matches. */
const ROUTER_OBJECTS = new Set([
  "app",
  "router",
  "server",
  "fastify",
  "hono",
  "api",
  "route",
  "routes",
  "io",
]);

const HANDLER_EXPORTS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const SCHEMA_SERIALIZATION_PACKAGES = new Set([
  "zod",
  "valibot",
  "yup",
  "joi",
  "io-ts",
  "@sinclair/typebox",
  "class-validator",
  "class-transformer",
  "ajv",
  "superjson",
]);

const MIGRATION_PATH_PATTERNS: readonly { pattern: RegExp; detail: string }[] =
  [
    { pattern: /(^|\/)migrations\//, detail: "migrations directory" },
    { pattern: /(^|\/)migration\//, detail: "migration directory" },
    { pattern: /(^|\/)drizzle\//, detail: "drizzle migration output" },
    { pattern: /(^|\/)prisma\/schema\.prisma$/, detail: "prisma schema" },
    {
      pattern:
        /(^|\/)[^/]*migration[^/]*\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql)$/,
      detail: "migration file name",
    },
    { pattern: /\.sql$/, detail: "SQL file" },
  ];

const SCHEMA_PATH_PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: /(^|\/)[^/]*\.schema\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/,
    detail: "*.schema.* file",
  },
  { pattern: /(^|\/)schemas\//, detail: "schemas directory" },
  { pattern: /(^|\/)openapi[^/]*\.(json|ya?ml)$/, detail: "OpenAPI document" },
  { pattern: /(^|\/)swagger[^/]*\.(json|ya?ml)$/, detail: "Swagger document" },
];

const CONFIG_PATH_PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: /(^|\/)[^/]*\.config\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/,
    detail: "config module",
  },
  { pattern: /(^|\/)tsconfig[^/]*\.json$/, detail: "tsconfig" },
  { pattern: /(^|\/)package\.json$/, detail: "package manifest" },
  { pattern: /(^|\/)Dockerfile[^/]*$/, detail: "Dockerfile" },
  {
    pattern: /(^|\/)docker-compose[^/]*\.ya?ml$/,
    detail: "docker compose file",
  },
  { pattern: /(^|\/)\.env[^/]*$/, detail: "environment file" },
  {
    pattern: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/,
    detail: "CI workflow",
  },
  {
    pattern: /(^|\/)\.test-steward\/[^/]+\.json$/,
    detail: "test-steward configuration",
  },
  { pattern: /(^|\/)Makefile$/, detail: "Makefile" },
];

const GENERATED_PATH_PATTERNS: readonly { pattern: RegExp; detail: string }[] =
  [
    { pattern: /(^|\/)__generated__\//, detail: "__generated__ directory" },
    { pattern: /(^|\/)generated\//, detail: "generated directory" },
    {
      pattern: /(^|\/)[^/]*\.generated\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|d\.ts)$/,
      detail: "*.generated.* file",
    },
  ];

function pathFacts(
  file: string,
  patterns: readonly { pattern: RegExp; detail: string }[],
  kind: BoundaryKind,
): BoundaryFact[] {
  const matches = patterns.filter((entry) => entry.pattern.test(file));
  return matches.map((entry) => ({ file, kind, path: entry.detail }));
}

function isJavaScript(file: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file);
}

/** Route registration calls: `router.get("/path", handler)` style. */
function routeRegistrationFacts(
  sourceFile: SourceFile,
  file: string,
): BoundaryFact[] {
  const facts: BoundaryFact[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      continue;
    }
    const method = expression.getName().toLowerCase();
    if (!ROUTE_METHODS.has(method)) {
      continue;
    }
    const firstArgument = call.getArguments()[0];
    if (
      firstArgument === undefined ||
      firstArgument.getKind() !== SyntaxKind.StringLiteral
    ) {
      continue;
    }
    const routePath = firstArgument.getText().slice(1, -1);
    if (
      !routePath.startsWith("/") &&
      !ROUTER_OBJECTS.has(expression.getExpression().getText())
    ) {
      continue;
    }
    facts.push({
      file,
      kind: "route-registration",
      ...(ROUTE_METHODS.has(method) &&
      method !== "use" &&
      method !== "all" &&
      method !== "route"
        ? { method }
        : {}),
      path: routePath,
    });
  }
  return facts;
}

/** HTTP handler exports in framework conventions, e.g. `export async function GET`. */
function routeHandlerFacts(
  sourceFile: SourceFile,
  file: string,
): BoundaryFact[] {
  const facts: BoundaryFact[] = [];
  for (const statement of sourceFile.getStatements()) {
    let name: string | undefined;
    if (Node.isFunctionDeclaration(statement) && statement.hasExportKeyword()) {
      name = statement.getName();
    } else if (
      Node.isVariableStatement(statement) &&
      statement.hasExportKeyword()
    ) {
      const declarations = statement.getDeclarationList().getDeclarations();
      name = declarations.length === 1 ? declarations[0]?.getName() : undefined;
    }
    if (name === undefined || !HANDLER_EXPORTS.has(name)) {
      continue;
    }
    facts.push({
      file,
      kind: "route-handler-export",
      method: name.toLowerCase(),
      path: name,
    });
  }
  return facts;
}

function schemaImportFacts(
  sourceFile: SourceFile,
  file: string,
): BoundaryFact[] {
  const specifiers = new Set<string>();
  for (const statement of sourceFile.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      specifiers.add(statement.getModuleSpecifierValue());
    }
  }
  return [...specifiers]
    .filter((specifier) => SCHEMA_SERIALIZATION_PACKAGES.has(specifier))
    .map((specifier) => ({
      file,
      kind: "schema-serialization" as const,
      path: "serialization library import",
      detail: specifier,
    }));
}

const GENERATED_CONTENT_PATTERN =
  /(?:^|\n)[^\n]{0,200}(@generated|generated by|do not edit|auto-generated|automatically generated)/i;

function generatedContentFact(
  text: string,
  file: string,
): BoundaryFact | undefined {
  const head = text.slice(0, 4000);
  if (GENERATED_CONTENT_PATTERN.test(head)) {
    return { file, kind: "generated-code", path: "generated content marker" };
  }
  return undefined;
}

export async function analyzeBoundaries(
  input: AnalyzerInput,
): Promise<BoundariesAnalysis> {
  const repoRoot = input.repoRoot;
  const seen = new Set<string>();
  const files: string[] = [];
  for (const entry of input.files) {
    const normalized = normalizeRelativePath(entry);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      files.push(normalized);
    }
  }
  files.sort();

  const unreadableFiles: string[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  const boundaries: BoundaryFact[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = await readContainedFile(repoRoot, file);
    } catch {
      unreadableFiles.push(file);
      continue;
    }

    boundaries.push(...pathFacts(file, MIGRATION_PATH_PATTERNS, "migration"));
    boundaries.push(
      ...pathFacts(file, SCHEMA_PATH_PATTERNS, "schema-serialization"),
    );
    boundaries.push(...pathFacts(file, CONFIG_PATH_PATTERNS, "config"));
    boundaries.push(
      ...pathFacts(file, GENERATED_PATH_PATTERNS, "generated-code"),
    );

    const generated = generatedContentFact(text, file);
    if (generated !== undefined) {
      boundaries.push(generated);
    }

    if (isJavaScript(file)) {
      const sourceFile = project.createSourceFile(
        path.join(repoRoot, file),
        text,
      );
      boundaries.push(...routeRegistrationFacts(sourceFile, file));
      boundaries.push(...routeHandlerFacts(sourceFile, file));
      boundaries.push(...schemaImportFacts(sourceFile, file));
    }
  }

  boundaries.sort((left, right) => {
    const byFile = left.file.localeCompare(right.file);
    if (byFile !== 0) {
      return byFile;
    }
    const byKind = left.kind.localeCompare(right.kind);
    if (byKind !== 0) {
      return byKind;
    }
    return (left.path ?? "").localeCompare(right.path ?? "");
  });

  return { boundaries, unreadableFiles };
}
