import path from "node:path";
import { isCoverageRequired } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import type {
  LedgerDocsImpactDeclaration,
  LedgerDocsImpactStatus,
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
  const changedEntryDocuments = documents.filter((document) =>
    changedSet.has(normalizePath(document.relativePath)),
  );
  const referencedDocs = collectChangedEntryDocs(
    changedEntryDocuments,
    docsRoot,
  );
  const declarations = collectDocsImpactDeclarations(changedEntryDocuments, docsRoot);
  const hasDocsImpact =
    docsFiles.length > 0 ||
    referencedDocs.length > 0 ||
    declarations.length > 0;

  return {
    docsRoot,
    changedFiles: normalizedChangedFiles,
    sourceFiles,
    docsFiles,
    ledgerFiles,
    changedEntries,
    referencedDocs,
    declarations,
    missingDocsImpact: sourceFiles.length > 0 && !hasDocsImpact ? sourceFiles : [],
  };
}

export async function writeDocsImpactReport(
  workspace: LedgerWorkspace,
  impact: LedgerDocsImpact,
): Promise<void> {
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "docs-impact.md"));
  await applyFileTransaction(workspace, "write docs impact report", [
    { path: reportPath, content: formatDocsImpactReport(impact) },
  ]);
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
    `- Explicit docs impact declarations: ${impact.declarations.length}`,
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
    "## Explicit Docs Impact",
    "",
    ...declarationLines(impact.declarations),
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

function collectDocsImpactDeclarations(
  documents: readonly ParsedLedgerDocument[],
  docsRoot: string,
): readonly LedgerDocsImpactDeclaration[] {
  return documents
    .map((document) => docsImpactDeclaration(document, docsRoot))
    .filter((declaration): declaration is LedgerDocsImpactDeclaration => Boolean(declaration))
    .sort((left, right) => left.entry.localeCompare(right.entry));
}

function docsImpactDeclaration(
  document: ParsedLedgerDocument,
  docsRoot: string,
): LedgerDocsImpactDeclaration | undefined {
  const value = document.frontmatter.docsImpact;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = docsImpactStatus(record.status);
  if (!status) return undefined;
  const reason = typeof record.reason === "string" ? record.reason.trim() : undefined;
  if ((status === "not-needed" || status === "none") && !isReviewedReason(reason)) {
    return undefined;
  }
  const docs = Array.isArray(record.docs)
    ? record.docs.filter((item): item is string => typeof item === "string")
        .map(normalizePath)
        .filter((filePath) => isDocsPath(filePath, docsRoot))
    : [];
  return {
    entry: normalizePath(document.relativePath),
    status,
    reason,
    docs,
  };
}

function docsImpactStatus(value: unknown): LedgerDocsImpactStatus | undefined {
  if (value === "updated" || value === "not-needed" || value === "none") return value;
  return undefined;
}

function isReviewedReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return reason.length > 0 && !/^todo\b/i.test(reason);
}

function declarationLines(
  declarations: readonly LedgerDocsImpactDeclaration[],
): readonly string[] {
  if (declarations.length === 0) return ["None."];
  return declarations.map((declaration) => {
    const reason = declaration.reason ? `: ${declaration.reason}` : "";
    const docs = declaration.docs.length > 0
      ? ` Docs: ${declaration.docs.map((doc) => `\`${doc}\``).join(", ")}.`
      : "";
    return `- \`${declaration.entry}\`: ${declaration.status}${reason}.${docs}`;
  });
}

function listOrNone(values: readonly string[]): readonly string[] {
  if (values.length === 0) return ["None."];
  return values.map((value) => `- \`${value}\``);
}
