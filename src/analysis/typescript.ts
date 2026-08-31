// JS/TS analyzer: deterministic syntactic facts over caller-supplied file lists.
// The input is plain data (repository root plus explicit relative paths) so the
// repository layer can adapt this module without a code dependency (ADR-002).
// Every fact is extracted by parsing text; repository code is never executed.

import path from "node:path";
import { readContainedRegularFile } from "../repository/paths.js";
import {
  Node,
  Project,
  SyntaxKind,
  ts,
  type ArrowFunction,
  type ClassDeclaration,
  type FunctionDeclaration,
  type FunctionExpression,
  type MethodDeclaration,
  type SourceFile,
} from "ts-morph";

/**
 * Read a changed/inventoried repository file after symlink containment
 * (TM-002/TM-005). Changed paths come from Git and may be symlinks that
 * escape the repository root; the shared reader resolves symlinks, enforces
 * containment and regular-file type, and caps the read before parsing.
 */
export async function readContainedFile(
  repoRoot: string,
  file: string,
): Promise<string> {
  return (
    await readContainedRegularFile(repoRoot, file, SOURCE_FILE_SIZE_LIMIT)
  ).toString("utf8");
}

/** Capability mode requested for an analysis run. */
export type AnalyzerCapabilityMode = "syntactic" | "type-resolved";

/** Analyzed files are addressed as repository-root-relative POSIX paths. */
export interface AnalyzerInput {
  /** Absolute repository root all input paths are relative to. */
  readonly repoRoot: string;
  /** Repository files to analyze, repo-root-relative POSIX paths. */
  readonly files: readonly string[];
}

export interface TypeScriptAnalyzerInput extends AnalyzerInput {
  /** Capability to negotiate; defaults to "type-resolved" with graceful degradation. */
  readonly requested?: AnalyzerCapabilityMode;
  /** tsconfig.json location relative to the repository root; defaults to "tsconfig.json". */
  readonly tsconfigPath?: string;
}

export interface AnalyzerLimitation {
  readonly code: string;
  readonly detail: string;
}

export interface FileDiagnostic {
  readonly file: string;
  readonly message: string;
  readonly code?: number;
}

/**
 * Capability report per the AST contract boundary (tool dossier): achieved
 * mode, parser version, skipped files, diagnostics, and limitations.
 */
export interface TypeScriptCapabilities {
  readonly requested: AnalyzerCapabilityMode;
  /** Capability actually achieved after degradation. */
  readonly mode: AnalyzerCapabilityMode;
  /** Version of the TypeScript parser ts-morph wraps. */
  readonly parserVersion: string;
  /** How import specifiers were resolved for this run. */
  readonly moduleResolution: "path-based" | "tsconfig";
  readonly limitations: readonly AnalyzerLimitation[];
  /** Syntax-level diagnostics per analyzed file. */
  readonly parseDiagnostics: readonly FileDiagnostic[];
  /** Input files not analyzed, with the reason analysis was skipped. */
  readonly skippedFiles: readonly string[];
}

export type ExportKind =
  | "function"
  | "class"
  | "interface"
  | "type-alias"
  | "enum"
  | "const"
  | "let"
  | "var"
  | "namespace"
  | "unknown";

export interface ExportedSymbolFact {
  /** Exported name; "default" for default exports, "*" for `export *`. */
  readonly name: string;
  readonly kind: ExportKind;
  readonly form: "named" | "default" | "star";
}

export interface SignatureFact {
  readonly name: string;
  readonly kind: "function" | "class" | "method";
  /** Canonical body-free signature text, e.g. `normalizeEmail(value: string): string`. */
  readonly text: string;
}

/** How an import specifier mapped against the supplied file universe. */
export type ImportResolution = "in-repo" | "external-package" | "unresolved";

export interface ImportEdgeFact {
  readonly from: string;
  /** Module specifier exactly as written in the source. */
  readonly specifier: string;
  /** Resolved repository path when the specifier maps into the repository, else null. */
  readonly to: string | null;
  readonly resolution: ImportResolution;
}

export interface SourceFileFacts {
  readonly file: string;
  readonly exports: readonly ExportedSymbolFact[];
  readonly signatures: readonly SignatureFact[];
  readonly imports: readonly ImportEdgeFact[];
}

export interface TypeScriptAnalysis {
  readonly capabilities: TypeScriptCapabilities;
  readonly files: readonly SourceFileFacts[];
}

/**
 * True when TypeScript erases both revisions to identical runtime code.
 * This proves only that no JavaScript behavior changed; type-level contracts
 * still belong to the repository's existing typecheck.
 */
export function hasEquivalentRuntimeEmit(
  before: string,
  after: string,
  fileName: string,
): boolean {
  const emit = (source: string): string | null => {
    const result = ts.transpileModule(source, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        removeComments: true,
        sourceMap: false,
        inlineSourceMap: false,
        declaration: false,
        newLine: ts.NewLineKind.LineFeed,
      },
    });
    if (
      result.diagnostics?.some(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      )
    ) {
      return null;
    }
    return result.outputText;
  };
  const beforeEmit = emit(before);
  const afterEmit = emit(after);
  return beforeEmit !== null && afterEmit !== null && beforeEmit === afterEmit;
}

/** TypeScript compiler options used for module specifier resolution. */
export interface ResolutionContext {
  readonly repoRoot: string;
  /** Known repository files (normalized relative POSIX paths) import edges may target. */
  readonly universe: ReadonlySet<string>;
  readonly compilerOptions: ts.CompilerOptions;
}

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SOURCE_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
const TSCONFIG_SIZE_LIMIT = 1024 * 1024;

const TS_TO_DECLARATION_EXTENSIONS: Record<string, readonly string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/**
 * Normalize a caller-supplied repository path lexically. Throws when the path
 * is absolute or escapes the repository root; symlink containment is the
 * repository layer's responsibility.
 */
export function normalizeRelativePath(value: string): string {
  if (path.isAbsolute(value)) {
    throw new Error(`Analyzer input must be repository-relative: ${value}`);
  }
  const normalized = toPosix(path.normalize(value));
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === "." ||
    normalized === ""
  ) {
    throw new Error(`Analyzer input escapes repository root: ${value}`);
  }
  return normalized;
}

function isInsideRepository(repoRoot: string, absolutePath: string): boolean {
  const relative = toPosix(path.relative(repoRoot, absolutePath));
  return (
    relative !== "" && !relative.startsWith("../") && !path.isAbsolute(relative)
  );
}

/** Candidate declaration paths for a relative specifier, TypeScript-style. */
function relativeCandidates(target: string): string[] {
  const extension = path.posix.extname(target).toLowerCase();
  const candidates: string[] = [];
  if (extension !== "" && SUPPORTED_EXTENSIONS.has(extension)) {
    const stem = target.slice(0, target.length - extension.length);
    candidates.push(
      ...(TS_TO_DECLARATION_EXTENSIONS[extension] ?? [extension]).map(
        (candidateExtension) => stem + candidateExtension,
      ),
    );
    candidates.push(target);
  }
  for (const base of [target, ...candidates.slice()]) {
    candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.d.ts`);
    candidates.push(`${base}/index.ts`, `${base}/index.tsx`);
  }
  return [...new Set(candidates)];
}

// Directory existence is intentionally left undefined: a false answer makes
// the TypeScript resolver reject tsconfig paths-alias directories outright.
const minimalModuleResolutionHost: ts.ModuleResolutionHost = {
  fileExists: () => false,
  readFile: () => "",
  realpath: (value) => value,
  getCurrentDirectory: () => "",
  getDirectories: () => [],
};

/**
 * Resolve one module specifier to a repository path. Relative specifiers are
 * resolved by path arithmetic against the supplied universe; bare specifiers
 * go through the TypeScript resolver so tsconfig `paths` aliases work.
 */
export function resolveModuleSpecifier(
  specifier: string,
  fromFile: string,
  context: ResolutionContext,
): { to: string | null; resolution: ImportResolution } {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromFile), specifier),
    );
    for (const candidate of relativeCandidates(target)) {
      if (context.universe.has(candidate)) {
        return { to: candidate, resolution: "in-repo" };
      }
    }
    return { to: null, resolution: "unresolved" };
  }
  if (specifier.startsWith("/")) {
    return { to: null, resolution: "unresolved" };
  }
  const resolved = ts.resolveModuleName(
    specifier,
    path.join(context.repoRoot, fromFile),
    context.compilerOptions,
    {
      ...minimalModuleResolutionHost,
      fileExists: (candidate: string) => {
        if (!isInsideRepository(context.repoRoot, candidate)) {
          return false;
        }
        return context.universe.has(
          toPosix(path.relative(context.repoRoot, candidate)),
        );
      },
    },
  );
  const resolvedModule = resolved.resolvedModule;
  if (
    resolvedModule &&
    !resolvedModule.isExternalLibraryImport &&
    isInsideRepository(context.repoRoot, resolvedModule.resolvedFileName)
  ) {
    return {
      to: toPosix(
        path.relative(context.repoRoot, resolvedModule.resolvedFileName),
      ),
      resolution: "in-repo",
    };
  }
  return { to: null, resolution: "external-package" };
}

function compilerDiagnostics(sourceFile: SourceFile): readonly ts.Diagnostic[] {
  // The parser's own syntax diagnostics; not a public ts-morph API but stable
  // on the underlying SourceFile. Semantic diagnostics are intentionally not
  // requested because facts stay syntactic in both capability modes.
  const node = sourceFile.compilerNode as unknown as {
    parseDiagnostics?: readonly ts.Diagnostic[];
  };
  return node.parseDiagnostics ?? [];
}

interface LoadedCompilerOptions {
  readonly options: ts.CompilerOptions;
  readonly limitation?: AnalyzerLimitation;
}

async function loadCompilerOptions(
  repoRoot: string,
  tsconfigPath: string,
): Promise<LoadedCompilerOptions> {
  const absolutePath = path.join(repoRoot, tsconfigPath);
  let text: string;
  try {
    text = (
      await readContainedRegularFile(
        repoRoot,
        tsconfigPath,
        TSCONFIG_SIZE_LIMIT,
      )
    ).toString("utf8");
  } catch {
    return {
      options: {},
      limitation: {
        code: "TSCONFIG_MISSING",
        detail: `No readable tsconfig at ${tsconfigPath}; degraded to syntactic mode.`,
      },
    };
  }
  const config = ts.readConfigFile(absolutePath, () => text);
  if (config.error !== undefined) {
    return {
      options: {},
      limitation: {
        code: "TSCONFIG_PARSE_ERROR",
        detail: `tsconfig could not be parsed: ${ts.flattenDiagnosticMessageText(config.error.messageText, "\n")}`,
      },
    };
  }
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    readDirectory: () => [],
    fileExists: () => false,
    readFile: () => "",
    getDirectories: () => [],
  };
  const parsed = ts.parseJsonConfigFileContent(config.config, host, repoRoot);
  // 18003 ("No inputs were found") does not affect option derivation; the
  // analyzer never uses the parsed file list.
  const fatal = parsed.errors.filter((error) => error.code !== 18003);
  if (fatal.length > 0) {
    return {
      options: {},
      limitation: {
        code: "TSCONFIG_INVALID",
        detail: `tsconfig options could not be derived: ${ts.flattenDiagnosticMessageText(fatal[0]?.messageText, "\n")}`,
      },
    };
  }
  return { options: parsed.options };
}

function variableStatementKind(
  statement: Node,
): { kind: ExportKind; names: string[] } | undefined {
  if (!Node.isVariableStatement(statement)) {
    return undefined;
  }
  const list = statement.getDeclarationList();
  const declarationKind = list.getDeclarationKind();
  const kind: ExportKind =
    declarationKind === "const"
      ? "const"
      : declarationKind === "let"
        ? "let"
        : "var";
  return {
    kind,
    names: list.getDeclarations().map((declaration) => declaration.getName()),
  };
}

function extractExports(sourceFile: SourceFile): ExportedSymbolFact[] {
  const locals = new Map<string, ExportKind>();
  for (const statement of sourceFile.getStatements()) {
    let localName: string | undefined;
    let kind: ExportKind | undefined;
    if (Node.isFunctionDeclaration(statement)) {
      localName = statement.getName();
      kind = "function";
    } else if (Node.isClassDeclaration(statement)) {
      localName = statement.getName();
      kind = "class";
    } else if (Node.isInterfaceDeclaration(statement)) {
      localName = statement.getName();
      kind = "interface";
    } else if (Node.isTypeAliasDeclaration(statement)) {
      localName = statement.getName();
      kind = "type-alias";
    } else if (Node.isEnumDeclaration(statement)) {
      localName = statement.getName();
      kind = "enum";
    } else if (Node.isModuleDeclaration(statement)) {
      localName = statement.getName();
      kind = "namespace";
    } else {
      const variable = variableStatementKind(statement);
      if (variable !== undefined) {
        for (const name of variable.names) {
          locals.set(name, variable.kind);
        }
      }
    }
    if (localName !== undefined && kind !== undefined) {
      locals.set(localName, kind);
    }
  }

  const exports: ExportedSymbolFact[] = [];
  const push = (
    name: string,
    kind: ExportKind,
    form: ExportedSymbolFact["form"],
  ): void => {
    exports.push({ name, kind, form });
  };

  for (const statement of sourceFile.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.hasExportKeyword()) {
      if (statement.isDefaultExport()) {
        push("default", "function", "default");
      }
      const name = statement.getName();
      if (name !== undefined && !statement.isDefaultExport()) {
        push(name, "function", "named");
      }
    } else if (
      Node.isClassDeclaration(statement) &&
      statement.hasExportKeyword()
    ) {
      if (statement.isDefaultExport()) {
        push("default", "class", "default");
      }
      const name = statement.getName();
      if (name !== undefined && !statement.isDefaultExport()) {
        push(name, "class", "named");
      }
    } else if (
      Node.isInterfaceDeclaration(statement) &&
      statement.hasExportKeyword()
    ) {
      push(statement.getName(), "interface", "named");
    } else if (
      Node.isTypeAliasDeclaration(statement) &&
      statement.hasExportKeyword()
    ) {
      push(statement.getName(), "type-alias", "named");
    } else if (
      Node.isEnumDeclaration(statement) &&
      statement.hasExportKeyword()
    ) {
      push(statement.getName(), "enum", "named");
    } else if (
      Node.isModuleDeclaration(statement) &&
      statement.hasExportKeyword()
    ) {
      const name = statement.getName();
      if (name !== undefined) {
        push(name, "namespace", "named");
      }
    } else if (
      Node.isVariableStatement(statement) &&
      statement.hasExportKeyword()
    ) {
      const variable = variableStatementKind(statement);
      if (variable !== undefined) {
        for (const name of variable.names) {
          push(name, variable.kind, "named");
        }
      }
    } else if (Node.isExportDeclaration(statement)) {
      for (const named of statement.getNamedExports()) {
        const exportedName =
          named.getAliasNode()?.getText() ?? named.getNameNode().getText();
        const localName = named.getNameNode().getText();
        push(exportedName, locals.get(localName) ?? "unknown", "named");
      }
      const namespaceExport = statement.getNamespaceExport();
      if (namespaceExport !== undefined) {
        push(namespaceExport.getText(), "unknown", "star");
      } else if (
        statement.getModuleSpecifierValue() !== undefined &&
        statement.getNamedExports().length === 0
      ) {
        push("*", "unknown", "star");
      }
    } else if (Node.isExportAssignment(statement)) {
      if (statement.isExportEquals()) {
        push("export=", "unknown", "named");
      } else {
        push("default", "unknown", "default");
      }
    } else if (Node.isExpressionStatement(statement)) {
      const expression = statement.getExpression();
      if (!Node.isBinaryExpression(expression)) {
        continue;
      }
      const left = expression.getLeft();
      const right = expression.getRight();
      if (
        expression.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        Node.isPropertyAccessExpression(left) &&
        left.getExpression().getText() === "module" &&
        left.getName() === "exports" &&
        Node.isObjectLiteralExpression(right)
      ) {
        for (const property of right.getProperties()) {
          if (Node.isShorthandPropertyAssignment(property)) {
            const name = property.getName();
            push(name, locals.get(name) ?? "unknown", "named");
          }
        }
      }
    }
  }
  return exports;
}

function functionSignatureText(
  node: FunctionDeclaration | MethodDeclaration,
): string {
  const modifiers = node
    .getModifiers()
    .map((modifier) => modifier.getText())
    .filter(
      (text) => text === "async" || text === "static" || text === "abstract",
    );
  const typeParameters =
    node.getTypeParameters().length > 0
      ? `<${node
          .getTypeParameters()
          .map((parameter) => parameter.getText())
          .join(", ")}>`
      : "";
  const parameters = node
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(", ");
  const returnType = node.getReturnTypeNode();
  return `${modifiers.length > 0 ? `${modifiers.join(" ")} ` : ""}function ${node.getName() ?? "(anonymous)"}${typeParameters}(${parameters})${returnType ? `: ${returnType.getText()}` : ""}`;
}

function classSignatureText(node: ClassDeclaration): string {
  const typeParameters =
    node.getTypeParameters().length > 0
      ? `<${node
          .getTypeParameters()
          .map((parameter) => parameter.getText())
          .join(", ")}>`
      : "";
  const extendsExpression = node.getExtends();
  const extendsClause = extendsExpression
    ? ` extends ${extendsExpression.getText()}`
    : "";
  const implementsClause =
    node.getImplements().length > 0
      ? ` implements ${node
          .getImplements()
          .map((clause) => clause.getText())
          .join(", ")}`
      : "";
  return `class ${node.getName() ?? "(anonymous)"}${typeParameters}${extendsClause}${implementsClause}`;
}

function callableSignatureText(
  name: string,
  node: ArrowFunction | FunctionExpression,
): string {
  const typeParameters =
    node.getTypeParameters().length > 0
      ? `<${node
          .getTypeParameters()
          .map((parameter) => parameter.getText())
          .join(", ")}>`
      : "";
  const parameters = node
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(", ");
  const returnType = node.getReturnTypeNode();
  return `${name}${typeParameters}(${parameters})${returnType ? `: ${returnType.getText()}` : ""}`;
}

function extractSignatures(sourceFile: SourceFile): SignatureFact[] {
  const signatures: SignatureFact[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (Node.isFunctionDeclaration(statement)) {
      signatures.push({
        name: statement.getName() ?? "(anonymous)",
        kind: "function",
        text: functionSignatureText(statement),
      });
    } else if (Node.isClassDeclaration(statement)) {
      const className = statement.getName() ?? "(anonymous)";
      signatures.push({
        name: className,
        kind: "class",
        text: classSignatureText(statement),
      });
      for (const method of statement.getMethods()) {
        signatures.push({
          name: `${className}.${method.getName()}`,
          kind: "method",
          text: functionSignatureText(method),
        });
      }
    } else if (Node.isVariableStatement(statement)) {
      for (const declaration of statement
        .getDeclarationList()
        .getDeclarations()) {
        const initializer = declaration.getInitializer();
        if (
          initializer !== undefined &&
          (Node.isArrowFunction(initializer) ||
            Node.isFunctionExpression(initializer))
        ) {
          signatures.push({
            name: declaration.getName(),
            kind: "function",
            text: callableSignatureText(declaration.getName(), initializer),
          });
        }
      }
    }
  }
  return signatures;
}

/** All module specifiers referenced by import-bearing statements, in source order. */
function collectImportSpecifiers(sourceFile: SourceFile): string[] {
  const specifiers: string[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      specifiers.push(statement.getModuleSpecifierValue());
    } else if (Node.isExportDeclaration(statement)) {
      const moduleSpecifier = statement.getModuleSpecifierValue();
      if (moduleSpecifier !== undefined) {
        specifiers.push(moduleSpecifier);
      }
    }
  }
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const first = call.getArguments()[0];
    if (first === undefined || first.getKind() !== SyntaxKind.StringLiteral) {
      continue;
    }
    const literal = first.getText().slice(1, -1);
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      specifiers.push(literal);
    } else if (
      Node.isIdentifier(call.getExpression()) &&
      call.getExpression().getText() === "require"
    ) {
      specifiers.push(literal);
    }
  }
  return specifiers;
}

function extractImportEdges(
  fromFile: string,
  sourceFile: SourceFile,
  context: ResolutionContext,
): ImportEdgeFact[] {
  return collectImportSpecifiers(sourceFile).map((specifier) => {
    const resolved = resolveModuleSpecifier(specifier, fromFile, context);
    return {
      from: fromFile,
      specifier,
      to: resolved.to,
      resolution: resolved.resolution,
    };
  });
}

export async function analyzeTypeScript(
  input: TypeScriptAnalyzerInput,
): Promise<TypeScriptAnalysis> {
  const requested = input.requested ?? "type-resolved";
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

  const skippedFiles: string[] = [];
  const parseDiagnostics: FileDiagnostic[] = [];
  const supported = files.filter((file) =>
    SUPPORTED_EXTENSIONS.has(path.posix.extname(file)),
  );
  for (const file of files) {
    if (!SUPPORTED_EXTENSIONS.has(path.posix.extname(file))) {
      skippedFiles.push(file);
    }
  }

  let mode: AnalyzerCapabilityMode = "syntactic";
  let moduleResolution: TypeScriptCapabilities["moduleResolution"] =
    "path-based";
  let compilerOptions: ts.CompilerOptions = {};
  const limitations: AnalyzerLimitation[] = [];
  if (requested === "type-resolved") {
    const loaded = await loadCompilerOptions(
      repoRoot,
      input.tsconfigPath ?? "tsconfig.json",
    );
    compilerOptions = loaded.options;
    if (loaded.limitation === undefined) {
      mode = "type-resolved";
      moduleResolution = "tsconfig";
    } else {
      limitations.push(loaded.limitation);
    }
  }

  const context: ResolutionContext = {
    repoRoot,
    universe: seen,
    compilerOptions,
  };
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions });

  const facts: SourceFileFacts[] = [];
  for (const file of supported) {
    let text: string;
    try {
      text = await readContainedFile(repoRoot, file);
    } catch (error) {
      skippedFiles.push(file);
      parseDiagnostics.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const sourceFile = project.createSourceFile(
      path.join(repoRoot, file),
      text,
    );
    for (const diagnostic of compilerDiagnostics(sourceFile)) {
      const code = diagnostic.code;
      parseDiagnostics.push({
        file,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ...(Number.isInteger(code) ? { code } : {}),
      });
    }
    facts.push({
      file,
      exports: extractExports(sourceFile),
      signatures: extractSignatures(sourceFile),
      imports: extractImportEdges(file, sourceFile, context),
    });
  }

  return {
    capabilities: {
      requested,
      mode,
      parserVersion: ts.version,
      moduleResolution,
      limitations,
      parseDiagnostics,
      skippedFiles,
    },
    files: facts,
  };
}
