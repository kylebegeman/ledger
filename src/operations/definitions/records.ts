import path from "node:path";
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
import type {
  LedgerCoverageMode,
  LedgerDocsAdoption,
  LedgerValidationResult,
} from "../../types.js";
import {
  readValidationBaseline,
  validateDocuments,
  writeValidationBaseline,
  writeValidationReport,
} from "../../validate.js";
import { inspectToolchain } from "../../toolchain.js";
import {
  initWorkspace,
  pathExists,
  type LedgerDocsRoutingPaths,
  type LedgerGitignoreBlockResult,
} from "../../workspace.js";
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
  /** The docs.routing pair in effect: chosen for a new config, or read from the existing one. */
  readonly routing: LedgerDocsRoutingPaths;
  /** True when docs/llm already held a routing file Ledger did not generate. */
  readonly routingFilesDetected: boolean;
  /** False when .ledger/config.yaml already existed and was left untouched. */
  readonly configWritten: boolean;
  /** The marked Ledger block in .gitignore. */
  readonly gitignore: LedgerGitignoreBlockResult;
  /** git.coverage adopt wrote to a new config; present only when configWritten is true. */
  readonly coverage?: LedgerCoverageMode;
  /** git.requireEntryFor inferred from the tracked tree and written; only when configWritten. */
  readonly coverageRoots?: readonly string[];
  /** git.ignore inferred from the tracked tree and written; only when configWritten. */
  readonly ignore?: readonly string[];
  /** Toolchains detected in the tracked tree; only when configWritten. */
  readonly toolchains?: readonly string[];
}

const initOutput = looseRecord({
  projectRoot: z.string(),
  ledgerRoot: z.string(),
  withDocs: z.boolean(),
  adoption: z.string(),
  routing: looseRecord({ startHere: z.string(), manifest: z.string() }),
  routingFilesDetected: z.boolean(),
  configWritten: z.boolean(),
  gitignore: looseRecord({ path: z.string(), changed: z.boolean(), created: z.boolean() }),
  coverage: z.enum(["current", "any"]).optional(),
  coverageRoots: z.array(z.string()).optional(),
  ignore: z.array(z.string()).optional(),
  toolchains: z.array(z.string()).optional(),
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
    help: `Creates .ledger/ in the current directory and adds a marked Ledger block to
.gitignore for derived state. With --with-docs or --migrate, also creates docs
routing files in partial adoption mode unless --managed-docs is set.`,
  },
  async run(context, input) {
    const adoption: LedgerDocsAdoption = input.managedDocs ? "managed" : "partial";
    const withDocs = Boolean(input.withDocs || input.migrate);
    const result = await initWorkspace(context.cwd, { withDocs, adoption });
    return {
      data: { projectRoot: context.cwd, ledgerRoot: ".ledger", withDocs, adoption, ...result },
    };
  },
  format(data) {
    return data.withDocs
      ? `Initialized .ledger/ and docs/ in ${data.adoption} adoption mode`
      : "Initialized .ledger/";
  },
});

export interface AdoptInput extends Record<string, unknown> {
  readonly managedDocs?: boolean;
}

export const adoptOperation = defineOperation<AdoptInput, InitOutput>({
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
    help: `Initializes Ledger for an established repo. It inspects the tracked tree to
infer coverage roots, generated-code ignores, and a verification allowlist, sets
git.coverage to any, and adds a marked Ledger block to .gitignore. An existing
docs tree is left alone apart from docs/llm routing files. By default this uses
partial docs adoption, updating routing docs and impact reports without owning
all docs. Existing docs/llm routing files are never replaced: when one exists
that Ledger did not generate, docs.routing points at derived files under
.ledger/ instead.`,
  },
  async run(context, input) {
    const adoption: LedgerDocsAdoption = input.managedDocs ? "managed" : "partial";
    // Inference only feeds a new config; an existing one is left alone, so skip inspecting the tree.
    const detection = (await pathExists(path.join(context.cwd, ".ledger", "config.yaml")))
      ? undefined
      : await inspectToolchain(context.cwd);
    const coverage: LedgerCoverageMode = "any";
    const result = await initWorkspace(context.cwd, {
      withDocs: true,
      adoption,
      coverage,
      ...(detection ? { detection } : {}),
    });
    const base = { projectRoot: context.cwd, ledgerRoot: ".ledger", withDocs: true, adoption, ...result };
    if (!result.configWritten || !detection) return { data: base };
    return {
      data: {
        ...base,
        coverage,
        coverageRoots: detection.coverageRoots,
        ignore: detection.ignore,
        toolchains: detection.toolchains,
      },
    };
  },
  format(data) {
    const lines = [`Initialized Ledger adoption scaffold in ${data.adoption} docs mode.`];
    const routing = `${data.routing.startHere} and ${data.routing.manifest}`;
    if (!data.configWritten) {
      lines.push(`.ledger/config.yaml already existed and was left alone; docs.routing stays at ${routing}.`);
    } else {
      lines.push(`coverage: ${data.coverage ?? "current"}`);
      lines.push(`coverage roots: ${formatList(data.coverageRoots)}`);
      lines.push(`toolchains: ${formatList(data.toolchains, "none detected")}`);
    }
    lines.push(
      data.gitignore.created
        ? ".gitignore: created with the Ledger block"
        : data.gitignore.changed
          ? ".gitignore: updated with the Ledger block"
          : ".gitignore: Ledger block already current",
    );
    if (data.configWritten && data.routingFilesDetected) {
      lines.push(`Existing docs/llm routing files were left alone; docs.routing points at ${routing}.`);
    }
    if (data.configWritten) {
      lines.push(
        "Review verification.allow in .ledger/config.yaml and prune any command agents should not run.",
      );
    }
    return lines.join("\n");
  },
});

function formatList(values: readonly string[] | undefined, empty = "none"): string {
  return values && values.length > 0 ? values.join(", ") : empty;
}

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

export const renderOperation = defineOperation<{ profile: LedgerRenderProfile; siteUrl?: string }, RenderStaticReaderResult>({
  name: "render",
  title: "Render the static reader",
  description: "Build the offline static reader plus search and graph JSON artifacts.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    profile: renderProfileSchema.default("internal").describe("Reader profile to render."),
    siteUrl: z
      .string()
      .optional()
      .describe("Absolute URL the reader is served from, for the canonical link and the public feed's links."),
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
    usage: "ledger render [--profile <internal|public>] [--site-url <url>] [--json]",
    flags: {
      profile: {
        type: "string",
        description: "Reader profile to render.",
        choices: ["internal", "public"],
        choicesLabel: "render profile",
      },
      "site-url": { type: "string", description: "Absolute URL the reader is served from." },
    },
    json: true,
    help: `Builds the offline static reader at .ledger/dist/index.html plus lazy search
and relationship graph JSON artifacts. The public profile writes to
.ledger/dist/public and includes only explicit public notes from released
releases, with an Atom feed at feed.xml and a permalink for each release.

--site-url names where the rendered page will be served, such as
https://example.github.io/project/. It makes the canonical link, the Open
Graph URL, and the feed's links absolute. Without it the feed still carries
every release's notes.`,
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
      siteUrl: input.siteUrl,
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
