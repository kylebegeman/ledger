import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./documents.js";
import { getChangedFileDetails, type GitChangedFile } from "./git.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export interface CreateEntryOptions {
  readonly title: string;
  readonly fromDiff: boolean;
  readonly staged: boolean;
  readonly areas: readonly string[];
  readonly status: string;
}

export async function createChangeEntry(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateEntryOptions,
): Promise<string> {
  const id = nextEntryId(workspace, documents);
  const slug = slugify(options.title);
  const relativePath = path.join(workspace.config.source.entries, `${id}-${slug}.md`);
  const absolutePath = path.join(workspace.projectRoot, relativePath);
  const changedFiles = options.fromDiff
    ? await getChangedFileDetails(workspace.projectRoot, { staged: options.staged })
    : [];
  const files = changedFiles.map((file) => file.path);
  const symbols = options.fromDiff
    ? await collectChangedSymbols(workspace, changedFiles)
    : { all: [], byFile: new Map<string, readonly string[]>() };
  const docs = files.filter((file) => isDocsPath(file, workspace.config.docs.root));
  const date = new Date().toISOString().slice(0, 10);
  const template = await readTemplate(workspace);
  const rendered = renderTemplate(template, {
    id,
    title: options.title,
    date,
    status: options.status,
    areas: yamlStringArray(options.areas),
    files: yamlStringArray(files),
    symbols: yamlStringArray(symbols.all),
    docs: yamlStringArray(docs),
    changedFiles: renderChangedFiles(changedFiles, symbols.byFile),
  });

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, rendered, { encoding: "utf8", flag: "wx" });
  return relativePath.replace(/\\/g, "/");
}

export function nextEntryId(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): string {
  const width = workspace.config.ids.entryWidth;
  const prefix = workspace.config.ids.entryPrefix;
  const max = documents
    .filter((document) => document.kind === "change")
    .map((document) => String(document.frontmatter.id ?? ""))
    .map((id) => id.replace(prefix, ""))
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id))
    .reduce((current, candidate) => Math.max(current, candidate), 0);

  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "change";
}

async function readTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = path.join(workspace.ledgerRoot, "templates", "change.md");
  try {
    return await readFile(templatePath, "utf8");
  } catch {
    return defaultTemplate();
  }
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`"{{${key}}}"`, `"${escapeYamlString(value)}"`);
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  rendered = rendered.replace(
    'status: "draft"',
    `status: "${escapeYamlString(values.status ?? "draft")}"`,
  );
  if (rendered.includes("files: []") && values.files) {
    rendered = rendered.replace("files: []", `files:${values.files}`);
  }
  if (rendered.includes("symbols: []") && values.symbols) {
    rendered = rendered.replace("symbols: []", `symbols:${values.symbols}`);
  }
  if (rendered.includes("docs: []") && values.docs) {
    rendered = rendered.replace("docs: []", `docs:${values.docs}`);
  }
  if (rendered.includes("areas: []") && values.areas) {
    rendered = rendered.replace("areas: []", `areas:${values.areas}`);
  }
  if (rendered.includes("### path/to/file.ts") && values.changedFiles) {
    rendered = rendered.replace("### path/to/file.ts", values.changedFiles);
  }
  if (rendered.includes("Add changed files.") && values.changedFiles) {
    rendered = rendered.replace("Add changed files.", values.changedFiles);
  }
  return rendered;
}

function yamlStringArray(values: readonly string[]): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `  - "${escapeYamlString(value)}"`).join("\n")}`;
}

interface ChangedSymbols {
  readonly all: readonly string[];
  readonly byFile: ReadonlyMap<string, readonly string[]>;
}

async function collectChangedSymbols(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
): Promise<ChangedSymbols> {
  const all = new Set<string>();
  const byFile = new Map<string, readonly string[]>();

  for (const file of files) {
    if (file.status === "deleted") continue;
    const symbols = await extractFileSymbols(workspace, file.path);
    if (symbols.length === 0) continue;
    byFile.set(file.path, symbols);
    for (const symbol of symbols) all.add(symbol);
  }

  return {
    all: [...all].sort(),
    byFile,
  };
}

async function extractFileSymbols(
  workspace: LedgerWorkspace,
  filePath: string,
): Promise<readonly string[]> {
  const extension = path.extname(filePath).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx", ".md", ".mdx"].includes(extension)) return [];

  let raw: string;
  try {
    raw = await readFile(path.join(workspace.projectRoot, filePath), "utf8");
  } catch {
    return [];
  }

  return extension === ".md" || extension === ".mdx"
    ? extractMarkdownSymbols(raw)
    : extractCodeSymbols(raw);
}

function extractCodeSymbols(raw: string): readonly string[] {
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

function extractMarkdownSymbols(raw: string): readonly string[] {
  const symbols = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const title = match[2]?.replace(/\s+#+\s*$/, "").trim();
    if (title) symbols.add(title);
  }
  return [...symbols].sort();
}

function renderChangedFiles(
  files: readonly GitChangedFile[],
  symbolsByFile: ReadonlyMap<string, readonly string[]> = new Map(),
): string {
  if (files.length === 0) return "### path/to/file.ts";
  return files
    .map((file) => {
      const anchors = symbolsByFile.get(file.path) ?? [];
      return [
        `### ${file.path}`,
        "",
        `- Status: ${file.status}`,
        "- What changed: TODO: summarize the change.",
        `- Anchor: ${anchors.length > 0 ? anchors.join(", ") : "TODO: name the important symbol, route, command, or section."}`,
        "- On conflict: TODO: describe what must be preserved.",
      ].join("\n");
    })
    .join("\n\n");
}

function isDocsPath(filePath: string, docsRoot: string): boolean {
  const normalized = normalizePath(filePath);
  const root = normalizePath(docsRoot).replace(/\/$/, "");
  return normalized === root || normalized.startsWith(`${root}/`);
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function defaultTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "change"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "draft"',
    "areas: []",
    "files: []",
    "symbols: []",
    "docs: []",
    "commits: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Summary",
    "",
    "## Why",
    "",
    "## Changed Files",
    "",
    "### path/to/file.ts",
    "",
    "- What changed:",
    "- Anchor:",
    "- On conflict:",
    "",
    "## Behavior And UX Impact",
    "",
    "## Invariants",
    "",
    "## Verification",
    "",
    "## Notes",
    "",
  ].join("\n");
}
