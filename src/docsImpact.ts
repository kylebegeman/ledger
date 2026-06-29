import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCoverageRequired } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerDocsImpact,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export function buildDocsImpact(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  changedFiles: readonly string[],
): LedgerDocsImpact {
  const normalizedChangedFiles = [...new Set(changedFiles.map(normalizePath))].sort();
  const docsRoot = normalizePath(workspace.config.docs.root);
  const changedSet = new Set(normalizedChangedFiles);
  const docsFiles = normalizedChangedFiles.filter((filePath) => isDocsPath(filePath, docsRoot));
  const ledgerFiles = normalizedChangedFiles.filter((filePath) => isLedgerPath(filePath));
  const sourceFiles = normalizedChangedFiles.filter((filePath) =>
    isSourceImpactFile(workspace, filePath, docsRoot),
  );
  const changedEntries = documents
    .filter((document) => changedSet.has(normalizePath(document.relativePath)))
    .map((document) => normalizePath(document.relativePath))
    .sort();
  const referencedDocs = collectChangedEntryDocs(
    documents.filter((document) => changedSet.has(normalizePath(document.relativePath))),
    docsRoot,
  );
  const hasDocsImpact = docsFiles.length > 0 || referencedDocs.length > 0;

  return {
    docsRoot,
    changedFiles: normalizedChangedFiles,
    sourceFiles,
    docsFiles,
    ledgerFiles,
    changedEntries,
    referencedDocs,
    missingDocsImpact: sourceFiles.length > 0 && !hasDocsImpact ? sourceFiles : [],
  };
}

export async function writeDocsImpactReport(
  workspace: LedgerWorkspace,
  impact: LedgerDocsImpact,
): Promise<void> {
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "docs-impact.md"),
    formatDocsImpactReport(impact),
    "utf8",
  );
}

export function formatDocsImpactReport(impact: LedgerDocsImpact): string {
  const lines = [
    "# Ledger Docs Impact",
    "",
    `Docs root: \`${impact.docsRoot}\``,
    "",
    "## Summary",
    "",
    `- Changed files: ${impact.changedFiles.length}`,
    `- Source files: ${impact.sourceFiles.length}`,
    `- Docs files: ${impact.docsFiles.length}`,
    `- Ledger files: ${impact.ledgerFiles.length}`,
    `- Changed Ledger entries: ${impact.changedEntries.length}`,
    `- Referenced docs from changed entries: ${impact.referencedDocs.length}`,
    `- Missing docs impact: ${impact.missingDocsImpact.length}`,
    "",
    "## Source Files",
    "",
    ...listOrNone(impact.sourceFiles),
    "",
    "## Docs Files",
    "",
    ...listOrNone(impact.docsFiles),
    "",
    "## Referenced Docs",
    "",
    ...listOrNone(impact.referencedDocs),
    "",
    "## Missing Docs Impact",
    "",
    ...listOrNone(impact.missingDocsImpact),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function isSourceImpactFile(
  workspace: LedgerWorkspace,
  filePath: string,
  docsRoot: string,
): boolean {
  return (
    isCoverageRequired(workspace, filePath) &&
    !isDocsPath(filePath, docsRoot) &&
    !isLedgerPath(filePath)
  );
}

function isDocsPath(filePath: string, docsRoot: string): boolean {
  const normalized = normalizePath(filePath);
  const root = normalizePath(docsRoot).replace(/\/$/, "");
  return normalized === root || normalized.startsWith(`${root}/`);
}

function isLedgerPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return normalized === ".ledger" || normalized.startsWith(".ledger/");
}

function collectChangedEntryDocs(
  documents: readonly ParsedLedgerDocument[],
  docsRoot: string,
): readonly string[] {
  const refs = new Set<string>();
  for (const document of documents) {
    const normalized = normalizeDocument(document);
    for (const filePath of [...normalized.docs, ...normalized.files]) {
      if (isDocsPath(filePath, docsRoot)) {
        refs.add(normalizePath(filePath));
      }
    }
  }
  return [...refs].sort();
}

function listOrNone(values: readonly string[]): readonly string[] {
  if (values.length === 0) return ["None."];
  return values.map((value) => `- \`${value}\``);
}
