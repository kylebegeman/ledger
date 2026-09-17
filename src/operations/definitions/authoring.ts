import { z } from "zod";
import { LedgerError } from "../../machine.js";
import { migrateChangelog, type ChangelogMigrationResult } from "../../migrate.js";
import {
  createBacklogItem,
  createDecision,
  promoteRecord,
  readReleaseNotes,
  recordListFields,
  updateRecord,
  type LedgerRecordListField,
  type PromoteResult,
  type ReleaseNotes,
  type UpdateRecordResult,
} from "../../authoring.js";
import {
  createChangeEntryDetailed,
  createProductNoteEntry,
  draftChangeEntry,
  type CreateEntryOptions,
  type LedgerDocsImpactInput,
  type LedgerSymbolExtractorReport,
} from "../../newEntry.js";
import type { LedgerSectionBodies } from "../../sections.js";
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
import {
  describeSections,
  docsImpactFlags,
  docsImpactInput,
  loadDocuments,
  looseRecord,
  pathString,
  plural,
  prepareRecordFlags,
  quoteForConfirmation,
  sectionFlags,
  sectionsInput,
  shortString,
} from "../shared.js";
import { defineOperation } from "../types.js";

export interface NewEntryInput extends Record<string, unknown> {
  readonly title: string;
  readonly fromDiff?: boolean;
  readonly staged?: boolean;
  readonly areas?: readonly string[];
  readonly status: string;
  readonly files?: readonly string[];
  readonly docs?: readonly string[];
  readonly symbols?: readonly string[];
  readonly related?: readonly string[];
  readonly decisions?: readonly string[];
  readonly backlog?: readonly string[];
  readonly docsImpact?: LedgerDocsImpactInput;
  readonly sections?: LedgerSectionBodies;
}

function changeEntryOptions(input: NewEntryInput): CreateEntryOptions {
  return {
    title: input.title,
    fromDiff: Boolean(input.fromDiff),
    staged: Boolean(input.staged),
    areas: input.areas ?? [],
    status: input.status,
    files: input.files,
    docs: input.docs,
    symbols: input.symbols,
    related: input.related,
    decisions: input.decisions,
    backlog: input.backlog,
    docsImpact: input.docsImpact,
    sections: input.sections,
  };
}

const relationListInputs = {
  related: z.array(shortString).max(200).optional().describe("Related record ids."),
  decisions: z.array(shortString).max(200).optional().describe("Decision ids."),
  backlog: z.array(shortString).max(200).optional().describe("Backlog item ids."),
};

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
    files: z.array(pathString).max(2000).optional().describe("Paths or coverage patterns the entry covers, added to any from the diff."),
    docs: z.array(pathString).max(200).optional().describe("Durable docs the entry references."),
    symbols: z.array(shortString).max(500).optional().describe("Symbols to anchor, added to any read from the diff."),
    ...relationListInputs,
    docsImpact: docsImpactInput,
    sections: sectionsInput,
  }),
  output: looseRecord({
    path: z.string(),
    symbolExtractors: looseRecord({ counts: looseRecord({}), fallbackReason: z.string().optional() }).optional(),
  }),
  cli: {
    path: ["new"],
    usage:
      "ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>] [--file <path>] [--doc <path>] [--symbol <name>] [--related <id>] [--decision <id>] [--backlog <id>] [--docs-impact <status> --docs-impact-reason <text> [--docs-impact-doc <path>]] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      "from-diff": { type: "boolean", description: "Prefill files from Git changes." },
      staged: { type: "boolean", description: "Read the staged diff." },
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      status: { type: "string", description: "Entry status." },
      file: { type: "string[]", field: "files", description: "Path or coverage pattern the entry covers (repeatable)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc the entry references (repeatable)." },
      symbol: { type: "string[]", field: "symbols", description: "Symbol to anchor (repeatable)." },
      related: { type: "string[]", description: "Related record id (repeatable)." },
      decision: { type: "string[]", field: "decisions", description: "Decision id (repeatable)." },
      backlog: { type: "string[]", description: "Backlog item id (repeatable)." },
      ...docsImpactFlags,
      ...sectionFlags,
    },
    json: true,
    help: `Creates the next numbered change entry. Use --from-diff to prefill files from
Git changes and --staged to read the staged diff. Ignored generated/vendor paths
are omitted, and very large diffs are grouped into coverage patterns.

--file, --doc, --symbol, --related, --decision, and --backlog add to the
frontmatter, and --docs-impact with --docs-impact-reason declares docs impact.
--section Heading=text replaces one section of the template, and
--sections-file reads every "## Heading" block of a Markdown file. With those,
one command writes a finished receipt; check it with ledger ready.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_new",
    title: "Create a change entry",
    summary: (data) => ({ path: data.path }),
    confirm: (input) =>
      `Create a ${input.status} change entry titled ${quoteForConfirmation(input.title)}${
        input.fromDiff ? ` with files from the ${input.staged ? "staged" : "uncommitted"} Git changes` : ""
      }${describeSections(input.sections)}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await draftChangeEntry(workspace, documents, changeEntryOptions(input));
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const draft = await createChangeEntryDetailed(workspace, documents, changeEntryOptions(input));
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
  readonly sections?: LedgerSectionBodies;
}

function productNoteOptions(input: FeedbackInput, dryRun = false) {
  return {
    title: input.title,
    areas: input.areas ?? [],
    tags: input.tags ?? [],
    status: input.status,
    sections: input.sections,
    dryRun,
  };
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
    sections: sectionsInput,
  }),
  output: createdRecordOutput,
  cli: {
    path: ["feedback"],
    aliases: [["product-note"]],
    helpTopics: ["product-note"],
    usage:
      "ledger feedback <title> [--area <area>] [--tag <tag>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      tag: { type: "string[]", field: "tags", description: "Tag (repeatable)." },
      status: { type: "string", description: "Note status." },
      ...sectionFlags,
    },
    json: true,
    help: `Creates a product-note record for dogfood findings, product observations, or
other feedback that should not be mixed into normal change receipts. --section
Heading=text and --sections-file fill the Context, Finding, Impact,
Recommendation, and Follow-ups sections.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_feedback",
    title: "Create a product note",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a product note titled ${quoteForConfirmation(input.title)}${describeSections(input.sections)}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await createProductNoteEntry(workspace, documents, productNoteOptions(input, true));
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createProductNoteEntry(workspace, documents, productNoteOptions(input));
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
  readonly sections?: LedgerSectionBodies;
}

function recordOptions(input: NewRecordInput, dryRun = false) {
  return {
    title: input.title,
    areas: input.areas ?? [],
    decisions: input.decisions,
    related: input.related,
    docs: input.docs,
    status: input.status,
    sections: input.sections,
    dryRun,
  };
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
    sections: sectionsInput,
  }),
  output: createdRecordOutput,
  cli: {
    path: ["backlog", "new"],
    usage:
      "ledger backlog new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      decision: { type: "string[]", field: "decisions", description: "Decision id (repeatable)." },
      related: { type: "string[]", description: "Related record id (repeatable)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc path (repeatable)." },
      status: { type: "string", description: "Item status." },
      ...sectionFlags,
    },
    json: true,
    help: `Creates the next numbered backlog item under the configured backlog directory
from .ledger/templates/backlog.md. Promote it later with ledger promote <id>.
--section Heading=text and --sections-file fill the template's sections.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_backlog_new",
    title: "Create a backlog item",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a backlog item titled ${quoteForConfirmation(input.title)}${describeSections(input.sections)}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await createBacklogItem(workspace, documents, recordOptions(input, true));
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createBacklogItem(workspace, documents, recordOptions(input));
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
    sections: sectionsInput,
  }),
  output: createdRecordOutput,
  cli: {
    path: ["decision", "new"],
    usage:
      "ledger decision new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "title", min: 1, join: true },
    flags: {
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      decision: { type: "string[]", field: "decisions", description: "Prior decision id (repeatable)." },
      related: { type: "string[]", description: "Related record id (repeatable)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc path (repeatable)." },
      status: { type: "string", description: "Decision status." },
      ...sectionFlags,
    },
    json: true,
    help: `Creates the next numbered decision record under the configured decisions
directory from .ledger/templates/decision.md. --section Heading=text and
--sections-file fill the Context, Decision, Consequences, and Revisit Criteria
sections.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_decision_new",
    title: "Create a decision record",
    summary: (data) => ({ path: data.path }),
    confirm: (input) => `Create a decision record titled ${quoteForConfirmation(input.title)}${describeSections(input.sections)}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await createDecision(workspace, documents, recordOptions(input, true));
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const path = await createDecision(workspace, documents, recordOptions(input));
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
  readonly sections?: LedgerSectionBodies;
}

function promoteOptions(input: PromoteInput, dryRun = false) {
  return {
    title: input.title,
    areas: input.areas,
    fromDiff: Boolean(input.fromDiff),
    staged: Boolean(input.staged),
    status: input.status,
    sourceStatus: input.sourceStatus,
    sections: input.sections,
    dryRun,
  };
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
    sections: sectionsInput,
  }),
  output: looseRecord({
    source: looseRecord({ id: z.string(), kind: z.string(), path: z.string(), status: z.string() }),
    entry: looseRecord({ id: z.string(), path: z.string() }),
    carriedChecks: z.array(z.string()),
  }),
  cli: {
    path: ["promote"],
    usage:
      "ledger promote <id> [--title <title>] [--area <area>] [--from-diff] [--staged] [--status <status>] [--source-status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "id", min: 1, max: 1 },
    flags: {
      title: { type: "string", description: "Entry title." },
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      "from-diff": { type: "boolean", description: "Prefill files from Git changes." },
      staged: { type: "boolean", description: "Read the staged diff." },
      status: { type: "string", description: "Entry status." },
      "source-status": { type: "string", description: "Status written to the promoted item." },
      ...sectionFlags,
    },
    json: true,
    help: `Creates a draft change entry linked to a backlog item through the backlog
frontmatter field. The entry carries the item's areas, decisions, and acceptance
checks (as Verification bullets). The item's status becomes in-progress unless
--source-status says otherwise. Both writes happen in one transaction.
--section Heading=text and --sections-file fill the entry's sections and win
over the carried checks and notes.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_promote",
    title: "Promote a record",
    summary: (data) => ({ entry: data.entry.id, source: data.source.id, carriedChecks: data.carriedChecks.length }),
    confirm: (input) =>
      `Create a ${input.status} change entry from ${input.id}${
        input.title ? ` titled ${quoteForConfirmation(input.title)}` : ""
      }${describeSections(input.sections)} and update ${input.id}${input.sourceStatus ? ` to status ${input.sourceStatus}` : ""}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await promoteRecord(workspace, documents, input.id, promoteOptions(input, true));
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await promoteRecord(workspace, documents, input.id, promoteOptions(input));
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

export interface UpdateInput extends Record<string, unknown> {
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly areas?: readonly string[];
  readonly files?: readonly string[];
  readonly symbols?: readonly string[];
  readonly docs?: readonly string[];
  readonly related?: readonly string[];
  readonly decisions?: readonly string[];
  readonly backlog?: readonly string[];
  readonly tags?: readonly string[];
  readonly docsImpact?: LedgerDocsImpactInput;
  readonly sections?: LedgerSectionBodies;
}

function updateChanges(input: UpdateInput) {
  const lists: Partial<Record<LedgerRecordListField, readonly string[]>> = {};
  for (const field of recordListFields) {
    const values = input[field];
    if (values !== undefined) lists[field] = values;
  }
  return {
    title: input.title,
    status: input.status,
    lists,
    docsImpact: input.docsImpact,
    sections: input.sections,
  };
}

function describeUpdate(input: UpdateInput): string {
  const parts: string[] = [];
  if (input.title !== undefined) parts.push(`retitle it ${quoteForConfirmation(input.title)}`);
  if (input.status !== undefined) parts.push(`set its status to ${input.status}`);
  const lists = recordListFields.filter((field) => input[field] !== undefined);
  if (lists.length > 0) parts.push(`replace its ${lists.join(", ")}`);
  if (input.docsImpact) parts.push(`declare docs impact ${input.docsImpact.status}`);
  const sections = Object.keys(input.sections ?? {});
  if (sections.length > 0) parts.push(`rewrite ${describeSections(input.sections).replace(/^ with /, "")}`);
  if (parts.length === 0) return "change nothing";
  if (parts.length <= 2) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export const updateOperation = defineOperation<UpdateInput, UpdateRecordResult>({
  name: "update",
  title: "Update a record",
  description: "Change a record's title, status, list fields, docs impact, or section bodies in place.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    id: shortString.describe("Record id, for example 0042 or B007, or the record's project path."),
    title: z.string().min(1).max(500).optional().describe("New title; the matching # heading follows."),
    status: shortString.optional().describe("New status."),
    areas: z.array(shortString).max(200).optional().describe("Area tags, replacing the current list."),
    files: z.array(pathString).max(2000).optional().describe("Files or coverage patterns, replacing the current list."),
    symbols: z.array(shortString).max(500).optional().describe("Anchored symbols (change entries), replacing the current list."),
    docs: z.array(pathString).max(200).optional().describe("Durable docs, replacing the current list."),
    related: z.array(shortString).max(200).optional().describe("Related record ids, replacing the current list."),
    decisions: z.array(shortString).max(200).optional().describe("Decision ids, replacing the current list."),
    backlog: z.array(shortString).max(200).optional().describe("Backlog item ids, replacing the current list."),
    tags: z.array(shortString).max(200).optional().describe("Tags, replacing the current list."),
    docsImpact: docsImpactInput,
    sections: sectionsInput,
  }),
  output: looseRecord({
    id: z.string(),
    kind: z.string(),
    path: z.string(),
    fields: z.array(z.string()),
    sections: z.array(z.string()),
  }),
  cli: {
    path: ["update"],
    usage:
      "ledger update <id> [--title <title>] [--status <status>] [--area <area>] [--file <path>] [--symbol <name>] [--doc <path>] [--related <id>] [--decision <id>] [--backlog <id>] [--tag <tag>] [--docs-impact <status> --docs-impact-reason <text> [--docs-impact-doc <path>]] [--section <Heading=text>] [--sections-file <path>] [--json]",
    positionals: { field: "id", min: 1, max: 1 },
    flags: {
      title: { type: "string", description: "New title." },
      status: { type: "string", description: "New status." },
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable; replaces the list)." },
      file: { type: "string[]", field: "files", description: "File or pattern (repeatable; replaces the list)." },
      symbol: { type: "string[]", field: "symbols", description: "Symbol (repeatable; replaces the list)." },
      doc: { type: "string[]", field: "docs", description: "Durable doc (repeatable; replaces the list)." },
      related: { type: "string[]", description: "Related record id (repeatable; replaces the list)." },
      decision: { type: "string[]", field: "decisions", description: "Decision id (repeatable; replaces the list)." },
      backlog: { type: "string[]", description: "Backlog item id (repeatable; replaces the list)." },
      tag: { type: "string[]", field: "tags", description: "Tag (repeatable; replaces the list)." },
      ...docsImpactFlags,
      ...sectionFlags,
    },
    json: true,
    help: `Changes a record in place and sets updated to today. A list flag replaces
that whole list, so pass every value the record should keep. --title also
rewrites the "# id: title" heading; the file keeps its path. --section
Heading=text and --sections-file replace sections, and a heading from the
kind's template that the record lacks is appended. Docs impact and symbols
apply to change entries only. Finish a hook-drafted receipt this way, then run
ledger ready.`,
    prepare: prepareRecordFlags,
  },
  mcp: {
    tool: "ledger_update",
    title: "Update a record",
    summary: (data) => ({ id: data.id, fields: data.fields.length, sections: data.sections.length }),
    confirm: (input) => `Update ${input.id}: ${describeUpdate(input)}.`,
    async precheck(context, input) {
      const { workspace, documents } = await loadDocuments(context);
      await updateRecord(workspace, documents, input.id, updateChanges(input), { dryRun: true });
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    return { data: await updateRecord(workspace, documents, input.id, updateChanges(input)) };
  },
  format(data) {
    const changed = [...data.fields, ...data.sections.map((section) => `the ${section} section`)];
    return `Updated ${data.path}: ${changed.join(", ")}.`;
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
