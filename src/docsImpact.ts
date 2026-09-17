import path from "node:path";
import { coveragePatternMatches, isCoverageRequired } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import type {
  LedgerCoverageMode,
  LedgerDocsImpactDeclaration,
  LedgerDocsImpactEvidence,
  LedgerDocsImpactFile,
  LedgerDocsImpactStatus,
  LedgerDocsImpact,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export interface BuildDocsImpactOptions {
  /**
   * Coverage mode, defaulting to `git.coverage`. Under `current` only change
   * entries in the change set give evidence; under `any` a source file they do
   * not satisfy may take its evidence from an earlier receipt that lists it.
   */
  readonly mode?: LedgerCoverageMode;
}

export function buildDocsImpact(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  changedFiles: readonly string[],
  options: BuildDocsImpactOptions = {},
): LedgerDocsImpact {
  const mode = options.mode ?? workspace.config.git.coverage;
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
  // Each entry is normalized once; the per-file loop only matches patterns.
  const changedSources = evidenceSources(changedEntryDocuments, docsRoot);
  const earlierSources = mode === "any"
    ? evidenceSources(documents.filter((document) => !changedSet.has(normalizePath(document.relativePath))), docsRoot)
    : [];
  const files = sourceFiles.map((filePath): LedgerDocsImpactFile => {
    const current = docsImpactFile(filePath, changedSources);
    if (current.satisfied || earlierSources.length === 0) return current;
    const earlier = docsImpactFile(filePath, earlierSources);
    if (!earlier.satisfied) return current;
    return { ...earlier, entries: [...new Set([...current.entries, ...earlier.entries])].sort(), earlierEvidence: true };
  });

  return {
    mode,
    docsRoot,
    changedFiles: normalizedChangedFiles,
    sourceFiles,
    docsFiles,
    ledgerFiles,
    changedEntries,
    referencedDocs,
    declarations,
    files,
    missingDocsImpact: files.filter((file) => !file.satisfied).map((file) => file.path),
    earlierEvidenceFiles: files.filter((file) => file.earlierEvidence).map((file) => file.path),
  };
}

/** What one change entry can say about the files it lists, read once per entry. */
interface EvidenceSource {
  readonly entry: string;
  readonly files: readonly string[];
  readonly declaration: LedgerDocsImpactDeclaration | undefined;
  /** Docs the entry references through `docs` or `files`. */
  readonly docs: readonly string[];
}

function evidenceSources(documents: readonly ParsedLedgerDocument[], docsRoot: string): readonly EvidenceSource[] {
  return documents
    .filter((document) => document.kind === "change")
    .map((document) => {
      const normalized = normalizeDocument(document);
      return {
        entry: normalizePath(document.relativePath),
        files: normalized.files,
        declaration: docsImpactDeclaration(document, docsRoot),
        docs: [...new Set([...normalized.docs, ...normalized.files].map(normalizePath).filter((candidate) => isDocsPath(candidate, docsRoot)))].sort(),
      };
    });
}

/**
 * Evidence for one source file: every given entry that lists the file
 * contributes its reviewed docs-impact declaration or its docs references.
 * A file with no evidence is missing docs impact, however many docs changed
 * elsewhere in the set.
 */
function docsImpactFile(filePath: string, sources: readonly EvidenceSource[]): LedgerDocsImpactFile {
  const entries: string[] = [];
  const evidence: LedgerDocsImpactEvidence[] = [];
  for (const source of sources) {
    if (!source.files.some((pattern) => coveragePatternMatches(filePath, pattern))) continue;
    entries.push(source.entry);
    if (source.declaration) {
      const { status, reason, docs } = source.declaration;
      evidence.push({ entry: source.entry, kind: "declaration", status, reason, docs });
      continue;
    }
    if (source.docs.length > 0) evidence.push({ entry: source.entry, kind: "docs-reference", docs: source.docs });
  }
  return { path: filePath, satisfied: evidence.length > 0, entries: entries.sort(), evidence };
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
    ...(impact.mode === "any" ? [`- Satisfied by earlier receipts (git.coverage any): ${impact.earlierEvidenceFiles.length}`] : []),
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
    "## Per-File Evidence",
    "",
    ...fileEvidenceLines(impact.files),
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

/**
 * The reviewed docs-impact declaration of a record, or undefined when the
 * record declares none or its reason is still a TODO placeholder.
 */
export function docsImpactDeclaration(
  document: ParsedLedgerDocument,
  docsRoot: string,
): LedgerDocsImpactDeclaration | undefined {
  const value = document.frontmatter.docsImpact;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const status = docsImpactStatus(record.status);
  if (!status) return undefined;
  // A placeholder reason is unreviewed whatever the status says; `ready` applies the same rule.
  const reason = typeof record.reason === "string" ? record.reason.trim() : undefined;
  if (!isReviewedReason(reason)) return undefined;
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

function fileEvidenceLines(files: readonly LedgerDocsImpactFile[]): readonly string[] {
  if (files.length === 0) return ["None."];
  return files.flatMap((file) => {
    const head = `- ${file.earlierEvidence ? "satisfied by earlier receipts" : file.satisfied ? "satisfied" : "missing"}: \`${file.path}\``;
    if (file.evidence.length === 0) {
      return [
        file.entries.length > 0
          ? `${head} (listed by ${file.entries.map((entry) => `\`${entry}\``).join(", ")} without a reviewed docs impact)`
          : `${head} (no changed entry lists it)`,
      ];
    }
    return [
      head,
      ...file.evidence.map((item) => {
        const docs = item.docs.length > 0 ? ` Docs: ${item.docs.map((doc) => `\`${doc}\``).join(", ")}.` : "";
        const detail = item.kind === "declaration" ? `${item.status}${item.reason ? `: ${item.reason}` : ""}` : "references docs";
        return `  - \`${item.entry}\`: ${detail}${docs}`;
      }),
    ];
  });
}

function listOrNone(values: readonly string[]): readonly string[] {
  if (values.length === 0) return ["None."];
  return values.map((value) => `- \`${value}\``);
}
