import { checkCoverage } from "./coverage.js";
import { auditDocs } from "./docs.js";
import { buildDocsImpact } from "./docsImpact.js";
import type {
  LedgerCoverageResult,
  LedgerDocsAudit,
  LedgerDocsImpact,
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";
import { validateDocuments } from "./validate.js";

export interface LedgerCiOptions {
  readonly staged?: boolean;
  readonly base?: string;
  readonly head?: string;
  readonly currentOnly?: boolean;
  readonly validationBaseline?: ReadonlySet<string>;
}

export interface LedgerCiCheck {
  readonly name: "validate" | "docs" | "coverage" | "docs-impact";
  readonly ok: boolean;
  readonly errors: number;
  readonly warnings: number;
}

export interface LedgerCiResult {
  readonly ok: boolean;
  readonly checks: readonly LedgerCiCheck[];
  readonly validation: LedgerValidationResult;
  readonly docsAudit: LedgerDocsAudit;
  readonly coverage: LedgerCoverageResult;
  readonly docsImpact: LedgerDocsImpact;
}

/**
 * GitHub Actions workflow commands for every failing signal, one per line.
 * Errors block; warnings annotate. Written to stdout by `ledger ci --github`.
 */
export function formatCiAnnotations(result: LedgerCiResult): readonly string[] {
  const lines: string[] = [];
  for (const issue of result.validation.errors) {
    lines.push(annotation("error", "Ledger validation", issue.message, issue.path));
  }
  for (const issue of result.validation.warnings) {
    lines.push(annotation("warning", "Ledger validation", issue.message, issue.path));
  }
  for (const reference of result.docsAudit.missingReferences) {
    lines.push(annotation("error", "Ledger docs", `a record references a missing doc: ${reference}`));
  }
  for (const file of result.coverage.files) {
    if (file.status === "missing") {
      lines.push(annotation("error", "Ledger coverage", `no change entry in this change set lists ${file.path}; add or update a receipt`, file.path));
    } else if (file.status === "historical") {
      lines.push(annotation("error", "Ledger coverage", `${file.path} is listed only by records outside this change set (${file.coveredBy.join(", ")}); add or update a receipt`, file.path));
    }
  }
  for (const file of result.docsImpact.files) {
    if (file.satisfied) continue;
    const reason = file.entries.length > 0
      ? `${file.entries.join(", ")} lists ${file.path} without a reviewed docsImpact declaration`
      : `no change entry in this change set ties ${file.path} to a docs decision`;
    lines.push(annotation("error", "Ledger docs impact", reason, file.path));
  }
  return lines;
}

/** Markdown for the GitHub Actions job summary. */
export function formatCiSummaryMarkdown(result: LedgerCiResult): string {
  const lines = [
    `## Ledger CI: ${result.ok ? "passed" : "failed"}`,
    "",
    "| Check | Result | Errors | Warnings |",
    "| --- | --- | --- | --- |",
    ...result.checks.map((check) => `| ${check.name} | ${check.ok ? "pass" : "fail"} | ${check.errors} | ${check.warnings} |`),
    "",
  ];
  const details: string[] = [];
  for (const issue of result.validation.errors) details.push(`- validation: ${issue.path ? `\`${issue.path}\`: ` : ""}${issue.message}`);
  for (const reference of result.docsAudit.missingReferences) details.push(`- docs: missing reference \`${reference}\``);
  for (const file of result.coverage.files) {
    if (file.status === "missing") details.push(`- coverage: \`${file.path}\` has no change entry in this change set`);
    if (file.status === "historical") details.push(`- coverage: \`${file.path}\` is listed only by ${file.coveredBy.join(", ")} outside this change set`);
  }
  for (const file of result.docsImpact.files) {
    if (!file.satisfied) details.push(`- docs impact: \`${file.path}\` has no evidence from a change entry in this change set`);
  }
  if (details.length > 0) lines.push("### What to fix", "", ...details, "");
  if (result.coverage.currentEntries.length > 0) {
    lines.push(`Change entries in this change set: ${result.coverage.currentEntries.join(", ")}.`, "");
  }
  return lines.join("\n");
}

function annotation(level: "error" | "warning", title: string, message: string, file?: string): string {
  const properties = [file ? `file=${escapeProperty(file)}` : undefined, `title=${escapeProperty(title)}`]
    .filter(Boolean)
    .join(",");
  return `::${level} ${properties}::${escapeData(message)}`;
}

function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export async function runCiChecks(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: LedgerCiOptions = {},
): Promise<LedgerCiResult> {
  const validation = validateDocuments(workspace, documents, {
    currentOnly: options.currentOnly,
    baseline: options.validationBaseline,
  });
  const docsAudit = await auditDocs(workspace, documents);
  const coverage = await checkCoverage(workspace, documents, {
    staged: options.staged,
    base: options.base,
    head: options.head,
  });
  const docsImpact = buildDocsImpact(workspace, documents, coverage.changedFiles, { mode: coverage.mode });
  const checks: readonly LedgerCiCheck[] = [
    {
      name: "validate",
      ok: validation.errors.length === 0,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    },
    {
      name: "docs",
      ok: docsAudit.missingReferences.length === 0,
      errors: docsAudit.missingReferences.length,
      warnings: docsAudit.unreferencedDocs.length,
    },
    {
      name: "coverage",
      ok: coverage.missingFiles.length === 0,
      errors: coverage.missingFiles.length,
      warnings: 0,
    },
    {
      name: "docs-impact",
      ok: docsImpact.missingDocsImpact.length === 0,
      errors: docsImpact.missingDocsImpact.length,
      warnings: 0,
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
    validation,
    docsAudit,
    coverage,
    docsImpact,
  };
}
