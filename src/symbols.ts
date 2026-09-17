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
  /** Where each symbol occurs, in file order, so a draft can keep only the symbols a diff touched. */
  readonly spans: readonly LedgerSymbolSpan[];
  readonly extractor: LedgerSymbolExtractor;
  /** Present when a preferred extractor was unavailable and another ran instead. */
  readonly fallbackReason?: string;
}

/**
 * One occurrence of a symbol and the 1-based lines it spans: a Markdown
 * heading's section up to the next heading of the same or a higher level, or
 * a top-level declaration with its doc comment. `depth` is the heading level,
 * and 0 for code, whose spans never nest.
 */
export interface LedgerSymbolSpan {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
}

/** An inclusive range of 1-based line numbers. */
export interface LedgerLineRange {
  readonly start: number;
  readonly end: number;
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
    return { symbols: [], spans: [], extractor: "none" };
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
    return { symbols: [], spans: [], extractor: "none" };
  }

  if (markdownExtensions.includes(extension)) {
    const spans = extractMarkdownSymbolSpans(raw);
    return { symbols: spanNames(spans), spans, extractor: "markdown" };
  }
  return await extractCodeSymbolsDetailed(raw, filePath, options);
}

/**
 * The names whose spans hold a changed line, sorted. A line inside a nested
 * section belongs only to its innermost heading, so an edit under
 * `### Fixed` names `Fixed` and not every heading above it; a heading owns
 * its own lines up to its first subsection.
 */
export function symbolsTouchedByLines(
  spans: readonly LedgerSymbolSpan[],
  ranges: readonly LedgerLineRange[],
): readonly string[] {
  const touched = new Set<string>();
  spans.forEach((span, index) => {
    const next = spans[index + 1];
    const ownedEnd = next && next.depth > span.depth && next.start <= span.end ? next.start - 1 : span.end;
    if (ranges.some((range) => range.start <= ownedEnd && range.end >= span.start)) touched.add(span.name);
  });
  return [...touched].sort();
}

function spanNames(spans: readonly LedgerSymbolSpan[]): readonly string[] {
  return [...new Set(spans.map((span) => span.name))].sort();
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
    const spans = extractCodeSymbolSpansWithRegex(raw);
    return { symbols: spanNames(spans), spans, extractor: "regex" };
  }
  const ts = await (options.loadTypeScript ?? loadTypeScript)();
  if (ts) {
    const spans = extractTypeScriptSymbolSpans(ts, raw, filePath);
    return { symbols: spanNames(spans), spans, extractor: "typescript" };
  }
  const reason = options.loadTypeScript ? "typescript parser unavailable" : (typeScriptFailure ?? "typescript parser unavailable");
  if (parser === "typescript") {
    throw new LedgerError(
      "operational-error",
      `The TypeScript parser was requested but is unavailable: ${reason}. Install the optional typescript peer dependency or use --parser regex.`,
      { extractor: "typescript", reason },
    );
  }
  const spans = extractCodeSymbolSpansWithRegex(raw);
  return { symbols: spanNames(spans), spans, extractor: "regex", fallbackReason: reason };
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
  return spanNames(extractMarkdownSymbolSpans(raw));
}

/**
 * ATX headings outside fenced code blocks, in file order. Each heading's span
 * runs to the line before the next heading of the same or a higher level, or
 * to the end of the file.
 */
export function extractMarkdownSymbolSpans(raw: string): readonly LedgerSymbolSpan[] {
  const lines = raw.split(/\r?\n/);
  const lastLine = raw.endsWith("\n") ? lines.length - 1 : lines.length;
  const spans: { name: string; start: number; end: number; depth: number }[] = [];
  const open: (typeof spans)[number][] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length && fenceMatch[2]!.trim() === "") {
        fence = undefined;
      }
      return;
    }
    if (fence !== undefined) return;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    const name = match?.[2]?.replace(/\s+#+\s*$/, "").trim();
    if (!match || !name) return;
    const depth = match[1]!.length;
    const lineNumber = index + 1;
    while (open.length > 0 && open[open.length - 1]!.depth >= depth) open.pop()!.end = lineNumber - 1;
    const span = { name, start: lineNumber, end: lastLine, depth };
    spans.push(span);
    open.push(span);
  });
  return spans;
}

const codeSymbolPatterns: readonly RegExp[] = [
  /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s+(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
];

export function extractCodeSymbolsWithRegex(raw: string): readonly string[] {
  return spanNames(extractCodeSymbolSpansWithRegex(raw));
}

/**
 * Declarations the regex fallback finds, in file order. Without a parser the
 * end of a declaration is unknown, so each one runs to the line before the
 * next declaration.
 */
export function extractCodeSymbolSpansWithRegex(raw: string): readonly LedgerSymbolSpan[] {
  const lineStarts = [0];
  for (let index = raw.indexOf("\n"); index !== -1; index = raw.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  const found = new Map<string, { readonly name: string; readonly line: number }>();
  for (const pattern of codeSymbolPatterns) {
    for (const match of raw.matchAll(pattern)) {
      const name = match[1];
      if (!name) continue;
      const line = lineOfOffset(lineStarts, match.index ?? 0);
      found.set(`${line}:${name}`, { name, line });
    }
  }
  const ordered = [...found.values()].sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));
  const spans: LedgerSymbolSpan[] = [];
  const lastLine = raw.endsWith("\n") ? lineStarts.length - 1 : lineStarts.length;
  let nextLine = lastLine + 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const { name, line } = ordered[index]!;
    const later = ordered[index + 1];
    if (later && later.line > line) nextLine = later.line;
    spans.push({ name, start: line, end: nextLine - 1, depth: 0 });
  }
  return spans.reverse();
}

/** The 1-based line holding a character offset. */
function lineOfOffset(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function extractTypeScriptSymbolSpans(ts: TypeScriptModule, raw: string, filePath: string): readonly LedgerSymbolSpan[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    raw,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(ts, filePath),
  );
  const spans: LedgerSymbolSpan[] = [];
  for (const statement of sourceFile.statements) {
    const names = new Set<string>();
    collectStatementSymbols(ts, statement, names);
    if (names.size === 0) continue;
    // The span starts at the declaration's doc comment, so an edit to the comment touches the symbol.
    const start = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile, true)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(statement.getEnd()).line + 1;
    for (const name of names) spans.push({ name, start, end, depth: 0 });
  }
  return spans;
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
