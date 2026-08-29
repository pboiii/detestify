// Nearby-test inventory: which repository files are tests by naming
// convention, what suites/tests they declare, and which source files they
// import directly. Pure AST/text facts; repository code never runs.

import path from "node:path";
import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type SourceFile,
} from "ts-morph";
import {
  normalizeRelativePath,
  readContainedFile,
  resolveModuleSpecifier,
  type AnalyzerInput,
  type ImportEdgeFact,
  type ResolutionContext,
} from "./typescript.js";

/** Standard JS/TS test-file naming conventions. */
export const TEST_FILE_PATTERN =
  /(^|\/)[^/]*\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_DIRECTORY_PATTERN =
  /(^|\/)__tests__\/[^/]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function isTestFilePath(file: string): boolean {
  return TEST_FILE_PATTERN.test(file) || TEST_DIRECTORY_PATTERN.test(file);
}

/** Nested suite/test tree; suites have children, tests are leaves. */
export interface SuiteNode {
  readonly name: string;
  readonly kind: "suite" | "test";
  readonly children: readonly SuiteNode[];
}

export interface TestFileFacts {
  /** Repository-relative POSIX path of the test file. */
  readonly file: string;
  readonly suites: readonly SuiteNode[];
  /** Number of assertion calls (`expect(...)`, `assert.*(...)`). */
  readonly assertions: number;
  readonly usesSnapshots: boolean;
  readonly usesMocks: boolean;
  /** Direct import edges to repository files (re-exports included). */
  readonly imports: readonly ImportEdgeFact[];
}

export interface TestInventory {
  readonly testFiles: readonly TestFileFacts[];
  /** Input files that matched a test convention but could not be read. */
  readonly unreadableFiles: readonly string[];
}

/** Suite/test declarations recognized across Jest, Vitest, Mocha, and node:test. */
const SUITE_NAMES = new Set(["describe", "context", "suite"]);
const TEST_NAMES = new Set(["it", "test"]);

const SNAPSHOT_METHODS = new Set(["toMatchSnapshot", "toMatchInlineSnapshot"]);
const MOCK_OBJECT_METHODS = new Map<string, ReadonlySet<string>>([
  [
    "vi",
    new Set([
      "mock",
      "fn",
      "spyOn",
      "unmock",
      "doMock",
      "doUnmock",
      "mocked",
      "hoisted",
    ]),
  ],
  [
    "jest",
    new Set([
      "mock",
      "fn",
      "spyOn",
      "unmock",
      "doMock",
      "doUnmock",
      "mocked",
      "genMockFromModule",
    ]),
  ],
  ["sinon", new Set(["stub", "spy", "mock", "fake"])],
]);
const MOCK_CHAIN_METHODS = new Set([
  "mockImplementation",
  "mockImplementationOnce",
  "mockReturnValue",
  "mockReturnValueOnce",
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockRejectedValue",
  "mockRejectedValueOnce",
  "mockClear",
  "mockReset",
  "mockRestore",
]);

function unwrapCallee(expression: Expression): {
  baseName: string;
  modifier: string | null;
} | null {
  let current: Expression = expression;
  let modifier: string | null = null;
  while (true) {
    if (Node.isIdentifier(current)) {
      return { baseName: current.getText(), modifier };
    }
    if (Node.isPropertyAccessExpression(current)) {
      modifier ??= current.getName();
      current = current.getExpression();
      continue;
    }
    if (Node.isCallExpression(current)) {
      current = current.getExpression();
      continue;
    }
    return null;
  }
}

/** True for `describe`/`it`/`test` declarations, including `.each`/`.skip` forms. */
function isRunnableDeclaration(call: CallExpression): boolean {
  const callee = unwrapCallee(call.getExpression());
  if (callee === null) {
    return false;
  }
  return SUITE_NAMES.has(callee.baseName) || TEST_NAMES.has(callee.baseName);
}

function firstStringArgument(call: CallExpression): string | undefined {
  const first = call.getArguments()[0];
  if (first !== undefined && Node.isStringLiteral(first)) {
    return first.getLiteralText();
  }
  return undefined;
}

function callbackArgument(call: CallExpression): Node | undefined {
  const args = call.getArguments();
  for (const argument of args) {
    if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument)) {
      return argument.getBody();
    }
  }
  return undefined;
}

function collectSuites(sourceFile: SourceFile): SuiteNode[] {
  const topLevel: SuiteNode[] = [];

  // Depth-first over statements and expression bodies: suites nest through
  // their callback body, `it.each([...])("name", ...)` keeps a test leaf.
  const walkStatement = (statement: Node, into: SuiteNode[]): void => {
    if (Node.isCallExpression(statement)) {
      walkCall(statement, into);
      return;
    }
    for (const child of statement.getChildren()) {
      walkStatement(child, into);
    }
  };

  const walkCall = (call: CallExpression, into: SuiteNode[]): void => {
    const name = firstStringArgument(call);
    const callee = isRunnableDeclaration(call)
      ? unwrapCallee(call.getExpression())
      : null;
    if (name !== undefined && callee !== null) {
      if (SUITE_NAMES.has(callee.baseName)) {
        const children: SuiteNode[] = [];
        into.push({ name, kind: "suite", children });
        const body = callbackArgument(call);
        if (body !== undefined) {
          for (const child of body.getChildren()) {
            walkStatement(child, children);
          }
        }
        return;
      }
      if (TEST_NAMES.has(callee.baseName)) {
        into.push({ name, kind: "test", children: [] });
        return;
      }
    }
    for (const child of call.getChildren()) {
      walkStatement(child, into);
    }
  };

  for (const statement of sourceFile.getStatements()) {
    walkStatement(statement, topLevel);
  }
  return topLevel;
}

function countAssertions(sourceFile: SourceFile): number {
  let count = 0;
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (Node.isIdentifier(expression) && expression.getText() === "expect") {
      count += 1;
    } else if (
      Node.isPropertyAccessExpression(expression) &&
      Node.isIdentifier(expression.getExpression()) &&
      expression.getExpression().getText() === "assert"
    ) {
      count += 1;
    }
  }
  return count;
}

function usesSnapshots(sourceFile: SourceFile): boolean {
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (
      Node.isPropertyAccessExpression(expression) &&
      SNAPSHOT_METHODS.has(expression.getName())
    ) {
      return true;
    }
  }
  return false;
}

function usesMocks(sourceFile: SourceFile): boolean {
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      continue;
    }
    const method = expression.getName();
    if (MOCK_CHAIN_METHODS.has(method)) {
      return true;
    }
    const objectExpression = expression.getExpression();
    if (!Node.isIdentifier(objectExpression)) {
      continue;
    }
    const allowed = MOCK_OBJECT_METHODS.get(objectExpression.getText());
    if (allowed !== undefined && allowed.has(method)) {
      return true;
    }
  }
  return false;
}

export async function analyzeTests(
  input: AnalyzerInput,
): Promise<TestInventory> {
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

  const universe = seen;
  const context: ResolutionContext = {
    repoRoot,
    universe,
    compilerOptions: {},
  };
  const project = new Project({ useInMemoryFileSystem: true });

  const unreadableFiles: string[] = [];
  const testFiles: TestFileFacts[] = [];

  for (const file of files) {
    if (!isTestFilePath(file)) {
      continue;
    }
    let text: string;
    try {
      text = await readContainedFile(repoRoot, file);
    } catch {
      unreadableFiles.push(file);
      continue;
    }
    const sourceFile = project.createSourceFile(
      path.join(repoRoot, file),
      text,
    );
    testFiles.push({
      file,
      suites: collectSuites(sourceFile),
      assertions: countAssertions(sourceFile),
      usesSnapshots: usesSnapshots(sourceFile),
      usesMocks: usesMocks(sourceFile),
      imports: extractTestImports(file, sourceFile, context),
    });
  }

  return { testFiles, unreadableFiles };
}

function extractTestImports(
  fromFile: string,
  sourceFile: SourceFile,
  context: ResolutionContext,
): ImportEdgeFact[] {
  const edges: ImportEdgeFact[] = [];
  const push = (specifier: string): void => {
    const resolved = resolveModuleSpecifier(specifier, fromFile, context);
    edges.push({
      from: fromFile,
      specifier,
      to: resolved.to,
      resolution: resolved.resolution,
    });
  };
  for (const statement of sourceFile.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      push(statement.getModuleSpecifierValue());
    }
  }
  return edges;
}
