import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseMarkdownWithFrontmatter } from "./frontmatter.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

const coreFrontmatterFields = new Set([
  "id",
  "kind",
  "title",
  "date",
  "updated",
  "status",
  "areas",
  "files",
  "symbols",
  "commits",
  "prs",
  "release",
  "tags",
  "decisions",
  "backlog",
  "supersedes",
  "related",
  "docs",
  "docsImpact",
  "entries",
  "staleRefs",
]);

export async function readLedgerDocuments(
  workspace: LedgerWorkspace,
): Promise<readonly ParsedLedgerDocument[]> {
  const sourceDirectories: Array<[LedgerDocumentKind, string]> = [
    ["change", workspace.config.source.entries],
    ["backlog", workspace.config.source.backlog],
    ["decision", workspace.config.source.decisions],
    ["release", workspace.config.source.releases],
  ];

  const documents: ParsedLedgerDocument[] = [];

  for (const [fallbackKind, relativeDirectory] of sourceDirectories) {
    const absoluteDirectory = path.join(workspace.projectRoot, relativeDirectory);
    const files = await findMarkdownFiles(absoluteDirectory);
    for (const absolutePath of files) {
      const raw = await readFile(absolutePath, "utf8");
      const relativePath = normalizePath(path.relative(workspace.projectRoot, absolutePath));
      const parsed = parseMarkdownWithFrontmatter(raw, relativePath);
      documents.push({
        absolutePath,
        relativePath,
        raw,
        frontmatterRaw: parsed.frontmatterRaw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        sections: parsed.sections,
        kind: normalizeKind(parsed.frontmatter.kind) ?? fallbackKind,
      });
    }
  }

  return documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function findMarkdownFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMarkdownFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }

  return results.sort();
}

export function normalizeDocument(document: ParsedLedgerDocument): NormalizedLedgerDocument {
  const frontmatter = document.frontmatter;
  return {
    id: stringValue(frontmatter.id),
    kind: document.kind,
    title: stringValue(frontmatter.title),
    status: stringValue(frontmatter.status),
    date: stringValue(frontmatter.date),
    updated: optionalStringValue(frontmatter.updated),
    areas: stringArrayValue(frontmatter.areas),
    files: stringArrayValue(frontmatter.files).map(normalizePath),
    symbols: stringArrayValue(frontmatter.symbols),
    commits: stringArrayValue(frontmatter.commits),
    prs: stringArrayValue(frontmatter.prs),
    release: optionalStringValue(frontmatter.release),
    tags: stringArrayValue(frontmatter.tags),
    decisions: stringArrayValue(frontmatter.decisions),
    backlog: stringArrayValue(frontmatter.backlog),
    supersedes: stringArrayValue(frontmatter.supersedes),
    related: stringArrayValue(frontmatter.related),
    docs: stringArrayValue(frontmatter.docs).map(normalizePath),
    extensions: extensionValues(frontmatter),
    path: document.relativePath,
    sections: document.sections.map((section) => section.title),
  };
}

export function normalizeKind(value: unknown): LedgerDocumentKind | undefined {
  if (
    value === "change" ||
    value === "backlog" ||
    value === "decision" ||
    value === "release" ||
    value === "product-note" ||
    value === "feedback"
  ) {
    return value;
  }
  return undefined;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\//, "");
}

function extensionValues(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(frontmatter)) {
    if (coreFrontmatterFields.has(field)) continue;
    extensions[field] = value;
  }
  return extensions;
}
