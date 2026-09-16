import { z } from "zod";
import { runCiChecks, type LedgerCiResult } from "../../ci.js";
import { checkCoverage } from "../../coverage.js";
import { writeDocsAuditReport } from "../../docs.js";
import { buildDocsImpact, writeDocsImpactReport } from "../../docsImpact.js";
import { getChangedFiles } from "../../git.js";
import type { LedgerCoverageResult, LedgerDocsImpact } from "../../types.js";
import { readValidationBaseline, writeValidationReport } from "../../validate.js";
import {
  changeRangeShape,
  loadDocuments,
  looseRecord,
  pathString,
  resolveChangeOptions,
  type ChangeRangeInput,
} from "../shared.js";
import { defineOperation } from "../types.js";

const changeRangeFlags = {
  staged: { type: "boolean", description: "Inspect the staged Git diff." },
  base: { type: "string", description: "Base revision for a merge-base range." },
  head: { type: "string", description: "Head revision for a merge-base range." },
} as const;

interface CoverageInput extends ChangeRangeInput, Record<string, unknown> {
  readonly explain?: boolean;
}

export const coverageOperation = defineOperation<CoverageInput, LedgerCoverageResult>({
  name: "coverage",
  title: "Check Ledger coverage",
  description: "Check changed files against git.requireEntryFor and Ledger file coverage.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    ...changeRangeShape,
    explain: z.boolean().optional().describe("Explain each changed path's coverage status."),
  }),
  output: looseRecord({
    changedFiles: z.array(z.string()),
    requiredFiles: z.array(z.string()),
    coveredFiles: z.array(z.string()),
    missingFiles: z.array(z.string()),
    files: z.array(looseRecord({ path: z.string(), status: z.string() })),
  }),
  cli: {
    path: ["coverage"],
    usage: "ledger coverage [--staged | --base <revision> --head <revision>] [--explain] [--json]",
    flags: {
      ...changeRangeFlags,
      explain: { type: "boolean", description: "Explain each changed path's status." },
    },
    json: true,
    help: `Checks changed files against git.requireEntryFor and Ledger file coverage.
--explain prints why each changed path is ignored, not required, covered, or
missing coverage. --base and --head inspect their merge-base change range.`,
  },
  mcp: {
    tool: "ledger_coverage",
    title: "Check Ledger coverage",
    summary: (data) => ({
      changedFiles: data.changedFiles.length,
      requiredFiles: data.requiredFiles.length,
      missingFiles: data.missingFiles.length,
    }),
  },
  async run(context, input) {
    const changes = resolveChangeOptions(input);
    const { workspace, documents } = await loadDocuments(context);
    const result = await checkCoverage(workspace, documents, changes);
    return { data: result, exitCode: result.missingFiles.length === 0 ? 0 : 1 };
  },
  format(data, input) {
    const lines = [
      `Ledger coverage: ${data.requiredFiles.length} required file(s), ${data.missingFiles.length} missing coverage.`,
    ];
    for (const file of data.files) {
      if (file.status === "missing") {
        lines.push(`- missing: ${file.path} (required by ${file.requiredBy ?? "configuration"})`);
      } else if (input.explain) {
        const reason =
          file.status === "ignored"
            ? `ignored by ${file.ignoredBy}`
            : file.status === "not-required"
              ? "not required by git.requireEntryFor"
              : `covered by ${file.coveredBy.join(", ")}`;
        lines.push(`- ${file.status}: ${file.path} (${reason})`);
      }
    }
    return lines.join("\n");
  },
});

interface CiInput extends ChangeRangeInput, Record<string, unknown> {
  readonly currentOnly?: boolean;
  readonly noBaseline?: boolean;
}

export const ciOperation = defineOperation<CiInput, LedgerCiResult>({
  name: "ci",
  title: "Run Ledger CI checks",
  description: "Run validation, docs audit, coverage, and docs impact as one check.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    ...changeRangeShape,
    currentOnly: z.boolean().optional().describe("Skip historical records."),
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    checks: z.array(looseRecord({ name: z.string(), ok: z.boolean(), errors: z.number(), warnings: z.number() })),
  }),
  cli: {
    path: ["ci"],
    usage: "ledger ci [--staged | --base <revision> --head <revision>] [--current-only] [--no-baseline] [--json]",
    flags: {
      ...changeRangeFlags,
      "current-only": { type: "boolean", description: "Skip historical records." },
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
    },
    json: true,
    help: `Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.
--base and --head inspect their merge-base change range.`,
  },
  mcp: {
    tool: "ledger_ci",
    title: "Run Ledger CI checks",
    summary: (data) => ({
      ok: data.ok,
      failing: data.checks.filter((check) => !check.ok).map((check) => check.name),
    }),
  },
  async run(context, input) {
    const changes = resolveChangeOptions(input);
    const { workspace, documents } = await loadDocuments(context);
    const result = await runCiChecks(workspace, documents, {
      ...changes,
      currentOnly: input.currentOnly,
      validationBaseline: input.noBaseline ? undefined : await readValidationBaseline(workspace),
    });
    await writeValidationReport(workspace, result.validation);
    await writeDocsAuditReport(workspace, result.docsAudit);
    await writeDocsImpactReport(workspace, result.docsImpact);
    return { data: result, exitCode: result.ok ? 0 : 1 };
  },
  format(data) {
    const lines = [`Ledger CI: ${data.ok ? "passed" : "failed"}.`];
    for (const check of data.checks) {
      lines.push(
        `- ${check.ok ? "pass" : "fail"}: ${check.name} (${check.errors} error(s), ${check.warnings} warning(s))`,
      );
    }
    return lines.join("\n");
  },
});

interface DocsImpactInput extends ChangeRangeInput, Record<string, unknown> {
  readonly check?: boolean;
  readonly changedFiles?: readonly string[];
  readonly writeReport?: boolean;
}

export const docsImpactOperation = defineOperation<DocsImpactInput, LedgerDocsImpact>({
  name: "docs.impact",
  title: "Check docs impact",
  description: "Return docs impact for changed files or the current git diff.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    ...changeRangeShape,
    check: z.boolean().optional().describe("Exit non-zero when source files lack docs impact."),
    changedFiles: z.array(pathString).max(10_000).optional().describe("Changed files to inspect. Uses git when omitted."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/docs-impact.md."),
  }),
  output: looseRecord({
    sourceFiles: z.array(z.string()),
    docsFiles: z.array(z.string()),
    referencedDocs: z.array(z.string()),
    declarations: z.array(looseRecord({})),
    missingDocsImpact: z.array(z.string()),
  }),
  cli: {
    path: ["docs", "impact"],
    usage: "ledger docs impact [--staged | --base <revision> --head <revision>] [--check] [--json]",
    flags: {
      ...changeRangeFlags,
      check: { type: "boolean", description: "Fail when source files lack docs impact." },
    },
    json: true,
    defaults: { writeReport: true },
    help: `Reports whether changed source files have an explicit docs impact. --base and
--head inspect their merge-base change range.`,
  },
  mcp: {
    tool: "ledger_docs_impact",
    title: "Check docs impact",
    input: z.strictObject({
      changedFiles: z.array(pathString).max(10_000).optional().describe("Changed files to inspect. Uses git status when omitted."),
      staged: z.boolean().optional().describe("Use staged git diff when changedFiles is omitted."),
    }),
    summary: (data) => ({
      sourceFiles: data.sourceFiles.length,
      docsFiles: data.docsFiles.length,
      declarations: data.declarations.length,
      missingDocsImpact: data.missingDocsImpact.length,
    }),
  },
  async run(context, input) {
    const changes = resolveChangeOptions(input);
    const { workspace, documents } = await loadDocuments(context);
    const changedFiles = input.changedFiles ?? (await getChangedFiles(workspace.projectRoot, changes));
    const impact = buildDocsImpact(workspace, documents, changedFiles);
    if (input.writeReport) await writeDocsImpactReport(workspace, impact);
    return {
      data: impact,
      exitCode: input.check && impact.missingDocsImpact.length > 0 ? 1 : 0,
    };
  },
  format(data) {
    const lines = [
      `Ledger docs impact: ${data.sourceFiles.length} source file(s), ${data.docsFiles.length} docs file(s), ${data.referencedDocs.length} referenced doc(s), ${data.declarations.length} explicit declaration(s), ${data.missingDocsImpact.length} missing docs impact.`,
    ];
    for (const filePath of data.missingDocsImpact) lines.push(`- missing docs impact: ${filePath}`);
    return lines.join("\n");
  },
});
