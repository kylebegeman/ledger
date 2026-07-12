import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { readUtf8FileLimited } from "./boundedFile.js";
import { findMarkdownFiles, normalizeKind, normalizePath, stringArrayValue } from "./documents.js";
import { extractSections, parseMarkdownWithFrontmatter } from "./frontmatter.js";
import {
  applyFileTransaction,
  hashFileContent,
  type LedgerFileChange,
} from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export interface MigrateChangelogOptions {
  readonly dryRun?: boolean;
  readonly rewriteDocs?: boolean;
  readonly status?: string;
}

export interface ChangelogMigrationResult {
  readonly sourceDir: string;
  readonly migrated: readonly ChangelogMigrationEntry[];
  readonly duplicates: readonly ChangelogDuplicate[];
  readonly rewrittenDocs: readonly string[];
  readonly receiptPath: string;
}

export interface ChangelogMigrationEntry {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly originalId: string;
  readonly id: string;
}

export interface ChangelogDuplicate {
  readonly sourcePath: string;
  readonly originalId: string;
  readonly suggestedId: string;
  readonly reason: string;
}

interface LegacyMarkdown {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
  readonly sections: ReadonlyMap<string, string>;
}

export async function migrateChangelog(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  sourceDir: string,
  options: MigrateChangelogOptions = {},
): Promise<ChangelogMigrationResult> {
  const absoluteSourceDir = await resolveSafeProjectPath(
    workspace.projectRoot,
    sourceDir,
    "migration source",
  );
  const sourceFiles = await findMarkdownFiles(absoluteSourceDir, {
    maxDepth: workspace.config.limits.maxDirectoryDepth,
    maxFiles: workspace.config.limits.maxDocuments,
  });
  const usedIds = new Set(
    documents.map((document) => String(document.frontmatter.id ?? "")).filter(Boolean),
  );
  const migrated: ChangelogMigrationEntry[] = [];
  const duplicates: ChangelogDuplicate[] = [];
  const fileChanges: LedgerFileChange[] = [];
  let sourceBytes = 0;

  for (const sourcePath of sourceFiles) {
    const relativeSourcePath = normalizePath(path.relative(workspace.projectRoot, sourcePath));
    const raw = await readUtf8FileLimited(
      sourcePath,
      workspace.config.limits.maxDocumentBytes,
      "migration source document",
    );
    sourceBytes += Buffer.byteLength(raw, "utf8");
    if (sourceBytes > workspace.config.limits.maxTotalDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Migration source exceeds ${workspace.config.limits.maxTotalDocumentBytes} bytes`,
        { kind: "migration-total-bytes", limit: workspace.config.limits.maxTotalDocumentBytes },
      );
    }
    const legacy = parseLegacyMarkdown(raw, relativeSourcePath);
    const originalId = legacyId(legacy.frontmatter, sourcePath);
    const id = uniqueId(originalId, usedIds);
    if (id !== originalId) {
      duplicates.push({
        sourcePath: relativeSourcePath,
        originalId,
        suggestedId: id,
        reason: usedIds.has(originalId)
          ? "ID already exists in Ledger or an earlier migrated record."
          : "ID needed a unique migration suffix.",
      });
    }
    usedIds.add(id);

    const title = legacyTitle(legacy.frontmatter, legacy.body, sourcePath);
    const targetPath = normalizePath(
      path.join(workspace.config.source.entries, `${safeFileName(id)}-${slugify(title)}.md`),
    );
    const rendered = renderMigratedEntry({
      legacy,
      id,
      originalId,
      title,
      sourcePath: relativeSourcePath,
      status: options.status ?? stringValue(legacy.frontmatter.status) ?? "historical",
    });

    migrated.push({
      sourcePath: relativeSourcePath,
      targetPath,
      originalId,
      id,
    });

    if (!options.dryRun) {
      fileChanges.push({ path: targetPath, content: rendered, expectedHash: null });
    }
  }

  const docsRewrite =
    options.rewriteDocs && !options.dryRun
      ? await planDocsReferenceRewrites(workspace, migrated)
      : { paths: [], changes: [] };
  fileChanges.push(...docsRewrite.changes);
  const sourceDirLabel = normalizePath(path.relative(workspace.projectRoot, absoluteSourceDir)) || ".";
  const receiptPath = migrationReceiptPath(workspace);
  const result: ChangelogMigrationResult = {
    sourceDir: sourceDirLabel,
    migrated,
    duplicates,
    rewrittenDocs: docsRewrite.paths,
    receiptPath,
  };
  fileChanges.push({
    path: receiptPath,
    content: formatMigrationReceipt(result, options),
    expectedHash: null,
  });
  await applyFileTransaction(workspace, "migrate changelog", fileChanges);

  return result;
}

function parseLegacyMarkdown(raw: string, filePath: string): LegacyMarkdown {
  if (/^---[ \t]*\r?\n/.test(raw)) {
    const parsed = parseMarkdownWithFrontmatter(raw, filePath);
    return {
      frontmatter: parsed.frontmatter,
      body: parsed.body.trim(),
      sections: new Map(parsed.sections.map((section) => [section.title, section.body])),
    };
  }
  const body = raw.trim();
  return {
    frontmatter: {},
    body,
    sections: new Map(extractSections(body).map((section) => [section.title, section.body])),
  };
}

function renderMigratedEntry(options: {
  readonly legacy: LegacyMarkdown;
  readonly id: string;
  readonly originalId: string;
  readonly title: string;
  readonly sourcePath: string;
  readonly status: string;
}): string {
  const { legacy, id, originalId, title, sourcePath, status } = options;
  const date = stringValue(legacy.frontmatter.date) ?? new Date().toISOString().slice(0, 10);
  const updated = stringValue(legacy.frontmatter.updated) ?? date;
  const kind = normalizeKind(legacy.frontmatter.kind) ?? ("change" satisfies LedgerDocumentKind);
  const areas = stringArrayValue(legacy.frontmatter.areas);
  const frontmatter = {
    id,
    kind,
    title,
    date,
    updated,
    status,
    areas: areas.length > 0 ? areas : ["migration"],
    files: stringArrayValue(legacy.frontmatter.files),
    symbols: stringArrayValue(legacy.frontmatter.symbols),
    docs: stringArrayValue(legacy.frontmatter.docs),
    commits: stringArrayValue(legacy.frontmatter.commits),
    prs: stringArrayValue(legacy.frontmatter.prs),
    release: stringValue(legacy.frontmatter.release),
    tags: stringArrayValue(legacy.frontmatter.tags),
  };
  const yaml = stringifyYaml(omitEmpty(frontmatter)).trimEnd();

  return [
    "---",
    yaml,
    "---",
    "",
    `# ${id}: ${title}`,
    "",
    "## Summary",
    "",
    legacy.sections.get("Summary") ?? bodyWithoutTitle(legacy.body),
    "",
    "## Why",
    "",
    legacy.sections.get("Why") ?? "Migrated from the legacy changelog system.",
    "",
    "## Changed Files",
    "",
    legacy.sections.get("Changed Files") ?? changedFilesFromFrontmatter(frontmatter.files),
    "",
    "## Behavior And UX Impact",
    "",
    legacy.sections.get("Behavior And UX Impact") ?? "Preserved from historical record.",
    "",
    "## Invariants",
    "",
    legacy.sections.get("Invariants") ?? "- Historical context remains available in Ledger.",
    "",
    "## Verification",
    "",
    legacy.sections.get("Verification") ??
      "- Migrated legacy record; original verification was not re-run.",
    "",
    "## Migration Notes",
    "",
    `- Source: \`${sourcePath}\``,
    originalId === id ? "- ID preserved." : `- Original ID: \`${originalId}\`; migrated ID: \`${id}\`.`,
    "",
  ].join("\n");
}

function changedFilesFromFrontmatter(files: readonly string[]): string {
  if (files.length === 0) return "No file list was present in the legacy record.";
  return files.map((filePath) => `### ${filePath}\n\n- What changed: Migrated from legacy record.`).join("\n\n");
}

async function planDocsReferenceRewrites(
  workspace: LedgerWorkspace,
  entries: readonly ChangelogMigrationEntry[],
): Promise<{ readonly paths: readonly string[]; readonly changes: readonly LedgerFileChange[] }> {
  const docsRoot = path.join(workspace.projectRoot, workspace.config.docs.root);
  const docsFiles = await findMarkdownFiles(docsRoot, {
    maxDepth: workspace.config.limits.maxDirectoryDepth,
    maxFiles: workspace.config.limits.maxDocuments,
  });
  const rewritten: string[] = [];
  const changes: LedgerFileChange[] = [];

  for (const docsFile of docsFiles) {
    const raw = await readUtf8FileLimited(
      docsFile,
      workspace.config.limits.maxDocumentBytes,
      "docs rewrite source",
    );
    const next = replaceAllMappings(raw, entries);
    if (next === raw) continue;
    const relativePath = normalizePath(path.relative(workspace.projectRoot, docsFile));
    rewritten.push(relativePath);
    changes.push({ path: relativePath, content: next, expectedHash: hashFileContent(raw) });
  }

  return { paths: rewritten.sort(), changes };
}

function replaceAllMappings(
  raw: string,
  entries: readonly ChangelogMigrationEntry[],
): string {
  let next = raw;
  for (const entry of entries) {
    next = next.split(entry.sourcePath).join(entry.targetPath);
  }
  return next;
}

function migrationReceiptPath(workspace: LedgerWorkspace): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return normalizePath(
    path.join(workspace.config.reports.output, `changelog-migration-${stamp}.md`),
  );
}

export function formatMigrationReceipt(
  result: ChangelogMigrationResult,
  options: MigrateChangelogOptions = {},
): string {
  const lines = [
    "# Ledger Changelog Migration Receipt",
    "",
    `Source: \`${result.sourceDir}\``,
    `Mode: ${options.dryRun ? "dry run" : "write"}`,
    `Entries: ${result.migrated.length}`,
    `Duplicate IDs: ${result.duplicates.length}`,
    `Docs rewritten: ${result.rewrittenDocs.length}`,
    "",
    "## Entries",
    "",
    ...result.migrated.map(
      (entry) =>
        `- \`${entry.sourcePath}\` -> \`${entry.targetPath}\` (${entry.originalId} -> ${entry.id})`,
    ),
    "",
    "## Duplicate IDs",
    "",
    ...(result.duplicates.length === 0
      ? ["None."]
      : result.duplicates.map(
          (duplicate) =>
            `- \`${duplicate.sourcePath}\`: \`${duplicate.originalId}\` -> \`${duplicate.suggestedId}\`. ${duplicate.reason}`,
        )),
    "",
    "## Rewritten Docs",
    "",
    ...(result.rewrittenDocs.length === 0
      ? ["None."]
      : result.rewrittenDocs.map((filePath) => `- \`${filePath}\``)),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function uniqueId(id: string, usedIds: ReadonlySet<string>): string {
  if (!usedIds.has(id)) return id;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${id}-${suffix}`;
    if (!usedIds.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a unique ID for ${id}`);
}

function legacyId(frontmatter: Record<string, unknown>, sourcePath: string): string {
  return (
    stringValue(frontmatter.id) ??
    path.basename(sourcePath, path.extname(sourcePath)).match(/[A-Za-z]*\d+[A-Za-z0-9-]*/)?.[0] ??
    path.basename(sourcePath, path.extname(sourcePath))
  );
}

function legacyTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  sourcePath: string,
): string {
  const frontmatterTitle = stringValue(frontmatter.title);
  if (frontmatterTitle) return frontmatterTitle;
  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1]?.trim();
  if (heading) return heading.replace(/^[A-Za-z]*\d+:\s*/, "");
  return titleFromSlug(path.basename(sourcePath, path.extname(sourcePath)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function omitEmpty(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function safeFileName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "entry";
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 80).replace(/-+$/, "") || "migrated-record";
}

function titleFromSlug(input: string): string {
  const withoutId = input.replace(/^[A-Za-z]*\d+[-_: ]*/, "");
  const title = withoutId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  return title || input;
}

function bodyWithoutTitle(body: string): string {
  const withoutTitle = body.replace(/^#\s+.+?\s*(?:\r?\n)+/, "").trim();
  return withoutTitle || "Migrated legacy changelog record.";
}
