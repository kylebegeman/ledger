import { mkdir, writeFile } from "node:fs/promises";
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
}

export interface LedgerReleaseDocument {
  readonly version: string;
  readonly entries: readonly NormalizedLedgerDocument[];
  readonly markdown: string;
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
  const entries = options.includeUnreleased
    ? getUnreleasedChanges(documents)
    : getReleaseChanges(documents, version);
  return {
    version,
    entries,
    markdown: formatReleaseMarkdown(version, entries, options.date ?? today()),
  };
}

export async function writeReleaseDocument(
  workspace: LedgerWorkspace,
  document: LedgerReleaseDocument,
): Promise<string> {
  const releaseDirectory = path.join(workspace.projectRoot, workspace.config.source.releases);
  const releasePath = path.join(releaseDirectory, `${releaseFileName(document.version)}.md`);
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(releasePath, document.markdown, { encoding: "utf8", flag: "wx" });
  return normalizePath(path.relative(workspace.projectRoot, releasePath));
}

export function formatReleaseMarkdown(
  version: string,
  entries: readonly NormalizedLedgerDocument[],
  date: string,
): string {
  const lines = [
    "---",
    `id: "${escapeYamlString(version)}"`,
    'kind: "release"',
    `title: "Ledger ${escapeYamlString(version)}"`,
    `date: "${escapeYamlString(date)}"`,
    `updated: "${escapeYamlString(date)}"`,
    'status: "planned"',
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
