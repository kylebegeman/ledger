import { z } from "zod";
import { appendFile } from "node:fs/promises";
import { formatCiAnnotations, formatCiSummaryMarkdown, runCiChecks, type LedgerCiResult } from "../../ci.js";
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

export interface CoverageInput extends ChangeRangeInput, Record<string, unknown> {
  readonly explain?: boolean;
  readonly mode?: "current" | "any";
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
    mode: z.enum(["current", "any"]).optional().describe("Coverage mode override; defaults to git.coverage."),
  }),
  output: looseRecord({
    mode: z.string(),
    changedFiles: z.array(z.string()),
    requiredFiles: z.array(z.string()),
    coveredFiles: z.array(z.string()),
    missingFiles: z.array(z.string()),
    historicalFiles: z.array(z.string()),
    currentEntries: z.array(z.string()),
    files: z.array(looseRecord({ path: z.string(), status: z.string() })),
  }),
  cli: {
    path: ["coverage"],
    usage: "ledger coverage [--staged | --base <revision> --head <revision>] [--explain] [--mode <current|any>] [--json]",
    flags: {
      ...changeRangeFlags,
      explain: { type: "boolean", description: "Explain each changed path's status." },
      mode: {
        type: "string",
        description: "Coverage mode override.",
        choices: ["current", "any"],
        choicesLabel: "coverage mode",
      },
    },
    json: true,
    help: `Checks changed files against git.requireEntryFor and Ledger file coverage.
Under the default current mode (git.coverage), a required path must be listed
by a change entry that is itself part of the change set; a path listed only by
older records is reported as historical and counts as missing. --mode any
accepts any change entry, including earlier ones; session records, backlog
items, and decisions never cover a path. --explain prints why each changed path is ignored, not
required, covered, historical, or missing. --base and --head inspect their
merge-base change range.`,
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
    const result = await checkCoverage(workspace, documents, { ...changes, mode: input.mode });
    return { data: result, exitCode: result.missingFiles.length === 0 ? 0 : 1 };
  },
  format(data, input) {
    const lines = [
      `Ledger coverage (${data.mode}): ${data.requiredFiles.length} required file(s), ${data.missingFiles.length} missing coverage.`,
    ];
    for (const file of data.files) {
      if (file.status === "missing") {
        lines.push(`- missing: ${file.path} (required by ${file.requiredBy ?? "configuration"})`);
      } else if (file.status === "historical") {
        lines.push(
          `- historical: ${file.path} (listed only by records outside this change set: ${file.coveredBy.join(", ")}; add or update a change entry)`,
        );
      } else if (input.explain) {
        const reason =
          file.status === "ignored"
            ? `ignored by ${file.ignoredBy}`
            : file.status === "not-required"
              ? "not required by git.requireEntryFor"
              : data.mode === "current"
                ? `covered by ${file.currentEntries.join(", ")} in this change set`
                : `covered by ${file.coveredBy.join(", ")}`;
        lines.push(`- ${file.status}: ${file.path} (${reason})`);
      }
    }
    return lines.join("\n");
  },
});

export interface CiInput extends ChangeRangeInput, Record<string, unknown> {
  readonly currentOnly?: boolean;
  readonly noBaseline?: boolean;
  readonly github?: boolean;
}

export interface CiOutput extends LedgerCiResult {
  /** Present with --github: the annotations printed and the summary written. */
  readonly github?: {
    readonly annotations: readonly string[];
    readonly summary: string;
    readonly summaryPath?: string;
  };
}

export const ciOperation = defineOperation<CiInput, CiOutput>({
  name: "ci",
  title: "Run Ledger CI checks",
  description: "Run validation, docs audit, coverage, and docs impact as one check.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    ...changeRangeShape,
    currentOnly: z.boolean().optional().describe("Skip historical records."),
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
    github: z.boolean().optional().describe("Print GitHub Actions annotations and append a job summary."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    checks: z.array(looseRecord({ name: z.string(), ok: z.boolean(), errors: z.number(), warnings: z.number() })),
    github: looseRecord({ annotations: z.array(z.string()), summary: z.string(), summaryPath: z.string().optional() }).optional(),
  }),
  cli: {
    path: ["ci"],
    usage: "ledger ci [--staged | --base <revision> --head <revision>] [--current-only] [--no-baseline] [--github] [--json]",
    flags: {
      ...changeRangeFlags,
      "current-only": { type: "boolean", description: "Skip historical records." },
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
      github: { type: "boolean", description: "Print GitHub Actions annotations and append a job summary." },
    },
    json: true,
    help: `Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.
--base and --head inspect their merge-base change range. --github prints one
workflow command per failing signal (::error with the file path) so GitHub
annotates the pull request, and appends a Markdown summary to the file named
by GITHUB_STEP_SUMMARY when it is set. The repository's action.yml wraps this.`,
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
    if (!input.github) return { data: result, exitCode: result.ok ? 0 : 1 };
    const annotations = formatCiAnnotations(result);
    const summary = formatCiSummaryMarkdown(result);
    for (const line of annotations) context.log(line);
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) await appendFile(summaryPath, `${summary}\n`, "utf8");
    return { data: { ...result, github: { annotations, summary, summaryPath } }, exitCode: result.ok ? 0 : 1 };
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

export interface DocsImpactInput extends ChangeRangeInput, Record<string, unknown> {
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
    files: z.array(looseRecord({ path: z.string(), satisfied: z.boolean() })),
    missingDocsImpact: z.array(z.string()),
    earlierEvidenceFiles: z.array(z.string()),
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
    help: `Reports whether each changed source file has docs impact evidence: a changed
change entry that lists the file and carries a reviewed docsImpact declaration
or references docs. A docs edit elsewhere in the change set does not satisfy a
file on its own. Under git.coverage any, an earlier receipt that lists the file
and carries that evidence also satisfies it, as it satisfies coverage. --base
and --head inspect their merge-base change range.`,
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
    for (const filePath of data.earlierEvidenceFiles) lines.push(`- satisfied by an earlier receipt (git.coverage any): ${filePath}`);
    for (const filePath of data.missingDocsImpact) lines.push(`- missing docs impact: ${filePath}`);
    return lines.join("\n");
  },
});
