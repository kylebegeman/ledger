import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isIgnoredByGitConfig } from "./coverage.js";
import { normalizePath } from "./documents.js";
import { getChangedFileDetails, type GitChangedFile } from "./git.js";
import { extractFileSymbols } from "./symbols.js";
import { renderLedgerTemplate } from "./template.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

const largeDiffFileThreshold = 40;
const largeDiffGroupThreshold = 5;

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
    ? (await getChangedFileDetails(workspace.projectRoot, { staged: options.staged })).filter(
        (file) => !isIgnoredByGitConfig(workspace, file.path),
      )
    : [];
  const files = coverageReferencesForChangedFiles(changedFiles);
  const symbols = options.fromDiff
    ? await collectChangedSymbols(workspace, changedFiles)
    : { all: [], byFile: new Map<string, readonly string[]>() };
  const docs = files.filter((file) => isDocsPath(file, workspace.config.docs.root));
  const areas = options.areas.length > 0 ? options.areas : inferAreas(workspace, changedFiles);
  const date = new Date().toISOString().slice(0, 10);
  const template = await readTemplate(workspace);
  const rendered = renderLedgerTemplate(template, {
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
    },
    blocks: {
      changedFiles: renderChangedFiles(workspace, changedFiles, symbols.byFile),
    },
  });

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, rendered, { encoding: "utf8", flag: "wx" });
  return relativePath.replace(/\\/g, "/");
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
  const absolutePath = path.join(workspace.projectRoot, relativePath);
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

async function readProductNoteTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = path.join(workspace.ledgerRoot, "templates", "product-note.md");
  try {
    return await readFile(templatePath, "utf8");
  } catch {
    return defaultProductNoteTemplate();
  }
}

export function inferAreas(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
): readonly string[] {
  const areas = new Set<string>();
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
    } else if (first) {
      areas.add(areaFromSegment(first));
    }
  }
  return [...areas].sort();
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

function renderChangedFiles(
  workspace: LedgerWorkspace,
  files: readonly GitChangedFile[],
  symbolsByFile: ReadonlyMap<string, readonly string[]> = new Map(),
): string {
  if (files.length === 0) return "### path/to/file.ts";
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
        `- Anchor: ${anchors.length > 0 ? anchors.join(", ") : "TODO: name the important symbol, route, command, or section."}`,
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
