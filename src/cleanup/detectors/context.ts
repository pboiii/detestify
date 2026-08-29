// Shared detector context: reads each test file once, extracts the plain AST
// facts every detector consumes, and carries the src/analysis test inventory.
// Read-only; repository code never runs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type SourceFile,
} from "ts-morph";
import ts from "typescript";
import { analyzeTests, type TestFileFacts } from "../../analysis/tests.js";
import { listRepositoryFiles } from "../../repository/discovery.js";

/** Chain modifiers between `expect(...)` and the matcher. */
const EXPECT_MODIFIERS = new Set(["not", "resolves", "rejects", "soft"]);
const TEST_NAMES = new Set(["it", "test"]);

export interface AssertionSubjectFacts {
  /** Subject is a literal-only expression (constant assertion). */
  readonly isLiteral: boolean;
  readonly literalValue?: unknown;
  /** Subject contains at least one call expression. */
  readonly hasCall: boolean;
  /** Base identifier names of every call inside the subject. */
  readonly calleeNames: readonly string[];
  /** Trailing property path over the subject base, e.g. `f().a.b` → ["a","b"]. */
  readonly propertyPath: readonly string[];
  /** Base callee name when the subject base is a call, else null. */
  readonly baseCallee: string | null;
  /** Base identifier name when the subject base is a plain identifier, else null. */
  readonly baseIdentifier: string | null;
}

export interface AssertionFact {
  /** Final matcher name (`toBe`, `toEqual`, …), null when no matcher call found. */
  readonly matcher: string | null;
  /** Whitespace-collapsed text of the full assertion expression. */
  readonly normalizedText: string;
  readonly subject: AssertionSubjectFacts | null;
  /** First matcher argument as a literal, when it is literal-only. */
  readonly expected: { readonly isLiteral: boolean; readonly value?: unknown };
  readonly matcherArgCount: number;
  /** Largest matcher-argument line span (inline snapshot size proxy). */
  readonly matcherArgLines: number;
}

export interface TestDeclarationFacts {
  readonly name: string;
  readonly retry: number | null;
  readonly timeoutMs: number | null;
}

export interface NamedImportFacts {
  readonly specifier: string;
  /** Original exported names (aliases resolved to the source name). */
  readonly names: readonly string[];
}

export interface TestFileSource {
  /** Repository-relative POSIX path. */
  readonly file: string;
  readonly text: string;
  /** Comment-free, printer-normalized AST text for AST-equality checks. */
  readonly normalizedAst: string;
  readonly assertions: readonly AssertionFact[];
  readonly namedImports: readonly NamedImportFacts[];
  /** Every identifier name declared anywhere in the file (imports included). */
  readonly declaredNames: ReadonlySet<string>;
  readonly testDeclarations: readonly TestDeclarationFacts[];
  /** File-level retry from `jest.retryTimes(n)`, null when absent. */
  readonly fileRetry: number | null;
  /** src/analysis inventory facts for the same file. */
  readonly inventory: TestFileFacts;
}

export interface DetectorContext {
  readonly repoRoot: string;
  /** Repository file universe used for import resolution. */
  readonly files: readonly string[];
  readonly tests: readonly TestFileSource[];
  /** Test files that matched a test convention but could not be read. */
  readonly unreadableFiles: readonly string[];
}

function literalValue(node: Node): { ok: boolean; value?: unknown } {
  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node)) {
    return literalValue(node.getExpression());
  }
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return { ok: true, value: node.getLiteralText() };
  }
  if (Node.isNumericLiteral(node)) {
    return { ok: true, value: node.getLiteralValue() };
  }
  if (Node.isPrefixUnaryExpression(node)) {
    const operand = node.getOperand();
    if (
      node.getOperatorToken() === SyntaxKind.MinusToken &&
      Node.isNumericLiteral(operand)
    ) {
      return { ok: true, value: -operand.getLiteralValue() };
    }
    return { ok: false };
  }
  if (node.getKind() === SyntaxKind.TrueKeyword) {
    return { ok: true, value: true };
  }
  if (node.getKind() === SyntaxKind.FalseKeyword) {
    return { ok: true, value: false };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { ok: true, value: null };
  }
  if (Node.isObjectLiteralExpression(node)) {
    const value: Record<string, unknown> = {};
    for (const property of node.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        return { ok: false };
      }
      const nameNode = property.getNameNode();
      const name = Node.isStringLiteral(nameNode)
        ? nameNode.getLiteralText()
        : Node.isIdentifier(nameNode)
          ? nameNode.getText()
          : null;
      if (name === null) {
        return { ok: false };
      }
      const initializer = property.getInitializer();
      if (initializer === undefined) {
        return { ok: false };
      }
      const nested = literalValue(initializer);
      if (!nested.ok) {
        return { ok: false };
      }
      value[name] = nested.value;
    }
    return { ok: true, value };
  }
  if (Node.isArrayLiteralExpression(node)) {
    const value: unknown[] = [];
    for (const element of node.getElements()) {
      const nested = literalValue(element);
      if (!nested.ok) {
        return { ok: false };
      }
      value.push(nested.value);
    }
    return { ok: true, value };
  }
  return { ok: false };
}

/** Base identifier name of a call's callee, e.g. `a.b.c(...)` → "a". */
function calleeBaseName(call: CallExpression): string | null {
  let current: Node = call.getExpression();
  while (true) {
    if (Node.isIdentifier(current)) {
      return current.getText();
    }
    if (Node.isPropertyAccessExpression(current)) {
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

function subjectFacts(node: Node): AssertionSubjectFacts {
  const literal = literalValue(node);

  const propertyPath: string[] = [];
  let base: Node = node;
  while (Node.isPropertyAccessExpression(base)) {
    propertyPath.unshift(base.getName());
    base = base.getExpression();
  }

  const calleeNames: string[] = [];
  const calls = [
    ...(Node.isCallExpression(node) ? [node] : []),
    ...node.getDescendantsOfKind(SyntaxKind.CallExpression),
  ];
  for (const call of calls) {
    const name = calleeBaseName(call);
    if (name !== null && !calleeNames.includes(name)) {
      calleeNames.push(name);
    }
  }

  const facts: {
    -readonly [K in keyof AssertionSubjectFacts]: AssertionSubjectFacts[K];
  } = {
    isLiteral: literal.ok,
    hasCall: calls.length > 0,
    calleeNames,
    propertyPath,
    baseCallee: Node.isCallExpression(base) ? calleeBaseName(base) : null,
    baseIdentifier: Node.isIdentifier(base) ? base.getText() : null,
  };
  if (literal.ok) {
    facts.literalValue = literal.value;
  }
  return facts;
}

/** Climb from an `expect(...)` call to its matcher call through modifiers. */
function findMatcherCall(expectCall: CallExpression): CallExpression | null {
  let current: Node = expectCall;
  while (true) {
    const parent = current.getParent();
    if (
      parent === undefined ||
      !Node.isPropertyAccessExpression(parent) ||
      parent.getExpression() !== current
    ) {
      return null;
    }
    const grand = parent.getParent();
    if (
      grand !== undefined &&
      Node.isCallExpression(grand) &&
      grand.getExpression() === parent
    ) {
      return grand;
    }
    if (EXPECT_MODIFIERS.has(parent.getName())) {
      current = parent;
      continue;
    }
    return null;
  }
}

function matcherName(matcherCall: CallExpression): string | null {
  const expression = matcherCall.getExpression();
  return Node.isPropertyAccessExpression(expression)
    ? expression.getName()
    : null;
}

function extractAssertions(sourceFile: SourceFile): AssertionFact[] {
  const assertions: AssertionFact[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (!Node.isIdentifier(expression) || expression.getText() !== "expect") {
      continue;
    }
    const subjectNode = call.getArguments()[0];
    const matcherCall = findMatcherCall(call);
    const matcherArgs = matcherCall?.getArguments() ?? [];
    const firstArg = matcherArgs[0];
    const expectedLiteral =
      firstArg === undefined ? { ok: false } : literalValue(firstArg);
    let matcherArgLines = 0;
    for (const argument of matcherArgs) {
      const lines =
        argument.getEndLineNumber() - argument.getStartLineNumber() + 1;
      matcherArgLines = Math.max(matcherArgLines, lines);
    }
    const outer = matcherCall ?? call;
    const expected: { isLiteral: boolean; value?: unknown } = {
      isLiteral: expectedLiteral.ok,
    };
    if (expectedLiteral.ok) {
      expected.value = expectedLiteral.value;
    }
    assertions.push({
      matcher: matcherCall === null ? null : matcherName(matcherCall),
      normalizedText: outer.getText().replace(/\s+/g, " "),
      subject: subjectNode === undefined ? null : subjectFacts(subjectNode),
      expected,
      matcherArgCount: matcherArgs.length,
      matcherArgLines,
    });
  }
  return assertions;
}

function extractTestDeclarations(
  sourceFile: SourceFile,
): TestDeclarationFacts[] {
  const declarations: TestDeclarationFacts[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const base = calleeBaseName(call);
    if (base === null || !TEST_NAMES.has(base)) {
      continue;
    }
    const args = call.getArguments();
    const first = args[0];
    if (first === undefined || !Node.isStringLiteral(first)) {
      continue;
    }
    let retry: number | null = null;
    let timeoutMs: number | null = null;
    for (const argument of args.slice(1)) {
      if (Node.isObjectLiteralExpression(argument)) {
        const options = literalValue(argument);
        if (options.ok && typeof options.value === "object") {
          const record = options.value as Record<string, unknown>;
          if (typeof record["retry"] === "number") {
            retry = record["retry"];
          }
          if (typeof record["timeout"] === "number") {
            timeoutMs = record["timeout"];
          }
        }
      }
      if (Node.isNumericLiteral(argument)) {
        timeoutMs = argument.getLiteralValue();
      }
    }
    declarations.push({ name: first.getLiteralText(), retry, timeoutMs });
  }
  return declarations;
}

function extractFileRetry(sourceFile: SourceFile): number | null {
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = call.getExpression();
    if (
      Node.isPropertyAccessExpression(expression) &&
      expression.getName() === "retryTimes" &&
      Node.isIdentifier(expression.getExpression()) &&
      expression.getExpression().getText() === "jest"
    ) {
      const argument = call.getArguments()[0];
      if (argument !== undefined && Node.isNumericLiteral(argument)) {
        return argument.getLiteralValue();
      }
    }
  }
  return null;
}

function extractNamedImports(sourceFile: SourceFile): NamedImportFacts[] {
  const imports: NamedImportFacts[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    const names = declaration
      .getNamedImports()
      .map((element) => element.getName());
    imports.push({
      specifier: declaration.getModuleSpecifierValue(),
      names,
    });
  }
  return imports;
}

function extractDeclaredNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  const addIdentifier = (node: Node | undefined): void => {
    if (node !== undefined && Node.isIdentifier(node)) {
      names.add(node.getText());
    }
  };
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  )) {
    addIdentifier(declaration.getNameNode());
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.FunctionDeclaration,
  )) {
    addIdentifier(declaration.getNameNode());
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.ClassDeclaration,
  )) {
    addIdentifier(declaration.getNameNode());
  }
  for (const parameter of sourceFile.getDescendantsOfKind(
    SyntaxKind.Parameter,
  )) {
    addIdentifier(parameter.getNameNode());
  }
  for (const binding of sourceFile.getDescendantsOfKind(
    SyntaxKind.BindingElement,
  )) {
    addIdentifier(binding.getNameNode());
  }
  for (const declaration of sourceFile.getImportDeclarations()) {
    const defaultImport = declaration.getDefaultImport();
    addIdentifier(defaultImport);
    const namespaceImport = declaration.getNamespaceImport();
    addIdentifier(namespaceImport);
    for (const named of declaration.getNamedImports()) {
      names.add((named.getAliasNode() ?? named.getNameNode()).getText());
    }
  }
  return names;
}

/**
 * Build the shared detector context: run the src/analysis test inventory over
 * the file universe, then parse each readable test file once.
 */
export async function loadDetectorContext(
  repoRoot: string,
  files?: readonly string[],
): Promise<DetectorContext> {
  const universe = files ?? (await listRepositoryFiles(repoRoot));
  const inventory = await analyzeTests({ repoRoot, files: universe });

  const project = new Project({ useInMemoryFileSystem: true });
  const printer = ts.createPrinter({ removeComments: true });
  const tests: TestFileSource[] = [];

  for (const facts of inventory.testFiles) {
    const text = await readFile(path.join(repoRoot, facts.file), "utf8");
    const sourceFile = project.createSourceFile(`/${facts.file}`, text);
    tests.push({
      file: facts.file,
      text,
      normalizedAst: printer.printFile(sourceFile.compilerNode),
      assertions: extractAssertions(sourceFile),
      namedImports: extractNamedImports(sourceFile),
      declaredNames: extractDeclaredNames(sourceFile),
      testDeclarations: extractTestDeclarations(sourceFile),
      fileRetry: extractFileRetry(sourceFile),
      inventory: facts,
    });
  }

  return {
    repoRoot,
    files: universe,
    tests,
    unreadableFiles: inventory.unreadableFiles,
  };
}
