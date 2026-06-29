import { checkCoverage } from "./coverage.js";
import { auditDocs } from "./docs.js";
import { buildDocsImpact } from "./docsImpact.js";
import { getChangedFiles } from "./git.js";
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

export async function runCiChecks(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: LedgerCiOptions = {},
): Promise<LedgerCiResult> {
  const validation = validateDocuments(workspace, documents);
  const docsAudit = await auditDocs(workspace, documents);
  const coverage = await checkCoverage(workspace, documents, { staged: options.staged });
  const changedFiles = await getChangedFiles(workspace.projectRoot, { staged: options.staged });
  const docsImpact = buildDocsImpact(workspace, documents, changedFiles);
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
