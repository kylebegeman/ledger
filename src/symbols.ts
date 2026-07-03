import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LedgerWorkspace } from "./types.js";

type TypeScriptModule = typeof import("typescript");

export interface ExtractSymbolsOptions {
  readonly parser?: "auto" | "typescript" | "regex";
}

let loadedTypeScript: TypeScriptModule | undefined;
let typeScriptUnavailable = false;

export async function extractFileSymbols(
  workspace: LedgerWorkspace,
  filePath: string,
  options: ExtractSymbolsOptions = {},
): Promise<readonly string[]> {
  const extension = path.extname(filePath).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx", ".md", ".mdx"].includes(extension)) return [];

  let raw: string;
  try {
    raw = await readFile(path.join(workspace.projectRoot, filePath), "utf8");
  } catch {
    return [];
  }

  if (extension === ".md" || extension === ".mdx") return extractMarkdownSymbols(raw);
  return await extractCodeSymbols(raw, filePath, options);
}

export async function extractCodeSymbols(
  raw: string,
  filePath = "source.ts",
  options: ExtractSymbolsOptions = {},
): Promise<readonly string[]> {
  if (options.parser !== "regex") {
    const parsed = await extractTypeScriptSymbols(raw, filePath);
    if (parsed) return parsed;
  }
  return extractCodeSymbolsWithRegex(raw);
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

async function extractTypeScriptSymbols(
  raw: string,
  filePath: string,
): Promise<readonly string[] | undefined> {
  const ts = await loadTypeScript();
  if (!ts) return undefined;

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
  if (typeScriptUnavailable) return undefined;
  try {
    loadedTypeScript = await import("typescript");
    return loadedTypeScript;
  } catch {
    typeScriptUnavailable = true;
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
