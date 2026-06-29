import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export interface BuildReleaseDocumentOptions {
  readonly includeUnreleased?: boolean;
  readonly date?: string;
  readonly status?: "planned" | "released";
}

export interface LedgerReleaseDocument {
  readonly version: string;
  readonly status: "planned" | "released";
  readonly entries: readonly NormalizedLedgerDocument[];
  readonly markdown: string;
}

export interface AssignReleaseResult {
  readonly version: string;
  readonly updatedEntries: readonly string[];
}

export function getUnreleasedChanges(
  documents: readonly ParsedLedgerDocument[],
): readonly NormalizedLedgerDocument[] {
  return documents
    .map(normalizeDocument)
    .filter((document) => document.kind === "change")
    .filter((document) => document.status === "landed" || document.status === "shipped")
    .filter((document) => !document.release)
    .sort(compareReleaseEntries);
}

export function getReleaseChanges(
  documents: readonly ParsedLedgerDocument[],
  version: string,
): readonly NormalizedLedgerDocument[] {
  return documents
    .map(normalizeDocument)
    .filter((document) => document.kind === "change")
    .filter((document) => document.release === version)
    .sort(compareReleaseEntries);
}

export function buildReleaseDocument(
  documents: readonly ParsedLedgerDocument[],
  version: string,
  options: BuildReleaseDocumentOptions = {},
): LedgerReleaseDocument {
  validateReleaseVersion(version);
  const entries = options.includeUnreleased
    ? getUnreleasedChanges(documents)
    : getReleaseChanges(documents, version);
  const status = options.status ?? "planned";
  return {
    version,
    status,
    entries,
    markdown: formatReleaseMarkdown(version, entries, {
      date: options.date ?? today(),
      status,
    }),
  };
}

export async function writeReleaseDocument(
  workspace: LedgerWorkspace,
  document: LedgerReleaseDocument,
): Promise<string> {
  const releasePath = releaseDocumentPath(workspace, document.version);
  await mkdir(path.dirname(releasePath), { recursive: true });
  await writeFile(releasePath, document.markdown, { encoding: "utf8", flag: "wx" });
  return normalizePath(path.relative(workspace.projectRoot, releasePath));
}

export async function assertReleaseDocumentWritable(
  workspace: LedgerWorkspace,
  version: string,
): Promise<void> {
  validateReleaseVersion(version);
  const releasePath = releaseDocumentPath(workspace, version);
  try {
    await access(releasePath, constants.F_OK);
  } catch {
    return;
  }
  throw new Error(`Release document already exists: ${normalizePath(path.relative(workspace.projectRoot, releasePath))}`);
}

export async function assignEntriesToRelease(
  workspace: LedgerWorkspace,
  entries: readonly NormalizedLedgerDocument[],
  version: string,
): Promise<AssignReleaseResult> {
  validateReleaseVersion(version);
  const updatedEntries: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(workspace.projectRoot, entry.path);
    const updated = assignReleaseInMarkdown(await readFile(absolutePath, "utf8"), version);
    await writeFile(absolutePath, updated, "utf8");
    updatedEntries.push(entry.path);
  }
  return { version, updatedEntries };
}

export function assignReleaseInMarkdown(markdown: string, version: string): string {
  validateReleaseVersion(version);
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) throw new Error("Cannot assign release: missing YAML frontmatter");
  const frontmatter = match[1] ?? "";
  const releaseLine = `release: "${escapeYamlString(version)}"`;
  const updatedFrontmatter = /^\s*release\s*:/m.test(frontmatter)
    ? frontmatter.replace(/^\s*release\s*:.*$/m, releaseLine)
    : `${frontmatter}\n${releaseLine}`;
  return markdown.replace(match[0], `---\n${updatedFrontmatter}\n---`);
}

export function formatReleaseMarkdown(
  version: string,
  entries: readonly NormalizedLedgerDocument[],
  options: { readonly date: string; readonly status?: "planned" | "released" },
): string {
  validateReleaseVersion(version);
  const status = options.status ?? "planned";
  const lines = [
    "---",
    `id: "${escapeYamlString(version)}"`,
    'kind: "release"',
    `title: "Ledger ${escapeYamlString(version)}"`,
    `date: "${escapeYamlString(options.date)}"`,
    `updated: "${escapeYamlString(options.date)}"`,
    `status: "${status}"`,
    'areas: ["release"]',
    ...entryFrontmatterLines(entries),
    "---",
    "",
    `# Ledger ${version}`,
    "",
    "## Summary",
    "",
    `${entries.length} change(s) selected for ${version}.`,
    "",
    "## Public Notes",
    "",
    ...publicNoteLines(entries),
    "",
    "## Changes",
    "",
    ...changeLines(entries),
    "",
    "## Verification",
    "",
    "- Review the verification sections in the listed Ledger entries.",
    "",
    "## Known Issues",
    "",
    "- None recorded.",
    "",
  ];

  return `${lines.join("\n")}`;
}

export function validateReleaseVersion(version: string): void {
  if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

function entryFrontmatterLines(entries: readonly NormalizedLedgerDocument[]): readonly string[] {
  if (entries.length === 0) return ["entries: []"];
  return ["entries:", ...entries.map((entry) => `  - "${escapeYamlString(entry.id)}"`)];
}

function changeLines(entries: readonly NormalizedLedgerDocument[]): readonly string[] {
  if (entries.length === 0) return ["- No matching Ledger entries."];
  return entries.map((entry) => {
    const areas = entry.areas.length > 0 ? ` [${entry.areas.join(", ")}]` : "";
    return `- ${entry.id}: ${entry.title}${areas} (${entry.path})`;
  });
}

function publicNoteLines(entries: readonly NormalizedLedgerDocument[]): readonly string[] {
  if (entries.length === 0) return ["- No public changes selected."];
  return entries.map((entry) => `- ${entry.title}`);
}

function compareReleaseEntries(
  left: NormalizedLedgerDocument,
  right: NormalizedLedgerDocument,
): number {
  return left.id.localeCompare(right.id);
}

function releaseFileName(version: string): string {
  return version
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
}

function releaseDocumentPath(workspace: LedgerWorkspace, version: string): string {
  const releaseDirectory = path.join(workspace.projectRoot, workspace.config.source.releases);
  return path.join(releaseDirectory, `${releaseFileName(version)}.md`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
