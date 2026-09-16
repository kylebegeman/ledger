import { z } from "zod";
import { LedgerError } from "../../machine.js";
import { migrateChangelog, type ChangelogMigrationResult } from "../../migrate.js";
import { createChangeEntry, createProductNoteEntry } from "../../newEntry.js";
import {
  applyRelease,
  buildReleaseDocument,
  getUnreleasedChanges,
  type ApplyReleaseResult,
  type LedgerReleaseDocument,
} from "../../release.js";
import type { NormalizedLedgerDocument } from "../../types.js";
import { validateDocuments, writeValidationReport } from "../../validate.js";
import { loadDocuments, looseRecord, plural, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

interface NewEntryInput extends Record<string, unknown> {
  readonly title: string;
  readonly fromDiff?: boolean;
  readonly staged?: boolean;
  readonly areas?: readonly string[];
  readonly status: string;
}

interface CreatedRecord {
  readonly path: string;
}

const createdRecordOutput = looseRecord({ path: z.string() });

export const newEntryOperation = defineOperation<NewEntryInput, CreatedRecord>({
  name: "new",
  title: "Create a change entry",
  description: "Create the next numbered change entry from the template.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    title: z.string().min(1).max(500).describe("Entry title."),
    fromDiff: z.boolean().optional().describe("Prefill files from Git changes."),
    staged: z.boolean().optional().describe("Read the staged diff."),
    areas: z.array(shortString).optional().describe("Area tags."),
    status: shortString.default("draft").describe("Entry status."),
  }),
  output: createdRecordOutput,
  cli: {
    path: ["new"],
    usage: "ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      "from-diff": { type: "boolean", description: "Prefill files from Git changes." },
      staged: { type: "boolean", description: "Read the staged diff." },
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      status: { type: "string", description: "Entry status." },
    },
    json: true,
    help: `Creates the next numbered change entry. Use --from-diff to prefill files from
Git changes and --staged to read the staged diff. Ignored generated/vendor paths
are omitted, and very large diffs are grouped into coverage patterns.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createChangeEntry(workspace, documents, {
      title: input.title,
      fromDiff: Boolean(input.fromDiff),
      staged: Boolean(input.staged),
      areas: input.areas ?? [],
      status: input.status,
    });
    return { data: { path } };
  },
  format(data) {
    return `Created ${data.path}`;
  },
});

interface FeedbackInput extends Record<string, unknown> {
  readonly title: string;
  readonly areas?: readonly string[];
  readonly tags?: readonly string[];
  readonly status: string;
}

export const feedbackOperation = defineOperation<FeedbackInput, CreatedRecord>({
  name: "feedback",
  title: "Create a product note",
  description: "Create a product-note record for dogfood findings and product observations.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    title: z.string().min(1).max(500).describe("Note title."),
    areas: z.array(shortString).optional().describe("Area tags."),
    tags: z.array(shortString).optional().describe("Tags."),
    status: shortString.default("captured").describe("Note status."),
  }),
  output: createdRecordOutput,
  cli: {
    path: ["feedback"],
    aliases: [["product-note"]],
    helpTopics: ["product-note"],
    usage: "ledger feedback <title> [--area <area>] [--tag <tag>] [--status <status>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      tag: { type: "string[]", field: "tags", description: "Tag (repeatable)." },
      status: { type: "string", description: "Note status." },
    },
    json: true,
    help: `Creates a product-note record for dogfood findings, product observations, or
other feedback that should not be mixed into normal change receipts.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createProductNoteEntry(workspace, documents, {
      title: input.title,
      areas: input.areas ?? [],
      tags: input.tags ?? [],
      status: input.status,
    });
    return { data: { path } };
  },
  format(data) {
    return `Created ${data.path}`;
  },
});

interface UnreleasedOutput {
  readonly matches: readonly NormalizedLedgerDocument[];
}

export const unreleasedOperation = defineOperation<Record<string, never>, UnreleasedOutput>({
  name: "unreleased",
  title: "List unreleased changes",
  description: "List landed or shipped change entries without a release assignment.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({}),
  output: looseRecord({ matches: z.array(looseRecord({ id: z.string(), title: z.string() })) }),
  cli: {
    path: ["unreleased"],
    usage: "ledger unreleased [--json]",
    flags: {},
    json: true,
    help: "Lists landed or shipped change entries without a release assignment.",
  },
  mcp: {
    tool: "ledger_unreleased",
    title: "List unreleased changes",
    summary: (data) => ({ count: data.matches.length }),
  },
  async run(context) {
    const { documents } = await loadDocuments(context);
    return { data: { matches: getUnreleasedChanges(documents) } };
  },
  format(data) {
    const lines = [`Ledger unreleased: ${data.matches.length} change(s).`];
    for (const document of data.matches) {
      const areas = document.areas.length > 0 ? ` [${document.areas.join(", ")}]` : "";
      lines.push(`- ${document.id} ${document.title}${areas} (${document.status})`);
    }
    return lines.join("\n");
  },
});

interface ReleaseInput extends Record<string, unknown> {
  readonly version: string;
  readonly includeUnreleased?: boolean;
  readonly assign?: boolean;
  readonly status: "planned" | "released";
  readonly date?: string;
  readonly write?: boolean;
}

interface ReleaseOutput extends LedgerReleaseDocument, ApplyReleaseResult {}

export const releaseOperation = defineOperation<ReleaseInput, ReleaseOutput>({
  name: "release",
  title: "Build a release record",
  description: "Render a Ledger release record and optionally assign entries and write the file.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    version: shortString.describe("Release version, for example v1.2.3."),
    includeUnreleased: z.boolean().optional().describe("Select currently unreleased landed entries."),
    assign: z.boolean().optional().describe("Write the release version back to selected entries."),
    status: z.enum(["planned", "released"]).default("planned"),
    date: shortString.optional().describe("Release date as yyyy-mm-dd."),
    write: z.boolean().optional().describe("Write .ledger/releases/<version>.md."),
  }),
  output: looseRecord({
    version: z.string(),
    status: z.string(),
    entries: z.array(looseRecord({ id: z.string() })),
    markdown: z.string(),
    assignment: looseRecord({ version: z.string(), updatedEntries: z.array(z.string()) }).optional(),
    writtenPath: z.string().optional(),
  }),
  cli: {
    path: ["release"],
    usage:
      "ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]",
    positionals: { field: "version", min: 1, max: 1 },
    flags: {
      "include-unreleased": { type: "boolean", description: "Select currently unreleased landed entries." },
      assign: { type: "boolean", description: "Write the release version back to selected entries." },
      status: {
        type: "string",
        description: "Release status.",
        choices: ["planned", "released"],
        choicesLabel: "release status",
      },
      date: { type: "string", description: "Release date as yyyy-mm-dd." },
      write: { type: "boolean", description: "Write .ledger/releases/<version>.md." },
    },
    json: true,
    help: `Renders a valid Ledger release record. status is planned or released.
--assign writes the selected release version back to selected entries.
--write creates .ledger/releases/<version>.md.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const validation = validateDocuments(workspace, documents);
    if (validation.errors.length > 0) {
      await writeValidationReport(workspace, validation);
      throw new LedgerError(
        "validation-failed",
        `Cannot build a release with ${validation.errors.length} validation error(s).`,
        { errors: validation.errors.length, warnings: validation.warnings.length },
      );
    }
    const release = buildReleaseDocument(documents, input.version, {
      includeUnreleased: input.includeUnreleased,
      date: input.date,
      status: input.status,
    });
    const applied = await applyRelease(workspace, documents, release, {
      assign: Boolean(input.assign),
      write: Boolean(input.write),
    });
    return { data: { ...release, ...applied } };
  },
  format(data) {
    const lines: string[] = [];
    if (data.assignment) {
      const count = data.assignment.updatedEntries.length;
      lines.push(`Assigned ${count} ${plural(count, "entry", "entries")} to ${data.version}.`);
    }
    lines.push(data.writtenPath ? `Wrote ${data.writtenPath}` : data.markdown);
    return lines.join("\n");
  },
});

interface MigrateChangelogInput extends Record<string, unknown> {
  readonly sourceDir: string;
  readonly dryRun?: boolean;
  readonly rewriteDocs?: boolean;
  readonly status?: string;
}

export const migrateChangelogOperation = defineOperation<MigrateChangelogInput, ChangelogMigrationResult>({
  name: "migrate.changelog",
  title: "Migrate a changelog",
  description: "Migrate legacy Markdown changelog records into .ledger/entries.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    sourceDir: z.string().min(1).max(4096).describe("Directory of legacy changelog records."),
    dryRun: z.boolean().optional().describe("Report without writing."),
    rewriteDocs: z.boolean().optional().describe("Rewrite docs references to new entry paths."),
    status: shortString.optional().describe("Status to assign to migrated entries."),
  }),
  output: looseRecord({
    sourceDir: z.string(),
    migrated: z.array(looseRecord({})),
    duplicates: z.array(looseRecord({})),
    rewrittenDocs: z.array(z.string()),
    receiptPath: z.string(),
  }),
  cli: {
    path: ["migrate", "changelog"],
    usage: "ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--status <status>] [--json]",
    positionals: { field: "sourceDir", min: 1, max: 1 },
    flags: {
      "dry-run": { type: "boolean", description: "Report without writing." },
      "rewrite-docs": { type: "boolean", description: "Rewrite docs references to new entry paths." },
      status: { type: "string", description: "Status to assign to migrated entries." },
    },
    json: true,
    help: `Migrates folders of legacy Markdown changelog records into .ledger/entries,
preserves IDs when possible, suggests duplicate ID suffixes, and writes a
migration receipt. --rewrite-docs updates docs references from old paths to new
Ledger entry paths.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await migrateChangelog(workspace, documents, input.sourceDir, {
      dryRun: input.dryRun,
      rewriteDocs: input.rewriteDocs,
      status: input.status,
    });
    return { data: result };
  },
  format(data) {
    const lines = [
      `Ledger changelog migration: ${data.migrated.length} record(s), ${data.duplicates.length} duplicate id(s), ${data.rewrittenDocs.length} docs file(s) rewritten.`,
      `Wrote ${data.receiptPath}`,
    ];
    for (const duplicate of data.duplicates.slice(0, 10)) {
      lines.push(
        `- duplicate: ${duplicate.originalId} in ${duplicate.sourcePath}; suggested ${duplicate.suggestedId}`,
      );
    }
    if (data.duplicates.length > 10) {
      lines.push(`- ${data.duplicates.length - 10} more duplicate(s) in receipt.`);
    }
    return lines.join("\n");
  },
});
