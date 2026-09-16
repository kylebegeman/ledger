import { z } from "zod";
import {
  auditDocs,
  buildDocsRoutingManifest,
  classifyDocsPaths,
  writeDocsAuditReport,
  writeDocsMigrationReport,
  writeDocsRoutingFiles,
} from "../../docs.js";
import type { LedgerDocsAudit, LedgerDocsFile } from "../../types.js";
import { loadDocuments, looseRecord, pathString } from "../shared.js";
import { defineOperation, type LedgerOperationContext } from "../types.js";

export interface DocsAuditOutput extends LedgerDocsAudit {
  readonly reportPath: string;
}

const docsAuditOutput = looseRecord({
  docsRoot: z.string(),
  adoption: z.string(),
  files: z.array(looseRecord({ path: z.string(), classification: z.string() })),
  missingReferences: z.array(z.string()),
  unreferencedDocs: z.array(z.string()),
  scratchDocs: z.array(z.string()),
  generatedDocs: z.array(z.string()),
  unknownDocs: z.array(z.string()),
  reportPath: z.string(),
});

async function runDocsAudit(context: LedgerOperationContext): Promise<DocsAuditOutput> {
  const { workspace, documents } = await loadDocuments(context);
  const audit = await auditDocs(workspace, documents);
  const reportPath = await writeDocsAuditReport(workspace, audit);
  return { ...audit, reportPath: typeof reportPath === "string" ? reportPath : `${workspace.config.reports.output}/docs-audit.md` };
}

function formatDocsAudit(data: DocsAuditOutput): string {
  const lines = [
    `Ledger docs audit: ${data.files.length} file(s), ${data.missingReferences.length} missing reference(s), ${data.unreferencedDocs.length} unreferenced durable doc(s).`,
  ];
  for (const filePath of data.missingReferences) lines.push(`- missing: ${filePath}`);
  return lines.join("\n");
}

export const docsAuditOperation = defineOperation<Record<string, never>, DocsAuditOutput>({
  name: "docs.audit",
  title: "Audit docs references",
  description: "Classify the docs root and report Ledger-to-doc references.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: docsAuditOutput,
  cli: {
    path: ["docs", "audit"],
    usage: "ledger docs audit [--json]",
    flags: {},
    json: true,
    help: "Audits docs references and writes .ledger/reports/docs-audit.md.",
  },
  mcp: {
    tool: "ledger_docs_audit",
    title: "Audit docs references",
    summary: (data) => ({
      files: data.files.length,
      missingReferences: data.missingReferences.length,
      unreferencedDocs: data.unreferencedDocs.length,
    }),
  },
  async run(context) {
    return { data: await runDocsAudit(context) };
  },
  format: formatDocsAudit,
});

export const docsCheckOperation = defineOperation<Record<string, never>, DocsAuditOutput>({
  name: "docs.check",
  title: "Check docs references",
  description: "Audit docs references and fail when Ledger references docs that do not exist.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: docsAuditOutput,
  cli: {
    path: ["docs", "check"],
    usage: "ledger docs check [--json]",
    flags: {},
    json: true,
    help: "Audits docs references and exits non-zero for missing Ledger-referenced docs.",
  },
  async run(context) {
    const data = await runDocsAudit(context);
    return { data, exitCode: data.missingReferences.length > 0 ? 1 : 0 };
  },
  format: formatDocsAudit,
});

export interface DocsClassifyInput extends Record<string, unknown> {
  readonly paths?: readonly string[];
}

export interface DocsClassifyOutput {
  readonly files: readonly LedgerDocsFile[];
}

export const docsClassifyOperation = defineOperation<DocsClassifyInput, DocsClassifyOutput>({
  name: "docs.classify",
  title: "Classify docs paths",
  description: "Classify docs paths as durable, routing, scratch, generated, or unknown.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    paths: z.array(pathString).max(10_000).optional().describe("Docs paths to classify. Classifies the docs root when omitted."),
  }),
  output: looseRecord({
    files: z.array(looseRecord({ path: z.string(), classification: z.string() })),
  }),
  cli: {
    path: ["docs", "classify"],
    usage: "ledger docs classify [path...] [--json]",
    positionals: { field: "paths", min: 0 },
    flags: {},
    json: true,
    help: "Classifies docs paths as durable, routing, scratch, generated, or unknown.",
  },
  mcp: {
    tool: "ledger_docs_classify",
    title: "Classify docs paths",
    summary: (data) => ({ files: data.files.length }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const targets = input.paths ?? [];
    const files =
      targets.length > 0
        ? classifyDocsPaths(targets, workspace.config.docs.root)
        : (await auditDocs(workspace, documents)).files;
    return { data: { files } };
  },
  format(data) {
    const lines = [`Ledger docs classify: ${data.files.length} file(s).`];
    for (const file of data.files) lines.push(`- ${file.classification}: ${file.path}`);
    return lines.join("\n");
  },
});

export interface DocsReconcileOutput {
  readonly routes: number;
  readonly manifestPath: string;
  readonly startHerePath: string;
}

export const docsReconcileOperation = defineOperation<Record<string, never>, DocsReconcileOutput>({
  name: "docs.reconcile",
  title: "Reconcile docs routing",
  description: "Regenerate the docs routing manifest and START_HERE file from the docs audit.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: looseRecord({ routes: z.number(), manifestPath: z.string(), startHerePath: z.string() }),
  cli: {
    path: ["docs", "reconcile"],
    usage: "ledger docs reconcile [--json]",
    flags: {},
    json: true,
    help: `Writes the configured docs routing manifest and START_HERE file from the current
docs audit.`,
  },
  async run(context) {
    const { workspace, documents } = await loadDocuments(context);
    const audit = await auditDocs(workspace, documents);
    await writeDocsAuditReport(workspace, audit);
    const manifest = buildDocsRoutingManifest(audit);
    const { manifestPath, startHerePath } = await writeDocsRoutingFiles(workspace, audit, manifest);
    return { data: { routes: manifest.routes.length, manifestPath, startHerePath } };
  },
  format(data) {
    return `Ledger docs reconcile: wrote ${data.routes} route(s) to ${data.manifestPath} and ${data.startHerePath}.`;
  },
});

export interface DocsMigrateOutput extends LedgerDocsAudit {
  readonly reportPath: string;
}

export const docsMigrateOperation = defineOperation<Record<string, never>, DocsMigrateOutput>({
  name: "docs.migrate",
  title: "Write docs migration report",
  description: "Write cleanup and organization guidance for the docs root.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: docsAuditOutput,
  cli: {
    path: ["docs", "migrate"],
    usage: "ledger docs migrate [--json]",
    flags: {},
    json: true,
    help: `Writes .ledger/reports/docs-migration.md with docs cleanup and organization
guidance from the current docs audit.`,
  },
  async run(context) {
    const { workspace, documents } = await loadDocuments(context);
    const audit = await auditDocs(workspace, documents);
    await writeDocsAuditReport(workspace, audit);
    const reportPath = await writeDocsMigrationReport(workspace, audit);
    return { data: { ...audit, reportPath } };
  },
  format(data) {
    return `Ledger docs migrate: wrote ${data.reportPath} with ${data.scratchDocs.length} scratch, ${data.generatedDocs.length} generated, ${data.unknownDocs.length} unknown, and ${data.unreferencedDocs.length} unreferenced durable doc(s).`;
  },
});
