import { readdir } from "node:fs/promises";
import path from "node:path";
import { readLedgerCatalog, type LedgerCatalogReadOptions } from "./catalogCache.js";
import { LedgerError } from "./machine.js";
import { normalizePath } from "./pathPatterns.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export { normalizePath } from "./pathPatterns.js";

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
  "stale_refs",
  "expires",
  "host",
  "hostSession",
]);

/**
 * Read every Ledger source record. Unchanged files are served from the catalog
 * cache when the workspace enables one; pass `{ cache: false }` to parse from
 * disk. See `readLedgerCatalog` for cache statistics.
 */
export async function readLedgerDocuments(
  workspace: LedgerWorkspace,
  options: LedgerCatalogReadOptions = {},
): Promise<readonly ParsedLedgerDocument[]> {
  const { documents } = await readLedgerCatalog(workspace, options);
  return documents;
}

export interface FindMarkdownFilesOptions {
  readonly maxDepth?: number;
  readonly maxFiles?: number;
}

export async function findMarkdownFiles(
  directory: string,
  options: FindMarkdownFilesOptions = {},
  depth = 0,
): Promise<readonly string[]> {
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    throw new LedgerError(
      "resource-limit-exceeded",
      `Ledger source nesting exceeds ${options.maxDepth} directories: ${directory}`,
      { limit: options.maxDepth, kind: "directory-depth" },
    );
  }
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isCode(error, "ENOENT")) return [];
    throw error;
  }

  const results: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMarkdownFiles(absolutePath, options, depth + 1)));
      if (options.maxFiles !== undefined && results.length > options.maxFiles) {
        throw resourceLimitError("documents", options.maxFiles);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }

  return results.sort();
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

function resourceLimitError(kind: string, limit: number): LedgerError {
  return new LedgerError(
    "resource-limit-exceeded",
    `Ledger document limit exceeded (${limit})`,
    { kind, limit },
  );
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
    expires: optionalStringValue(frontmatter.expires),
    host: optionalStringValue(frontmatter.host),
    hostSession: optionalStringValue(frontmatter.hostSession),
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
    value === "feedback" ||
    value === "session"
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

function extensionValues(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(frontmatter)) {
    if (coreFrontmatterFields.has(field)) continue;
    extensions[field] = value;
  }
  return extensions;
}
