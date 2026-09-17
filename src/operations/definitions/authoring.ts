import { z } from "zod";
import { LedgerError } from "../../machine.js";
import { migrateChangelog, type ChangelogMigrationResult } from "../../migrate.js";
import {
  createBacklogItem,
  createDecision,
  promoteRecord,
  readReleaseNotes,
  type PromoteResult,
  type ReleaseNotes,
} from "../../authoring.js";
import { createChangeEntryDetailed, createProductNoteEntry, type LedgerSymbolExtractorReport } from "../../newEntry.js";
import {
  applyRelease,
  buildReleaseDocument,
  getUnreleasedChanges,
  type ApplyReleaseResult,
  type LedgerReleaseDocument,
} from "../../release.js";
import { typeScriptFallbackAdvice } from "../../symbols.js";
import type { NormalizedLedgerDocument } from "../../types.js";
import { validateDocuments, writeValidationReport } from "../../validate.js";
import { loadDocuments, looseRecord, plural, quoteForConfirmation, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

export interface NewEntryInput extends Record<string, unknown> {
  readonly title: string;
  readonly fromDiff?: boolean;
  readonly staged?: boolean;
  readonly areas?: readonly string[];
  readonly status: string;
}

export interface CreatedRecord {
  readonly path: string;
}

export interface CreatedEntry extends CreatedRecord {
  readonly symbolExtractors?: LedgerSymbolExtractorReport;
}

const createdRecordOutput = looseRecord({ path: z.string() });

export const newEntryOperation = defineOperation<NewEntryInput, CreatedEntry>({
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
  output: looseRecord({
    path: z.string(),
    symbolExtractors: looseRecord({ counts: looseRecord({}), fallbackReason: z.string().optional() }).optional(),
  }),
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
  mcp: {
    tool: "ledger_new",
    title: "Create a change entry",
    summary: (data) => ({ path: data.path }),
    confirm: (input) =>
      `Create a ${input.status} change entry titled ${quoteForConfirmation(input.title)}${
        input.fromDiff ? ` with files from the ${input.staged ? "staged" : "uncommitted"} Git changes` : ""
      }.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const draft = await createChangeEntryDetailed(workspace, documents, {
      title: input.title,
      fromDiff: Boolean(input.fromDiff),
      staged: Boolean(input.staged),
      areas: input.areas ?? [],
      status: input.status,
    });
    return { data: { path: draft.path, symbolExtractors: draft.symbolExtractors } };
  },
  format(data) {
    const lines = [`Created ${data.path}`];
    const counts = Object.entries(data.symbolExtractors?.counts ?? {}).filter(([, count]) => (count ?? 0) > 0);
    if (counts.length > 0) {
      lines.push(`Symbols: ${counts.map(([name, count]) => `${name} ${count} file(s)`).join(", ")}`);
    }
    if (data.symbolExtractors?.fallbackReason) {
      lines.push(`Regex fallback: ${typeScriptFallbackAdvice(data.symbolExtractors.fallbackReason)}.`);
    }
    return lines.join("\n");
  },
});

export interface FeedbackInput extends Record<string, unknown> {
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
  mcp: {
    tool: "ledger_feedback",
    title: "Create a product note",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a product note titled ${quoteForConfirmation(input.title)}.`,
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

export interface UnreleasedOutput {
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

export interface ReleaseInput extends Record<string, unknown> {
  readonly version: string;
  readonly includeUnreleased?: boolean;
  readonly assign?: boolean;
  readonly status: "planned" | "released";
  readonly date?: string;
  readonly write?: boolean;
  readonly update?: boolean;
}

export interface ReleaseOutput extends LedgerReleaseDocument, ApplyReleaseResult {}

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
    update: z.boolean().optional().describe("Add selected entries missing from the existing release record."),
  }),
  output: looseRecord({
    version: z.string(),
    status: z.string(),
    entries: z.array(looseRecord({ id: z.string() })),
    markdown: z.string(),
    assignment: looseRecord({ version: z.string(), updatedEntries: z.array(z.string()) }).optional(),
    writtenPath: z.string().optional(),
    updated: looseRecord({ path: z.string(), addedEntries: z.array(z.string()) }).optional(),
  }),
  cli: {
    path: ["release"],
    usage:
      "ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write | --update] [--json]",
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
      update: { type: "boolean", description: "Add selected entries missing from the existing release record." },
    },
    json: true,
    help: `Renders a valid Ledger release record. status is planned or released.
--assign writes the selected release version back to the selected entries,
with or without --write; leave it off to preview.
--write creates .ledger/releases/<version>.md and refuses an existing record.
--update adds the selected entries that an existing record does not list to its
entries and Changes, and leaves its summary, public notes, verification, and
known issues for you to edit. For a receipt that landed after the record was
written: ledger release <version> --include-unreleased --assign --update.`,
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
      update: Boolean(input.update),
    });
    return { data: { ...release, ...applied } };
  },
  format(data) {
    const lines: string[] = [];
    if (data.assignment) {
      const count = data.assignment.updatedEntries.length;
      lines.push(`Assigned ${count} ${plural(count, "entry", "entries")} to ${data.version}.`);
    }
    if (data.updated) {
      const added = data.updated.addedEntries;
      lines.push(
        added.length > 0
          ? `Added ${added.join(", ")} to ${data.updated.path}; write their public notes by hand.`
          : `${data.updated.path} already lists every selected entry.`,
      );
      return lines.join("\n");
    }
    lines.push(data.writtenPath ? `Wrote ${data.writtenPath}` : data.markdown);
    return lines.join("\n");
  },
});

export interface NewRecordInput extends Record<string, unknown> {
  readonly title: string;
  readonly areas?: readonly string[];
  readonly decisions?: readonly string[];
  readonly related?: readonly string[];
  readonly docs?: readonly string[];
  readonly status: string;
}

export const backlogNewOperation = defineOperation<NewRecordInput, CreatedRecord>({
  name: "backlog.new",
  title: "Create a backlog item",
  description: "Create the next numbered backlog item from the template.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    title: z.string().min(1).max(500).describe("Backlog item title."),
    areas: z.array(shortString).optional().describe("Area tags."),
    decisions: z.array(shortString).optional().describe("Decision ids the item depends on."),
    related: z.array(shortString).optional().describe("Related record ids."),
    docs: z.array(shortString).optional().describe("Durable docs the item relates to."),
    status: shortString.default("proposed").describe("Item status."),
  }),
  output: createdRecordOutput,
  cli: {
    path: ["backlog", "new"],
    usage:
      "ledger backlog new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      decision: { type: "string[]", field: "decisions", description: "Decision id (repeatable)." },
      related: { type: "string[]", description: "Related record id (repeatable)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc path (repeatable)." },
      status: { type: "string", description: "Item status." },
    },
    json: true,
    help: `Creates the next numbered backlog item under the configured backlog directory
from .ledger/templates/backlog.md. Promote it later with ledger promote <id>.`,
  },
  mcp: {
    tool: "ledger_backlog_new",
    title: "Create a backlog item",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a backlog item titled ${quoteForConfirmation(input.title)}.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createBacklogItem(workspace, documents, {
      title: input.title,
      areas: input.areas ?? [],
      decisions: input.decisions,
      related: input.related,
      docs: input.docs,
      status: input.status,
    });
    return { data: { path } };
  },
  format(data) {
    return `Created ${data.path}`;
  },
});

export const decisionNewOperation = defineOperation<NewRecordInput, CreatedRecord>({
  name: "decision.new",
  title: "Create a decision record",
  description: "Create the next numbered decision record from the template.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    title: z.string().min(1).max(500).describe("Decision title."),
    areas: z.array(shortString).optional().describe("Area tags."),
    decisions: z.array(shortString).optional().describe("Decision ids this decision builds on."),
    related: z.array(shortString).optional().describe("Related record ids."),
    docs: z.array(shortString).optional().describe("Durable docs the decision affects."),
    status: shortString.default("proposed").describe("Decision status."),
  }),
  output: createdRecordOutput,
  cli: {
    path: ["decision", "new"],
    usage:
      "ledger decision new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      decision: { type: "string[]", field: "decisions", description: "Prior decision id (repeatable)." },
      related: { type: "string[]", description: "Related record id (repeatable)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc path (repeatable)." },
      status: { type: "string", description: "Decision status." },
    },
    json: true,
    help: `Creates the next numbered decision record under the configured decisions
directory from .ledger/templates/decision.md.`,
  },
  mcp: {
    tool: "ledger_decision_new",
    title: "Create a decision record",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a decision record titled ${quoteForConfirmation(input.title)}.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createDecision(workspace, documents, {
      title: input.title,
      areas: input.areas ?? [],
      decisions: input.decisions,
      related: input.related,
      docs: input.docs,
      status: input.status,
    });
    return { data: { path } };
  },
  format(data) {
    return `Created ${data.path}`;
  },
});

export interface PromoteInput extends Record<string, unknown> {
  readonly id: string;
  readonly title?: string;
  readonly areas?: readonly string[];
  readonly fromDiff?: boolean;
  readonly staged?: boolean;
  readonly status: string;
  readonly sourceStatus?: string;
}

export const promoteOperation = defineOperation<PromoteInput, PromoteResult>({
  name: "promote",
  title: "Promote a backlog item",
  description: "Create a linked draft change entry from a backlog item and update the item in one transaction.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    id: shortString.describe("Backlog item id, for example B007."),
    title: z.string().min(1).max(500).optional().describe("Entry title. Defaults to the item title."),
    areas: z.array(shortString).optional().describe("Area tags. Defaults to the item areas."),
    fromDiff: z.boolean().optional().describe("Prefill files from Git changes."),
    staged: z.boolean().optional().describe("Read the staged diff."),
    status: shortString.default("draft").describe("Entry status."),
    sourceStatus: shortString.optional().describe("Status written to the promoted item. Defaults to in-progress."),
  }),
  output: looseRecord({
    source: looseRecord({ id: z.string(), kind: z.string(), path: z.string(), status: z.string() }),
    entry: looseRecord({ id: z.string(), path: z.string() }),
    carriedChecks: z.array(z.string()),
  }),
  cli: {
    path: ["promote"],
    usage:
      "ledger promote <id> [--title <title>] [--area <area>] [--from-diff] [--staged] [--status <status>] [--source-status <status>] [--json]",
    positionals: { field: "id", min: 1, max: 1 },
    flags: {
      title: { type: "string", description: "Entry title." },
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      "from-diff": { type: "boolean", description: "Prefill files from Git changes." },
      staged: { type: "boolean", description: "Read the staged diff." },
      status: { type: "string", description: "Entry status." },
      "source-status": { type: "string", description: "Status written to the promoted item." },
    },
    json: true,
    help: `Creates a draft change entry linked to a backlog item through the backlog
frontmatter field. The entry carries the item's areas, decisions, and acceptance
checks (as Verification bullets). The item's status becomes in-progress unless
--source-status says otherwise. Both writes happen in one transaction.`,
  },
  mcp: {
    tool: "ledger_promote",
    title: "Promote a record",
    summary: (data) => ({ entry: data.entry.id, source: data.source.id, carriedChecks: data.carriedChecks.length }),
    confirm: (input) =>
      `Create a ${input.status} change entry from ${input.id}${
        input.title ? ` titled ${quoteForConfirmation(input.title)}` : ""
      } and update ${input.id}${input.sourceStatus ? ` to status ${input.sourceStatus}` : ""}.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await promoteRecord(workspace, documents, input.id, {
      title: input.title,
      areas: input.areas,
      fromDiff: Boolean(input.fromDiff),
      staged: Boolean(input.staged),
      status: input.status,
      sourceStatus: input.sourceStatus,
    });
    return { data: result };
  },
  format(data) {
    const checks = data.carriedChecks.length;
    return [
      `Created ${data.entry.path} from ${data.source.id} (${checks} acceptance ${plural(checks, "check", "checks")} carried).`,
      `Updated ${data.source.path} to status ${data.source.status}.`,
    ].join("\n");
  },
});

export interface ReleaseNotesInput extends Record<string, unknown> {
  readonly version: string;
}

export const releaseNotesOperation = defineOperation<ReleaseNotesInput, ReleaseNotes>({
  name: "release.notes",
  title: "Print release notes",
  description: "Print the Public Notes of a release record for changelogs and GitHub Releases.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    version: shortString.describe("Release version, for example v1.2.3."),
  }),
  output: looseRecord({
    version: z.string(),
    title: z.string(),
    date: z.string(),
    status: z.string(),
    path: z.string(),
    notes: z.string(),
  }),
  cli: {
    path: ["release", "notes"],
    usage: "ledger release notes <version> [--json]",
    positionals: { field: "version", min: 1, max: 1 },
    flags: {},
    json: true,
    help: `Prints the Public Notes section of .ledger/releases/<version>.md as Markdown.
Use it to publish GitHub Releases or changelog entries from the release record.`,
  },
  mcp: {
    tool: "ledger_release_notes",
    title: "Print release notes",
    summary: (data) => ({ version: data.version, status: data.status, hasNotes: data.notes.length > 0 }),
  },
  async run(context, input) {
    const { documents } = await loadDocuments(context);
    return { data: readReleaseNotes(documents, input.version) };
  },
  format(data) {
    return data.notes.length > 0 ? data.notes : `Release ${data.version} has no Public Notes.`;
  },
});

export interface MigrateChangelogInput extends Record<string, unknown> {
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
