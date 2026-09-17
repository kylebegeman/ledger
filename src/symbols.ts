import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { LedgerError } from "./machine.js";
import { resolveProjectPath } from "./projectPaths.js";
import type { LedgerWorkspace } from "./types.js";

type TypeScriptModule = typeof import("typescript");

/** Extractors Ledger can run, in preference order for code files. */
export type LedgerSymbolExtractor = "typescript" | "regex" | "markdown" | "none";

export interface ExtractSymbolsOptions {
  /** `auto` prefers the TypeScript parser and falls back to regex; `typescript` fails when the parser is unavailable. */
  readonly parser?: "auto" | "typescript" | "regex";
  /** Test seam: replaces the `typescript` module loader. */
  readonly loadTypeScript?: () => Promise<TypeScriptModule | undefined>;
}

/** Symbols plus the extractor that produced them, so drafts can say what ran. */
export interface LedgerSymbolExtraction {
  readonly symbols: readonly string[];
  readonly extractor: LedgerSymbolExtractor;
  /** Present when a preferred extractor was unavailable and another ran instead. */
  readonly fallbackReason?: string;
}

export interface LedgerSymbolExtractorStatus {
  readonly name: "typescript" | "regex" | "markdown";
  readonly available: boolean;
  readonly version?: string;
  readonly reason?: string;
}

/** Extensions the TypeScript parser or regex fallback extracts code symbols from. */
export const codeExtensions: readonly string[] = [".ts", ".tsx", ".js", ".jsx"];

/** Languages Ledger recognizes but has no symbol extractor for, by extension. */
const otherLanguageExtensions: ReadonlyMap<string, string> = new Map([
  [".go", "Go"],
  [".rs", "Rust"],
  [".py", "Python"],
  [".swift", "Swift"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".rb", "Ruby"],
  [".c", "C and C++"],
  [".h", "C and C++"],
  [".cpp", "C and C++"],
  [".cs", "C#"],
]);

export interface LedgerSymbolLanguageSummary {
  /** True when any file has a TypeScript or JavaScript extension. */
  readonly extractable: boolean;
  /** Recognized languages without a symbol extractor, sorted. */
  readonly otherLanguages: readonly string[];
}

/** Whether code symbols can be extracted from these paths, and which other languages appear. */
export function summarizeSymbolLanguages(files: readonly string[]): LedgerSymbolLanguageSummary {
  let extractable = false;
  const otherLanguages = new Set<string>();
  for (const file of files) {
    const extension = path.posix.extname(file).toLowerCase();
    if (codeExtensions.includes(extension)) extractable = true;
    const language = otherLanguageExtensions.get(extension);
    if (language) otherLanguages.add(language);
  }
  return { extractable, otherLanguages: [...otherLanguages].sort() };
}
const markdownExtensions = [".md", ".mdx"];

let loadedTypeScript: TypeScriptModule | undefined;
let typeScriptFailure: string | undefined;

/** Symbols for a project file; an empty list for unsupported or missing files. */
export async function extractFileSymbols(
  workspace: LedgerWorkspace,
  filePath: string,
  options: ExtractSymbolsOptions = {},
): Promise<readonly string[]> {
  return (await extractFileSymbolsDetailed(workspace, filePath, options)).symbols;
}

/** Symbols for a project file together with the extractor that produced them. */
export async function extractFileSymbolsDetailed(
  workspace: LedgerWorkspace,
  filePath: string,
  options: ExtractSymbolsOptions = {},
): Promise<LedgerSymbolExtraction> {
  const extension = path.extname(filePath).toLowerCase();
  if (![...codeExtensions, ...markdownExtensions].includes(extension)) {
    return { symbols: [], extractor: "none" };
  }

  let raw: string;
  try {
    raw = await readUtf8FileLimited(
      resolveProjectPath(workspace.projectRoot, filePath, "symbol source"),
      workspace.config.limits.maxDocumentBytes,
      "symbol source",
    );
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return { symbols: [], extractor: "none" };
  }

  if (markdownExtensions.includes(extension)) {
    return { symbols: extractMarkdownSymbols(raw), extractor: "markdown" };
  }
  return await extractCodeSymbolsDetailed(raw, filePath, options);
}

function isCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === code;
}

export async function extractCodeSymbols(
  raw: string,
  filePath = "source.ts",
  options: ExtractSymbolsOptions = {},
): Promise<readonly string[]> {
  return (await extractCodeSymbolsDetailed(raw, filePath, options)).symbols;
}

/**
 * Code symbols with provenance. `auto` uses the TypeScript parser when the
 * optional `typescript` peer is installed and reports a regex fallback
 * otherwise; `typescript` throws when the parser is unavailable so callers
 * that need parser quality never get regex output silently.
 */
export async function extractCodeSymbolsDetailed(
  raw: string,
  filePath = "source.ts",
  options: ExtractSymbolsOptions = {},
): Promise<LedgerSymbolExtraction> {
  const parser = options.parser ?? "auto";
  if (parser === "regex") {
    return { symbols: extractCodeSymbolsWithRegex(raw), extractor: "regex" };
  }
  const ts = await (options.loadTypeScript ?? loadTypeScript)();
  if (ts) {
    return { symbols: extractTypeScriptSymbols(ts, raw, filePath), extractor: "typescript" };
  }
  const reason = options.loadTypeScript ? "typescript parser unavailable" : (typeScriptFailure ?? "typescript parser unavailable");
  if (parser === "typescript") {
    throw new LedgerError(
      "operational-error",
      `The TypeScript parser was requested but is unavailable: ${reason}. Install the optional typescript peer dependency or use --parser regex.`,
      { extractor: "typescript", reason },
    );
  }
  return { symbols: extractCodeSymbolsWithRegex(raw), extractor: "regex", fallbackReason: reason };
}

/** Availability of each extractor on this host, for doctor and drafts. */
export async function symbolExtractorStatus(): Promise<readonly LedgerSymbolExtractorStatus[]> {
  const ts = await loadTypeScript();
  return [
    ts
      ? { name: "typescript", available: true, version: ts.version }
      : { name: "typescript", available: false, reason: typeScriptFailure ?? "typescript parser unavailable" },
    { name: "regex", available: true },
    { name: "markdown", available: true },
  ];
}

export function extractMarkdownSymbols(raw: string): readonly string[] {
  const symbols = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const title = match[2]?.replace(/\s+#+\s*$/, "").trim();
    if (title) symbols.add(title);
  }
  return [...symbols].sort();
}

export function extractCodeSymbolsWithRegex(raw: string): readonly string[] {
  const symbols = new Set<string>();
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const symbol = match[1];
      if (symbol) symbols.add(symbol);
    }
  }
  return [...symbols].sort();
}

function extractTypeScriptSymbols(ts: TypeScriptModule, raw: string, filePath: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    raw,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(ts, filePath),
  );
  const symbols = new Set<string>();
  for (const statement of sourceFile.statements) {
    collectStatementSymbols(ts, statement, symbols);
  }
  return [...symbols].sort();
}

async function loadTypeScript(): Promise<TypeScriptModule | undefined> {
  if (loadedTypeScript) return loadedTypeScript;
  if (typeScriptFailure) return undefined;
  try {
    loadedTypeScript = await import("typescript");
    return loadedTypeScript;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    typeScriptFailure = /cannot find (?:package|module)/i.test(message)
      ? "the typescript package is not installed"
      : `the typescript package failed to load (${message.split("\n")[0]})`;
    return undefined;
  }
}

function collectStatementSymbols(
  ts: TypeScriptModule,
  statement: import("typescript").Statement,
  symbols: Set<string>,
): void {
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) {
    if (statement.name) symbols.add(statement.name.text);
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingName(ts, declaration.name, symbols);
    }
  }
}

function collectBindingName(
  ts: TypeScriptModule,
  name: import("typescript").BindingName,
  symbols: Set<string>,
): void {
  if (ts.isIdentifier(name)) {
    symbols.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingName(ts, element.name, symbols);
  }
}

function scriptKindForPath(ts: TypeScriptModule, filePath: string): import("typescript").ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}
