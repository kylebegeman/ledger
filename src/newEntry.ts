import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { coveragePatternMatches, isIgnoredByGitConfig, matchesGlob } from "./coverage.js";
import { normalizePath } from "./documents.js";
import { getChangedFileDetails, type GitChangedFile } from "./git.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { ensureFrontmatterArrays, replaceSectionBody } from "./frontmatterEdit.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { extractFileSymbolsDetailed, type LedgerSymbolExtractor } from "./symbols.js";
import { renderLedgerTemplate } from "./template.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";
import { changeTemplate } from "./workspace.js";

const largeDiffFileThreshold = 40;
const largeDiffGroupThreshold = 5;

export interface CreateEntryOptions {
  readonly title: string;
  readonly fromDiff: boolean;
  readonly staged: boolean;
  readonly areas: readonly string[];
  readonly status: string;
  /** Explicit file references added to the Git-derived list. */
  readonly files?: readonly string[];
  /** Backlog ids the entry promotes. */
  readonly backlog?: readonly string[];
  /** Decision ids the entry realizes. */
  readonly decisions?: readonly string[];
  /** Other related record ids. */
  readonly related?: readonly string[];
  /** Section bodies that replace the template placeholders, keyed by heading. */
  readonly sectionBodies?: Readonly<Record<string, string>>;
  /** Coverage patterns whose matching files stay out of the Git-derived list, such as files another receipt lists. */
  readonly excludeFiles?: readonly string[];
}

export interface DraftedRecord {
  readonly id: string;
  readonly path: string;
  readonly content: string;
  /** Files handled by each symbol extractor while drafting, with any fallback reason. */
  readonly symbolExtractors?: LedgerSymbolExtractorReport;
}

export interface LedgerSymbolExtractorReport {
  readonly counts: Readonly<Partial<Record<LedgerSymbolExtractor, number>>>;
  readonly fallbackReason?: string;
}

export async function createChangeEntry(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateEntryOptions,
): Promise<string> {
  return (await createChangeEntryDetailed(workspace, documents, options)).path;
}

/** Create a change entry and report which symbol extractors ran. */
export async function createChangeEntryDetailed(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateEntryOptions,
): Promise<DraftedRecord> {
  const draft = await draftChangeEntry(workspace, documents, options);
  await applyFileTransaction(workspace, "create change entry", [
    { path: draft.path, content: draft.content, expectedHash: null },
  ]);
  return draft;
}

/** Render the next change entry without writing it. */
export async function draftChangeEntry(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateEntryOptions,
): Promise<DraftedRecord> {
  const id = nextEntryId(workspace, documents);
  const slug = slugify(options.title);
  const relativePath = path.join(workspace.config.source.entries, `${id}-${slug}.md`);
  const changedFiles = options.fromDiff
    ? (await getChangedFileDetails(workspace.projectRoot, { staged: options.staged })).filter(
        (file) =>
          !isIgnoredByGitConfig(workspace, file.path) &&
          !isLedgerScaffoldPath(workspace, file.path) &&
          !(options.excludeFiles ?? []).some((pattern) => coveragePatternMatches(file.path, pattern)),
      )
    : [];
  const files = options.files && options.files.length > 0
    ? uniqueSorted([
        ...coverageReferencesForChangedFiles(changedFiles),
        ...options.files.map(normalizePath),
      ])
    : coverageReferencesForChangedFiles(changedFiles);
  const symbols = options.fromDiff && changedFiles.length <= largeDiffFileThreshold
    ? await collectChangedSymbols(workspace, changedFiles)
    : { all: [], byFile: new Map<string, readonly string[]>(), extractors: { counts: {} } };
  const docs = files.filter((file) => isDocsPath(file, workspace.config.docs.root));
  const areas = options.areas.length > 0 ? options.areas : inferAreas(workspace, changedFiles);
  const date = new Date().toISOString().slice(0, 10);
  const template = await readTemplate(workspace);
  const backlog = options.backlog ?? [];
  const decisions = options.decisions ?? [];
  const related = options.related ?? [];
  let rendered = renderLedgerTemplate(template, {
    scalars: {
      id,
      title: options.title,
      date,
      status: options.status,
    },
    arrays: {
      areas,
      files,
      symbols: symbols.all,
      docs,
      backlog,
      decisions,
      related,
    },
    blocks: {
      changedFiles: renderChangedFiles(workspace, changedFiles, symbols.byFile),
    },
  });
  rendered = ensureFrontmatterArrays(rendered, { backlog, decisions, related });
  for (const [title, body] of Object.entries(options.sectionBodies ?? {})) {
    rendered = replaceSectionBody(rendered, title, body);
  }

  return { id, path: normalizePath(relativePath), content: rendered, symbolExtractors: symbols.extractors };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

/**
 * Session records and templates are Ledger's own scaffold: a draft must not
 * list them as changed files, take their headings as symbols, or infer areas
 * from them. Other `.ledger/` paths (config, entries, backlog) stay eligible.
 */
export function isLedgerScaffoldPath(workspace: LedgerWorkspace, filePath: string): boolean {
  const sessions = normalizePath(workspace.config.source.sessions).replace(/\/$/, "");
  return matchesGlob(filePath, `${sessions}/**`) || matchesGlob(filePath, ".ledger/templates/**");
}

/**
 * The neutral title a hook draft carries until the agent describes the change:
 * `Changes to <areas>` or, without areas, `Changes to <first file>`. `ready`
 * flags a draft whose title still equals this value.
 */
export function defaultDraftTitle(areas: readonly string[], files: readonly string[]): string {
  if (areas.length > 0) return `Changes to ${areas.join(", ")}`;
  return `Changes to ${files[0] ?? "the working tree"}`;
}

/**
 * Whether a title is still a drafted default. A hook draft takes its title
 * from the session's areas or first touched path, while the entry's own areas
 * may be inferred from the diff later, so any default shape counts: the
 * entry's areas, one of its files, or the working tree.
 */
export function isDefaultDraftTitle(title: string, areas: readonly string[], files: readonly string[]): boolean {
  const match = /^Changes to (.+)$/.exec(title.trim());
  if (!match) return false;
  const subject = match[1]!;
  return (areas.length > 0 && subject === areas.join(", ")) || files.includes(subject) || subject === "the working tree";
}

export async function createProductNoteEntry(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: {
    readonly title: string;
    readonly areas: readonly string[];
    readonly tags: readonly string[];
    readonly status: string;
  },
): Promise<string> {
  const id = nextEntryId(workspace, documents);
  const slug = slugify(options.title);
  const relativePath = path.join(workspace.config.source.entries, `${id}-${slug}.md`);
  const date = new Date().toISOString().slice(0, 10);
  const template = await readProductNoteTemplate(workspace);
  const rendered = renderLedgerTemplate(template, {
    scalars: {
      id,
      title: options.title,
      date,
      status: options.status,
    },
    arrays: {
      areas: options.areas,
      tags: options.tags,
    },
  });

  await applyFileTransaction(workspace, "create product note", [
    { path: normalizePath(relativePath), content: rendered, expectedHash: null },
  ]);
  return relativePath.replace(/\\/g, "/");
}

export function nextEntryId(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): string {
  const width = workspace.config.ids.entryWidth;
  const prefix = workspace.config.ids.entryPrefix;
  const max = documents
    .map((document) => String(document.frontmatter.id ?? ""))
    .map((id) => entrySequenceNumber(id, prefix))
    .filter((id): id is number => id !== undefined)
    .reduce((current, candidate) => Math.max(current, candidate), 0);

  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

function entrySequenceNumber(id: string, prefix: string): number | undefined {
  if (prefix && !id.startsWith(prefix)) return undefined;
  const value = prefix ? id.slice(prefix.length) : id;
  if (!/^\d+$/.test(value)) return undefined;
  return Number.parseInt(value, 10);
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 80).replace(/-+$/, "") || "change";
}

async function readTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/templates/change.md",
    "change template",
  );
  try {
    return await readUtf8FileLimited(
      templatePath,
      workspace.config.limits.maxDocumentBytes,
      "change template",
    );
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return changeTemplate();
  }
}

async function readProductNoteTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/templates/product-note.md",
    "product note template",
  );
  try {
    return await readUtf8FileLimited(
      templatePath,
      workspace.config.limits.maxDocumentBytes,
      "product note template",
    );
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return defaultProductNoteTemplate();
  }
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

export function inferAreas(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
): readonly string[] {
  const areas = new Set<string>();
  // Root-level file names (CONTRIBUTING.md) only become areas when no directory names one.
  const rootFileAreas = new Set<string>();
  const docsRoot = normalizePath(workspace.config.docs.root);
  for (const file of files) {
    const normalized = normalizePath(file.path);
    const first = normalized.split("/")[0] ?? "";
    if (isDocsPath(normalized, docsRoot)) {
      areas.add("docs");
    } else if (normalized.startsWith("test/") || normalized.includes("/test/") || normalized.includes("/tests/")) {
      areas.add("tests");
    } else if (normalized.startsWith("src/")) {
      const [, second] = normalized.split("/");
      areas.add(second ? areaFromSegment(second) : "src");
    } else if (normalized.includes("/")) {
      areas.add(areaFromSegment(first));
    } else if (first) {
      rootFileAreas.add(areaFromSegment(first));
    }
  }
  // A dot directory such as .ledger has no area name once its extension is stripped.
  const named = (values: ReadonlySet<string>) => [...values].filter((area) => area.length > 0);
  const directoryAreas = named(areas);
  return (directoryAreas.length > 0 ? directoryAreas : named(rootFileAreas)).sort();
}

interface ChangedSymbols {
  readonly all: readonly string[];
  readonly byFile: ReadonlyMap<string, readonly string[]>;
  readonly extractors: LedgerSymbolExtractorReport;
}

async function collectChangedSymbols(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
): Promise<ChangedSymbols> {
  const all = new Set<string>();
  const byFile = new Map<string, readonly string[]>();
  const counts: Partial<Record<LedgerSymbolExtractor, number>> = {};
  let fallbackReason: string | undefined;

  for (const file of files) {
    if (file.status === "deleted") continue;
    const extraction = await extractFileSymbolsDetailed(workspace, file.path);
    if (extraction.extractor !== "none") {
      counts[extraction.extractor] = (counts[extraction.extractor] ?? 0) + 1;
    }
    fallbackReason ??= extraction.fallbackReason;
    if (extraction.symbols.length === 0) continue;
    byFile.set(file.path, extraction.symbols);
    for (const symbol of extraction.symbols) all.add(symbol);
  }

  return {
    all: [...all].sort(),
    byFile,
    extractors: fallbackReason ? { counts, fallbackReason } : { counts },
  };
}

function renderChangedFiles(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
  symbolsByFile: ReadonlyMap<string, readonly string[]> = new Map(),
): string {
  // Without changed files, keep the TODO bullets so `ready` still nudges a draft made without a diff.
  if (files.length === 0) {
    return [
      "### path/to/file.ts",
      "",
      "- What changed: TODO: describe the change.",
      "- Anchor: TODO: name the important symbol.",
      "- On conflict: TODO: describe what must be preserved.",
    ].join("\n");
  }
  if (files.length > largeDiffFileThreshold) {
    return renderChangedFileGroups(workspace, files);
  }
  return files
    .map((file) => {
      const anchors = symbolsByFile.get(file.path) ?? [];
      return [
        `### ${file.path}`,
        "",
        `- Status: ${file.status}`,
        `- What changed: TODO: ${draftChangePrompt(workspace, file)}`,
        `- Anchor: ${anchors.length > 0 ? anchors.map((anchor) => `\`${anchor}\``).join(", ") : "TODO: name the important symbol, route, command, or section."}`,
        "- On conflict: TODO: describe what must be preserved.",
        `- Docs impact: ${draftDocsImpact(workspace, file)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function renderChangedFileGroups(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
): string {
  const groups = groupChangedFiles(files);
  return groups
    .map((group) => {
      const statusSummary = countStatuses(group.files);
      return [
        `### Pattern: ${group.coverage}`,
        "",
        `- Files: ${group.files.length}`,
        `- Status: ${statusSummary}`,
        `- What changed: TODO: summarize this ${group.files.length}-file migration group.`,
        "- Anchor: TODO: name the generated area, package, route group, or docs section.",
        "- On conflict: TODO: describe what must be preserved or regenerated.",
        `- Docs impact: ${group.files.some((file) => isDocsPath(file.path, workspace.config.docs.root)) ? "This group contains direct docs impact." : "TODO: name updated docs or explain why docs were not needed."}`,
      ].join("\n");
    })
    .join("\n\n");
}

function draftChangePrompt(workspace: LedgerWorkspace, file: GitChangedFile): string {
  if (file.status === "added") return "describe the new behavior or documentation introduced here.";
  if (file.status === "deleted") return "describe what was removed and what replaced the old behavior.";
  if (isDocsPath(file.path, workspace.config.docs.root)) {
    return "summarize the documentation update and the source behavior it explains.";
  }
  if (file.path.startsWith("test/") || file.path.includes("/test/") || file.path.includes("/tests/")) {
    return "summarize the behavior now covered or protected by this test change.";
  }
  return "summarize the implementation change and the user, agent, or maintainer impact.";
}

function draftDocsImpact(workspace: LedgerWorkspace, file: GitChangedFile): string {
  if (isDocsPath(file.path, workspace.config.docs.root)) {
    return "This file is direct docs impact.";
  }
  return "TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.";
}

function areaFromSegment(segment: string): string {
  return segment
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isDocsPath(filePath: string, docsRoot: string): boolean {
  const normalized = normalizePath(filePath);
  const root = normalizePath(docsRoot).replace(/\/$/, "");
  return normalized === root || normalized.startsWith(`${root}/`);
}

function coverageReferencesForChangedFiles(files: readonly GitChangedFile[]): readonly string[] {
  if (files.length <= largeDiffFileThreshold) {
    return files.map((file) => file.path);
  }
  return groupChangedFiles(files).map((group) => group.coverage);
}

interface ChangedFileGroup {
  readonly coverage: string;
  readonly files: readonly GitChangedFile[];
}

function groupChangedFiles(files: readonly GitChangedFile[]): readonly ChangedFileGroup[] {
  const byPrefix = new Map<string, GitChangedFile[]>();
  const exact: GitChangedFile[] = [];

  for (const file of files) {
    const prefix = groupingPrefix(file.path);
    if (!prefix) {
      exact.push(file);
      continue;
    }
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
  }

  const groups: ChangedFileGroup[] = [];
  for (const [prefix, groupedFiles] of [...byPrefix.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (groupedFiles.length >= largeDiffGroupThreshold) {
      groups.push({ coverage: `${prefix}/**`, files: groupedFiles });
    } else {
      exact.push(...groupedFiles);
    }
  }

  for (const file of exact.sort((left, right) => left.path.localeCompare(right.path))) {
    groups.push({ coverage: file.path, files: [file] });
  }

  return groups;
}

function groupingPrefix(filePath: string): string | undefined {
  const normalized = normalizePath(filePath);
  const segments = normalized.split("/");
  if (segments.length <= 1) return undefined;
  if (segments.length === 2) return segments[0];
  return `${segments[0]}/${segments[1]}`;
}

function countStatuses(files: readonly GitChangedFile[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.status, (counts.get(file.status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status} ${count}`)
    .join(", ");
}

function defaultProductNoteTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "product-note"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "captured"',
    "areas: []",
    "tags: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Context",
    "",
    "Where did this feedback come from?",
    "",
    "## Finding",
    "",
    "What did the user, product team, or dogfood session reveal?",
    "",
    "## Impact",
    "",
    "Why does it matter?",
    "",
    "## Recommendation",
    "",
    "What should happen next?",
    "",
    "## Follow-ups",
    "",
    "- Add concrete follow-ups or `None`.",
    "",
  ].join("\n");
}
