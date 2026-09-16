import { z } from "zod";
import { buildIndexes, writeIndexes } from "../../indexer.js";
import {
  buildIntegrityReport,
  readIntegrityReport,
  verifyIntegrityReport,
  writeIntegrityArtifacts,
  type LedgerIntegrityReport,
  type LedgerIntegrityVerification,
  type WrittenIntegrityArtifacts,
} from "../../integrity.js";
import { LedgerError } from "../../machine.js";
import {
  buildStaticReaderModel,
  writeStaticReader,
  type LedgerRenderProfile,
  type RenderStaticReaderResult,
} from "../../render.js";
import type { LedgerDocsAdoption, LedgerValidationResult } from "../../types.js";
import {
  readValidationBaseline,
  validateDocuments,
  writeValidationBaseline,
  writeValidationReport,
} from "../../validate.js";
import { initWorkspace } from "../../workspace.js";
import { loadDocuments, looseRecord, validationLine, validationResultShape } from "../shared.js";
import { defineOperation } from "../types.js";
import { readEvidence } from "../../verify.js";

export interface InitInput extends Record<string, unknown> {
  readonly withDocs?: boolean;
  readonly migrate?: boolean;
  readonly managedDocs?: boolean;
}

export interface InitOutput {
  readonly projectRoot: string;
  readonly ledgerRoot: string;
  readonly withDocs: boolean;
  readonly adoption: LedgerDocsAdoption;
}

const initOutput = looseRecord({
  projectRoot: z.string(),
  ledgerRoot: z.string(),
  withDocs: z.boolean(),
  adoption: z.string(),
});

export const initOperation = defineOperation<InitInput, InitOutput>({
  name: "init",
  title: "Initialize Ledger",
  description: "Create .ledger/ and optional docs scaffolding in the current directory.",
  workspace: "none",
  mutates: true,
  input: z.strictObject({
    withDocs: z.boolean().optional(),
    migrate: z.boolean().optional(),
    managedDocs: z.boolean().optional(),
  }),
  output: initOutput,
  cli: {
    path: ["init"],
    usage: "ledger init [--with-docs] [--migrate] [--managed-docs] [--json]",
    flags: {
      "with-docs": { type: "boolean", description: "Also create the docs/ plane and routing files." },
      migrate: { type: "boolean", description: "Alias of --with-docs for migration scaffolds." },
      "managed-docs": { type: "boolean", description: "Use managed docs adoption instead of partial." },
    },
    json: true,
    help: `Creates .ledger/ in the current directory. With --with-docs or --migrate, also
creates docs routing files in partial adoption mode unless --managed-docs is set.`,
  },
  async run(context, input) {
    const adoption: LedgerDocsAdoption = input.managedDocs ? "managed" : "partial";
    const withDocs = Boolean(input.withDocs || input.migrate);
    await initWorkspace(context.cwd, { withDocs, adoption });
    return {
      data: { projectRoot: context.cwd, ledgerRoot: ".ledger", withDocs, adoption },
    };
  },
  format(data) {
    return data.withDocs
      ? `Initialized .ledger/ and docs/ in ${data.adoption} adoption mode`
      : "Initialized .ledger/";
  },
});

export const adoptOperation = defineOperation<{ managedDocs?: boolean }, InitOutput>({
  name: "adopt",
  title: "Adopt Ledger",
  description: "Initialize Ledger for an established repository with partial docs adoption.",
  workspace: "none",
  mutates: true,
  input: z.strictObject({ managedDocs: z.boolean().optional() }),
  output: initOutput,
  cli: {
    path: ["adopt"],
    usage: "ledger adopt [--managed-docs] [--json]",
    flags: {
      "managed-docs": { type: "boolean", description: "Use managed docs adoption instead of partial." },
    },
    json: true,
    help: `Initializes Ledger for an established repo. By default this uses partial docs
adoption, updating routing docs and impact reports without owning all docs.`,
  },
  async run(context, input) {
    const adoption: LedgerDocsAdoption = input.managedDocs ? "managed" : "partial";
    await initWorkspace(context.cwd, { withDocs: true, adoption });
    return { data: { projectRoot: context.cwd, ledgerRoot: ".ledger", withDocs: true, adoption } };
  },
  format(data) {
    return `Initialized Ledger adoption scaffold in ${data.adoption} docs mode.`;
  },
});

export interface ValidateInput extends Record<string, unknown> {
  readonly currentOnly?: boolean;
  readonly updateBaseline?: boolean;
  readonly noBaseline?: boolean;
  readonly writeReport?: boolean;
}

export interface ValidateOutput extends LedgerValidationResult {
  readonly projectRoot: string;
  readonly issueCount: number;
  readonly baselinePath?: string;
}

export const validateOperation = defineOperation<ValidateInput, ValidateOutput>({
  name: "validate",
  title: "Validate Ledger records",
  description: "Validate Ledger source records and return errors and warnings.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    currentOnly: z.boolean().optional().describe("Skip historical records."),
    updateBaseline: z.boolean().optional().describe("Record current warnings in the validation baseline."),
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/latest-validation.md."),
  }),
  output: looseRecord({
    projectRoot: z.string(),
    issueCount: z.number(),
    ...validationResultShape,
    baselinePath: z.string().optional(),
  }),
  cli: {
    path: ["validate"],
    usage: "ledger validate [--current-only] [--update-baseline] [--no-baseline] [--json]",
    flags: {
      "current-only": { type: "boolean", description: "Skip historical records." },
      "update-baseline": { type: "boolean", description: "Record current warnings in the validation baseline." },
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
    },
    json: true,
    defaults: { writeReport: true },
    help: `Validates Ledger source records and writes .ledger/reports/latest-validation.md.
--current-only skips historical records. --update-baseline records current
warnings in the configured validation baseline.`,
  },
  mcp: {
    tool: "ledger_validate",
    title: "Validate Ledger records",
    input: z.strictObject({
      writeReport: z.boolean().optional().describe("Write .ledger/reports/latest-validation.md."),
    }),
    summary: (data) => ({
      ok: data.errors.length === 0,
      projectRoot: data.projectRoot,
      issueCount: data.issueCount,
      errorCount: data.errors.length,
      warningCount: data.warnings.length,
    }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const baseline =
      input.updateBaseline || input.noBaseline ? undefined : await readValidationBaseline(workspace);
    const result = validateDocuments(workspace, documents, {
      currentOnly: input.currentOnly,
      baseline,
    });
    if (input.writeReport) await writeValidationReport(workspace, result);
    let baselinePath: string | undefined;
    if (input.updateBaseline) {
      const rawResult = validateDocuments(workspace, documents, { currentOnly: input.currentOnly });
      baselinePath = await writeValidationBaseline(workspace, rawResult);
    }
    return {
      data: {
        projectRoot: workspace.projectRoot,
        issueCount: result.issues.length,
        ...result,
        baselinePath,
      },
      exitCode: result.errors.length === 0 ? 0 : 1,
    };
  },
  format(data) {
    const lines: string[] = [];
    if (data.baselinePath) lines.push(`Updated validation baseline at ${data.baselinePath}.`);
    lines.push(validationLine(data.errors.length, data.warnings.length));
    if (data.suppressed.length > 0) {
      lines.push(`Suppressed ${data.suppressed.length} warning(s) from baseline.`);
    }
    return lines.join("\n");
  },
});

export interface IndexOutput {
  readonly documents: number;
  readonly outputDir: string;
  readonly written: boolean;
  readonly validation: { readonly errors: number; readonly warnings: number };
}

export const indexOperation = defineOperation<Record<string, never>, IndexOutput>({
  name: "index",
  title: "Write Ledger indexes",
  description: "Validate records and write JSON indexes under .ledger/indexes.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: looseRecord({
    documents: z.number(),
    outputDir: z.string(),
    written: z.boolean(),
    validation: z.object({ errors: z.number(), warnings: z.number() }),
  }),
  cli: {
    path: ["index"],
    usage: "ledger index [--json]",
    flags: {},
    json: true,
    help: "Validates records and writes JSON indexes under .ledger/indexes.",
  },
  async run(context) {
    const { workspace, documents } = await loadDocuments(context);
    const result = validateDocuments(workspace, documents);
    const validation = { errors: result.errors.length, warnings: result.warnings.length };
    const outputDir = workspace.config.indexes.output;
    if (result.errors.length > 0) {
      await writeValidationReport(workspace, result);
      return {
        data: { documents: documents.length, outputDir, written: false, validation },
        exitCode: 1,
      };
    }
    await writeIndexes(workspace, buildIndexes(workspace, documents));
    return { data: { documents: documents.length, outputDir, written: true, validation } };
  },
  format(data) {
    return data.written
      ? `Indexed ${data.documents} Ledger documents.`
      : validationLine(data.validation.errors, data.validation.warnings);
  },
});

export interface IntegrityInput extends Record<string, unknown> {
  readonly check?: boolean;
  readonly writeArtifacts?: boolean;
}

export interface IntegrityOutput extends LedgerIntegrityReport {
  readonly verification?: LedgerIntegrityVerification;
  readonly written?: WrittenIntegrityArtifacts;
}

export const verifyIntegrityOperation = defineOperation<IntegrityInput, IntegrityOutput>({
  name: "verify-integrity",
  title: "Verify Ledger integrity",
  description: "Return source record hashes and a deterministic catalog hash.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    check: z.boolean().optional().describe("Compare current records with the existing integrity baseline without replacing it."),
    writeArtifacts: z.boolean().optional().describe("Write .ledger/indexes/integrity.json and .ledger/reports/integrity.md."),
  }),
  output: looseRecord({
    catalogHash: z.string(),
    documents: z.array(looseRecord({ hash: z.string() })),
    verification: looseRecord({ ok: z.boolean() }).optional(),
    written: looseRecord({}).optional(),
  }),
  cli: {
    path: ["verify-integrity"],
    usage: "ledger verify-integrity [--check] [--json]",
    flags: {
      check: { type: "boolean", description: "Compare with the existing baseline without replacing it." },
    },
    json: true,
    prepare: (input) => ({ ...input, writeArtifacts: input.writeArtifacts ?? !input.check }),
    help: `Writes source record hashes to .ledger/indexes/integrity.json and a readable
report to .ledger/reports/integrity.md. --check compares current records with
the existing baseline without replacing it.`,
  },
  mcp: {
    tool: "ledger_verify_integrity",
    title: "Verify Ledger integrity",
    summary: (data) => ({
      documents: data.documents.length,
      catalogHash: data.catalogHash,
      written: data.written,
      verified: data.verification?.ok,
    }),
  },
  async run(context, input) {
    if (input.check && input.writeArtifacts) {
      throw new LedgerError(
        "invalid-argument",
        "Integrity check cannot replace the baseline in the same operation.",
      );
    }
    const { workspace, documents } = await loadDocuments(context);
    const expected = input.check ? await readIntegrityReport(workspace) : undefined;
    const report = buildIntegrityReport(workspace, documents);
    const written = input.writeArtifacts ? await writeIntegrityArtifacts(workspace, report) : undefined;
    const verification = expected ? verifyIntegrityReport(expected, report) : undefined;
    return {
      data: { ...report, verification, written },
      exitCode: verification?.ok === false ? 1 : 0,
    };
  },
  format(data) {
    const lines: string[] = [];
    if (data.verification) {
      const verification = data.verification;
      if (verification.expectedProject !== verification.currentProject) {
        lines.push(
          `Ledger integrity project mismatch: expected ${verification.expectedProject}, current ${verification.currentProject}.`,
        );
      }
      lines.push(
        verification.ok
          ? `Ledger integrity verified: ${data.documents.length} document(s), catalog ${data.catalogHash}.`
          : `Ledger integrity mismatch: expected ${verification.expectedCatalogHash}, current ${verification.currentCatalogHash}.`,
      );
      for (const filePath of verification.added) lines.push(`- added: ${filePath}`);
      for (const filePath of verification.removed) lines.push(`- removed: ${filePath}`);
      for (const filePath of verification.changed) lines.push(`- changed: ${filePath}`);
      return lines.join("\n");
    }
    lines.push(`Ledger integrity: ${data.documents.length} document(s), catalog ${data.catalogHash}.`);
    if (data.written) lines.push(`Wrote ${data.written.indexPath} and ${data.written.reportPath}.`);
    return lines.join("\n");
  },
});

export const renderProfileSchema = z.enum(["internal", "public"]);

export const renderOperation = defineOperation<{ profile: LedgerRenderProfile }, RenderStaticReaderResult>({
  name: "render",
  title: "Render the static reader",
  description: "Build the offline static reader plus search and graph JSON artifacts.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    profile: renderProfileSchema.default("internal").describe("Reader profile to render."),
  }),
  output: looseRecord({
    profile: z.string(),
    outputPath: z.string(),
    documents: z.number(),
    totalBytes: z.number(),
    writeMs: z.number(),
    budget: looseRecord({ ok: z.boolean() }),
  }),
  cli: {
    path: ["render"],
    usage: "ledger render [--profile <internal|public>] [--json]",
    flags: {
      profile: {
        type: "string",
        description: "Reader profile to render.",
        choices: ["internal", "public"],
        choicesLabel: "render profile",
      },
    },
    json: true,
    help: `Builds the offline static reader at .ledger/dist/index.html plus lazy search
and relationship graph JSON artifacts. The public profile writes to
.ledger/dist/public and includes only explicit public notes from released releases.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = validateDocuments(workspace, documents);
    if (result.errors.length > 0) {
      await writeValidationReport(workspace, result);
      throw new LedgerError(
        "render-validation-failed",
        `Cannot render reader with ${result.errors.length} validation error(s).`,
        { errors: result.errors.length, warnings: result.warnings.length },
      );
    }
    const model = buildStaticReaderModel(workspace, documents, {
      evidence: await readEvidence(workspace),
      validation: result,
      profile: input.profile,
    });
    const rendered = await writeStaticReader(workspace, model);
    return { data: rendered };
  },
  format(data) {
    return [
      `Rendered ${data.documents} Ledger document(s) to ${data.outputPath}.`,
      `Wrote ${data.searchIndexPath} and ${data.graphPath}.`,
      `Render budget: ${data.budget.ok ? "pass" : "warn"} (${data.totalBytes}/${data.budget.maxTotalBytes} bytes, ${data.writeMs}/${data.budget.maxWriteMs}ms).`,
    ].join("\n");
  },
});
