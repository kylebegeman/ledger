import { z } from "zod";
import {
  formatLedgerPacketResult,
  formatLedgerQueryResult,
  formatLedgerSearchPacketResult,
  formatLedgerSearchResult,
  runLedgerPacketCommand,
  runLedgerQueryCommand,
  runLedgerSearchCommand,
  runLedgerSearchPacketCommand,
} from "../../commands/index.js";
import {
  buildConflictTargets,
  writeConflictReport,
  type LedgerConflictTarget,
} from "../../conflict.js";
import { explainFile } from "../../indexer.js";
import type { LedgerAgentPacket } from "../../packet.js";
import {
  retrieveByPath,
  type LedgerRetrievalMissingRecord,
  type LedgerRetrievalRecord,
  type LedgerRetrievalRelatedRecord,
} from "../../retrieval.js";
import type { LedgerSearchResult } from "../../search.js";
import type { LedgerDocumentKind, NormalizedLedgerDocument } from "../../types.js";
import { readEvidence } from "../../verify.js";
import { loadDocuments, looseRecord, pathString, positiveInt, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

const documentKinds = ["change", "backlog", "decision", "release", "product-note", "feedback", "session"] as const;

export interface ExplainInput extends Record<string, unknown> {
  readonly path: string;
  readonly agent?: boolean;
}

export interface ExplainOutput {
  readonly target: string;
  readonly matches: readonly NormalizedLedgerDocument[];
  readonly records: readonly LedgerRetrievalRecord[];
  readonly related: readonly LedgerRetrievalRelatedRecord[];
  readonly missing: readonly LedgerRetrievalMissingRecord[];
}

const retrievalRecordSchema = looseRecord({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  path: z.string(),
  matchedFiles: z.array(z.string()),
  matches: z.array(looseRecord({ file: z.string(), kind: z.enum(["exact", "pattern", "suffix"]) })),
  conflictRules: z.array(z.string()),
  invariants: z.array(z.string()),
  verification: z.array(z.string()),
  supersededBy: z.array(z.string()),
  verificationStatus: z.enum(["fresh", "stale", "failed", "none"]).optional(),
  verifiedAt: z.string().optional(),
  verifiedCommit: z.string().optional(),
});

const relatedRecordSchema = looseRecord({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  path: z.string(),
  via: z.array(z.string()),
  from: z.array(z.string()),
});

export const explainOperation = defineOperation<ExplainInput, ExplainOutput>({
  name: "explain",
  title: "Explain file history",
  description: "Return Ledger records that mention a file path.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    path: pathString.describe("File path to explain."),
    agent: z.boolean().optional().describe("Return compact agent context."),
  }),
  output: looseRecord({
    target: z.string(),
    matches: z.array(looseRecord({ id: z.string(), title: z.string() })),
    records: z.array(retrievalRecordSchema),
    related: z.array(relatedRecordSchema),
    missing: z.array(looseRecord({ id: z.string(), via: z.string(), from: z.string() })),
  }),
  cli: {
    path: ["explain"],
    usage: "ledger explain <path> [--json] [--agent]",
    positionals: { field: "path", min: 1, max: 1 },
    flags: {
      agent: { type: "boolean", description: "Print compact invariants and verification context." },
    },
    json: true,
    help: `Shows Ledger records that mention a path, plus decisions, backlog items, and
superseding records one relationship hop away. --agent prints compact context.`,
  },
  mcp: {
    tool: "ledger_explain",
    title: "Explain file history",
    input: z.strictObject({ path: pathString.describe("File path to explain.") }),
    summary: (data) => ({
      target: data.target,
      matches: data.matches.length,
      related: data.related.length,
      missing: data.missing.length,
    }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const retrieval = retrieveByPath(documents, input.path, {
      evidence: await readEvidence(workspace),
      maxEvidenceAgeDays: workspace.config.verification.maxAgeDays,
    });
    const matches = explainFile(documents, input.path);
    return {
      data: {
        target: retrieval.target,
        matches,
        records: retrieval.records,
        related: retrieval.related,
        missing: retrieval.missing,
      },
    };
  },
  format(data, input) {
    if (data.matches.length === 0) return `No Ledger records mention ${data.target}.`;
    if (input.agent) {
      const lines = [`# Ledger Context: ${data.target}`];
      for (const entry of data.records) {
        lines.push("", `## ${entry.id}: ${entry.title}`, `Path: ${entry.path}`);
        if (entry.conflictRules.length > 0) {
          lines.push("Conflict rules:", ...entry.conflictRules.map((item) => `- ${item}`));
        }
        if (entry.invariants.length > 0) {
          lines.push("Invariants:", ...entry.invariants.map((item) => `- ${item}`));
        }
        if (entry.verification.length > 0) {
          lines.push("Verification:", ...entry.verification.map((item) => `- ${item}`));
        }
        if (entry.supersededBy.length > 0) {
          lines.push(`Superseded by: ${entry.supersededBy.join(", ")}`);
        }
      }
      if (data.related.length > 0) {
        lines.push("", "## Related Records");
        for (const record of data.related) {
          lines.push(`- ${record.id} ${record.title} (${record.kind}, ${record.status}; via ${record.via.join(", ")})`);
        }
      }
      return lines.join("\n");
    }
    const lines = [`Ledger records for ${data.target}:`];
    for (const document of data.matches) {
      lines.push(`- ${document.id} ${document.title} (${document.path})`);
      if (document.areas.length > 0) lines.push(`  Areas: ${document.areas.join(", ")}`);
      if (document.docs.length > 0) lines.push(`  Docs: ${document.docs.join(", ")}`);
      if (document.symbols.length > 0) lines.push(`  Symbols: ${document.symbols.join(", ")}`);
    }
    if (data.related.length > 0) {
      lines.push("Related records:");
      for (const record of data.related) {
        lines.push(`- ${record.id} ${record.title} (${record.kind}; via ${record.via.join(", ")})`);
      }
    }
    return lines.join("\n");
  },
});

export interface QueryInput extends Record<string, unknown> {
  readonly kind?: LedgerDocumentKind;
  readonly status?: string;
  readonly area?: string;
  readonly tag?: string;
  readonly release?: string;
  readonly decision?: string;
  readonly backlog?: string;
  readonly symbol?: string;
  readonly file?: string;
  readonly doc?: string;
  readonly id?: string;
  readonly text?: string;
  readonly limit?: number;
}

export interface QueryOutput {
  readonly matches: readonly NormalizedLedgerDocument[];
  readonly total: number;
  readonly limited: boolean;
}

export const queryOperation = defineOperation<QueryInput, QueryOutput>({
  name: "query",
  title: "Query Ledger records",
  description: "Filter Ledger records by metadata, relationships, paths, and text.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    kind: z.enum(documentKinds).optional(),
    status: shortString.optional(),
    area: shortString.optional(),
    tag: shortString.optional(),
    release: shortString.optional(),
    decision: shortString.optional(),
    backlog: shortString.optional(),
    symbol: shortString.optional(),
    file: pathString.optional(),
    doc: pathString.optional(),
    id: shortString.optional(),
    text: z.string().min(1).max(10_000).optional(),
    limit: positiveInt.max(100).optional(),
  }),
  output: looseRecord({
    matches: z.array(looseRecord({ id: z.string(), title: z.string() })),
    total: z.number(),
    limited: z.boolean(),
  }),
  cli: {
    path: ["query"],
    usage:
      "ledger query [--kind <kind>] [--status <status>] [--area <area>] [--tag <tag>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--text <text>] [--limit <entries>] [--json]",
    flags: {
      kind: { type: "string", description: "Record kind.", choices: [...documentKinds], choicesLabel: "kind" },
      status: { type: "string", description: "Record status." },
      area: { type: "string", description: "Area tag." },
      tag: { type: "string", description: "Tag." },
      release: { type: "string", description: "Release version." },
      decision: { type: "string", description: "Related decision id." },
      backlog: { type: "string", description: "Related backlog id." },
      symbol: { type: "string", description: "Symbol name." },
      file: { type: "string", description: "File path." },
      doc: { type: "string", description: "Docs path." },
      id: { type: "string", description: "Record id." },
      text: { type: "string", description: "Metadata text match." },
      limit: { type: "number", description: "Maximum records to return." },
    },
    json: true,
    help: "Filters Ledger records by metadata, tags, relationship ids, symbols, and paths.",
  },
  mcp: {
    tool: "ledger_query",
    title: "Query Ledger records",
    summary: (data) => ({ total: data.total, returned: data.matches.length, limited: data.limited }),
  },
  async run(context, input) {
    const { workspace } = await loadDocuments(context);
    const { limit, ...filters } = input;
    const result = await runLedgerQueryCommand(workspace, filters);
    const matches = typeof limit === "number" ? result.matches.slice(0, limit) : result.matches;
    return {
      data: {
        matches,
        total: result.matches.length,
        limited: typeof limit === "number" && matches.length < result.matches.length,
      },
    };
  },
  format(data) {
    return formatLedgerQueryResult({ matches: data.matches });
  },
});

export interface SearchInput extends Record<string, unknown> {
  readonly query: string;
  readonly limit?: number;
}

export interface SearchOutput {
  readonly query: string;
  readonly matches: readonly LedgerSearchResult[];
}

export const searchOperation = defineOperation<SearchInput, SearchOutput>({
  name: "search",
  title: "Search Ledger records",
  description: "Run weighted fuzzy search over the static reader search fields.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    query: z.string().min(1).max(10_000).describe("Search query."),
    limit: positiveInt.max(100).optional().describe("Maximum matches to return."),
  }),
  output: looseRecord({
    query: z.string(),
    matches: z.array(looseRecord({ id: z.string(), title: z.string(), score: z.number() })),
  }),
  cli: {
    path: ["search"],
    usage: "ledger search <query> [--limit <entries>] [--json]",
    positionals: { field: "query", min: 1, join: true },
    flags: {
      limit: { type: "number", description: "Maximum matches to return." },
    },
    json: true,
    help: `Runs weighted fuzzy search over the same static reader search fields used by
the browser UI.`,
  },
  mcp: {
    tool: "ledger_search",
    title: "Search Ledger records",
    summary: (data) => ({ query: data.query, matches: data.matches.length }),
  },
  async run(context, input) {
    const { workspace } = await loadDocuments(context);
    return { data: await runLedgerSearchCommand(workspace, input.query, { limit: input.limit }) };
  },
  format(data) {
    return formatLedgerSearchResult(data);
  },
});

export interface SearchPacketInput extends Record<string, unknown> {
  readonly query: string;
  readonly limit?: number;
  readonly budgetTokens?: number;
  readonly writeReport?: boolean;
}

export interface PacketOutput extends LedgerAgentPacket {
  readonly reportPath?: string;
}

const packetOutput = looseRecord({
  target: z.string(),
  entries: z.array(looseRecord({ id: z.string() })),
  estimatedTokens: z.number(),
  budgetTokens: z.number().optional(),
  truncated: z.boolean(),
  omittedEntries: z.number(),
  reportPath: z.string().optional(),
});

function packetSummary(data: PacketOutput): Readonly<Record<string, unknown>> {
  return {
    target: data.target,
    entries: data.entries.length,
    estimatedTokens: data.estimatedTokens,
    budgetTokens: data.budgetTokens,
    truncated: data.truncated,
    omittedEntries: data.omittedEntries,
    reportPath: data.reportPath,
  };
}

export const searchPacketOperation = defineOperation<SearchPacketInput, PacketOutput>({
  name: "search-packet",
  title: "Build search agent packet",
  description: "Return compact agent handoff context from weighted Ledger search results.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    query: z.string().min(1).max(10_000).describe("Search query to package for agent context."),
    limit: positiveInt.max(100).optional().describe("Maximum search matches to include."),
    budgetTokens: positiveInt.max(10_000).optional().describe("Approximate token budget for the returned packet."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/packet.md."),
  }),
  output: packetOutput,
  cli: {
    path: ["search-packet"],
    usage: "ledger search-packet <query> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]",
    positionals: { field: "query", min: 1, join: true },
    flags: {
      limit: { type: "number", description: "Maximum search matches to include." },
      budget: { type: "number", field: "budgetTokens", description: "Approximate token budget." },
      "write-report": { type: "boolean", description: "Write .ledger/reports/packet.md." },
    },
    json: true,
    help: `Builds a compact agent handoff packet from weighted search results. Use this
when you know the topic but not the exact file path. --budget compresses and
omits lower-priority matches to keep context bounded.
--write-report writes .ledger/reports/packet.md.`,
  },
  mcp: { tool: "ledger_search_packet", title: "Build search agent packet", summary: packetSummary },
  async run(context, input) {
    const { workspace } = await loadDocuments(context);
    const result = await runLedgerSearchPacketCommand(workspace, input.query, {
      budgetTokens: input.budgetTokens,
      limit: input.limit,
      maxEntries: input.limit,
      writeReport: input.writeReport,
    });
    return { data: { ...result.packet, reportPath: result.reportPath } };
  },
  format(data) {
    const { reportPath, ...packet } = data;
    return formatLedgerSearchPacketResult({ packet, reportPath });
  },
});

export interface PacketInput extends Record<string, unknown> {
  readonly path: string;
  readonly budgetTokens?: number;
  readonly maxEntries?: number;
  readonly writeReport?: boolean;
}

export const packetOperation = defineOperation<PacketInput, PacketOutput>({
  name: "packet",
  title: "Build agent packet",
  description: "Return compact agent handoff context for a file path.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    path: pathString.describe("File path to package for agent context."),
    budgetTokens: positiveInt.max(10_000).optional().describe("Approximate token budget for the returned packet."),
    maxEntries: positiveInt.max(100).optional().describe("Maximum records to include."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/packet.md."),
  }),
  output: packetOutput,
  cli: {
    path: ["packet"],
    usage: "ledger packet <path> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]",
    positionals: { field: "path", min: 1, max: 1 },
    flags: {
      limit: { type: "number", field: "maxEntries", description: "Maximum records to include." },
      budget: { type: "number", field: "budgetTokens", description: "Approximate token budget." },
      "write-report": { type: "boolean", description: "Write .ledger/reports/packet.md." },
    },
    json: true,
    help: `Builds a compact agent handoff packet for a file path. --budget compresses and
omits lower-priority entries to keep context bounded.
--write-report writes .ledger/reports/packet.md.`,
  },
  mcp: { tool: "ledger_packet", title: "Build agent packet", summary: packetSummary },
  async run(context, input) {
    const { workspace } = await loadDocuments(context);
    const result = await runLedgerPacketCommand(workspace, input.path, {
      budgetTokens: input.budgetTokens,
      maxEntries: input.maxEntries,
      writeReport: input.writeReport,
    });
    return { data: { ...result.packet, reportPath: result.reportPath } };
  },
  format(data) {
    const { reportPath, ...packet } = data;
    return formatLedgerPacketResult({ packet, reportPath });
  },
});

export interface ConflictInput extends Record<string, unknown> {
  readonly paths: readonly string[];
  readonly writeReport?: boolean;
}

export interface ConflictOutput {
  readonly targets: readonly LedgerConflictTarget[];
  readonly reportPath?: string;
}

export const conflictOperation = defineOperation<ConflictInput, ConflictOutput>({
  name: "conflict",
  title: "Get conflict guidance",
  description: "Return conflict rules, invariants, and verification for paths.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    paths: z.array(pathString).min(1).max(1_000).describe("File paths to inspect."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/conflict.md."),
  }),
  output: looseRecord({
    targets: z.array(looseRecord({ target: z.string(), entries: z.array(looseRecord({ id: z.string() })) })),
    reportPath: z.string().optional(),
  }),
  cli: {
    path: ["conflict"],
    usage: "ledger conflict <path...> [--json] [--write-report]",
    positionals: { field: "paths", min: 1 },
    flags: {
      "write-report": { type: "boolean", description: "Write .ledger/reports/conflict.md." },
    },
    json: true,
    help: `Shows file-specific conflict rules, invariants, and verification commands.
--write-report writes .ledger/reports/conflict.md.`,
  },
  mcp: {
    tool: "ledger_conflict",
    title: "Get conflict guidance",
    summary: (data) => ({
      targets: data.targets.length,
      entries: data.targets.reduce((sum, target) => sum + target.entries.length, 0),
      reportPath: data.reportPath,
    }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const targets = buildConflictTargets(documents, input.paths);
    const reportPath = input.writeReport ? await writeConflictReport(workspace, targets) : undefined;
    return { data: { targets, reportPath } };
  },
  format(data) {
    const lines: string[] = [];
    for (const target of data.targets) {
      lines.push(`Conflict guidance for ${target.target}:`);
      if (target.entries.length === 0) {
        lines.push("- No Ledger records mention this path.");
        continue;
      }
      for (const entry of target.entries) {
        lines.push(`- ${entry.id} ${entry.title} (${entry.path})`);
        lines.push(`  Matched files: ${entry.matchedFiles.join(", ")}`);
        pushIndentedList(lines, "  Conflict rules", entry.conflictRules);
        pushIndentedList(lines, "  Invariants", entry.invariants);
        pushIndentedList(lines, "  Verification", entry.verification);
      }
    }
    if (data.reportPath) lines.push(`Wrote ${data.reportPath}`);
    return lines.join("\n");
  },
});

function pushIndentedList(lines: string[], label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}:`);
  for (const value of values) lines.push(`    - ${value}`);
}
