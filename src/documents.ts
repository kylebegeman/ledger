import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseMarkdownWithFrontmatter } from "./frontmatter.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
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
  "stale_refs",
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
  let totalBytes = 0;

  for (const [fallbackKind, relativeDirectory] of sourceDirectories) {
    const absoluteDirectory = await resolveSafeProjectPath(
      workspace.projectRoot,
      relativeDirectory,
      `source.${fallbackKind}`,
    );
    const files = await findMarkdownFiles(absoluteDirectory, {
      maxDepth: workspace.config.limits.maxDirectoryDepth,
      maxFiles: workspace.config.limits.maxDocuments - documents.length,
    });
    for (const absolutePath of files) {
      if (documents.length >= workspace.config.limits.maxDocuments) {
        throw new Error(`Ledger document limit exceeded (${workspace.config.limits.maxDocuments})`);
      }
      const fileStats = await stat(absolutePath);
      if (fileStats.size > workspace.config.limits.maxDocumentBytes) {
        throw new Error(
          `${normalizePath(path.relative(workspace.projectRoot, absolutePath))}: document exceeds ${workspace.config.limits.maxDocumentBytes} bytes`,
        );
      }
      const raw = await readFile(absolutePath, "utf8");
      const bytes = Buffer.byteLength(raw, "utf8");
      totalBytes += bytes;
      if (totalBytes > workspace.config.limits.maxTotalDocumentBytes) {
        throw new Error(
          `Ledger document bytes exceed ${workspace.config.limits.maxTotalDocumentBytes}`,
        );
      }
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
    throw new Error(`Ledger source nesting exceeds ${options.maxDepth} directories: ${directory}`);
  }
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
      results.push(...(await findMarkdownFiles(absolutePath, options, depth + 1)));
      if (options.maxFiles !== undefined && results.length > options.maxFiles) {
        throw new Error(`Ledger document limit exceeded (${options.maxFiles})`);
      }
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
