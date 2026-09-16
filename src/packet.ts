import path from "node:path";
import { normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import type { LedgerStaticReaderModel } from "./render.js";
import { relatedRecords, retrieveByPath, type LedgerRelationshipKind } from "./retrieval.js";
import { searchLedgerIndex } from "./search.js";
import { LedgerError } from "./machine.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";
import type { LedgerEvidenceIndex, LedgerVerificationFreshness } from "./verify.js";

export interface LedgerPacketEntry {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly areas: readonly string[];
  readonly symbols: readonly string[];
  readonly docs: readonly string[];
  readonly matchedFiles: readonly string[];
  readonly conflictRules: readonly string[];
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
  readonly verificationStatus?: LedgerVerificationFreshness;
  readonly verifiedAt?: string;
  readonly searchScore?: number;
  readonly matchedFields?: readonly string[];
}

/** A record one relationship hop away from a packet entry. */
export interface LedgerPacketRelated {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
  readonly path: string;
  readonly via: readonly LedgerRelationshipKind[];
  readonly from: readonly string[];
}

export interface LedgerAgentPacket {
  readonly target: string;
  readonly entries: readonly LedgerPacketEntry[];
  readonly related: readonly LedgerPacketRelated[];
  readonly estimatedTokens: number;
  readonly budgetTokens?: number;
  readonly truncated: boolean;
  readonly omittedEntries: number;
}

export interface LedgerAgentPacketOptions {
  readonly budgetTokens?: number;
  readonly maxEntries?: number;
  /** Verification evidence to annotate entries with. */
  readonly evidence?: LedgerEvidenceIndex;
  readonly maxEvidenceAgeDays?: number;
}

export interface LedgerSearchAgentPacketOptions extends LedgerAgentPacketOptions {
  readonly limit?: number;
}

export function buildAgentPacket(
  documents: readonly ParsedLedgerDocument[],
  target: string,
  options: LedgerAgentPacketOptions = {},
): LedgerAgentPacket {
  const retrieval = retrieveByPath(documents, target, {
    evidence: options.evidence,
    maxEvidenceAgeDays: options.maxEvidenceAgeDays,
  });
  const allEntries: readonly LedgerPacketEntry[] = retrieval.records.map((record) => ({
    id: record.id,
    title: record.title,
    path: record.path,
    areas: record.areas,
    symbols: record.symbols,
    docs: record.docs,
    matchedFiles: record.matchedFiles,
    conflictRules: record.conflictRules,
    invariants: record.invariants,
    verification: record.verification,
    ...(record.verificationStatus ? { verificationStatus: record.verificationStatus, verifiedAt: record.verifiedAt } : {}),
  }));
  const allRelated: readonly LedgerPacketRelated[] = retrieval.related.map((record) => ({ ...record }));
  const { entries, related } = selectPacketEntries(allEntries, allRelated, retrieval.target, options);

  return {
    target: retrieval.target,
    entries,
    related,
    estimatedTokens: estimatePacketTokens(retrieval.target, entries, related),
    budgetTokens: options.budgetTokens,
    truncated: entries.length < allEntries.length,
    omittedEntries: Math.max(0, allEntries.length - entries.length),
  };
}

export function buildSearchAgentPacket(
  model: LedgerStaticReaderModel,
  query: string,
  options: LedgerSearchAgentPacketOptions = {},
): LedgerAgentPacket {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new LedgerError("invalid-argument", "Search query must not be empty");
  }

  const renderedById = new Map(model.documents.map((document) => [document.id, document]));
  const searchLimit = positiveInteger(options.limit) ?? positiveInteger(options.maxEntries) ?? 10;
  const maxEntries = positiveInteger(options.maxEntries) ?? searchLimit;
  const matches = searchLedgerIndex(model.searchIndex, normalizedQuery, {
    limit: Number.MAX_SAFE_INTEGER,
  });
  const candidateEntries = matches.slice(0, searchLimit).map((match) => {
    const rendered = renderedById.get(match.id);
    return {
      id: match.id,
      title: match.title,
      path: match.path,
      areas: match.document.areas,
      symbols: match.document.symbols,
      docs: match.document.docs,
      matchedFiles: match.document.files,
      conflictRules: [],
      invariants: rendered?.invariants ?? [],
      verification: rendered?.verification ?? [],
      searchScore: match.score,
      matchedFields: match.matchedFields,
    };
  });
  const target = `search:${normalizedQuery}`;
  const candidateDocuments = candidateEntries.flatMap((entry) => {
    const rendered = renderedById.get(entry.id);
    return rendered ? [rendered] : [];
  });
  const allRelated: readonly LedgerPacketRelated[] = relatedRecords(
    candidateDocuments,
    model.documents,
  ).related.map((record) => ({ ...record }));
  const { entries, related } = selectPacketEntries(candidateEntries, allRelated, target, {
    ...options,
    maxEntries,
  });

  return {
    target,
    entries,
    related,
    estimatedTokens: estimatePacketTokens(target, entries, related),
    budgetTokens: options.budgetTokens,
    truncated: entries.length < matches.length,
    omittedEntries: Math.max(0, matches.length - entries.length),
  };
}

function positiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return undefined;
  return Math.floor(value);
}

export function formatAgentPacket(packet: LedgerAgentPacket): string {
  const lines = ["# Ledger Agent Packet", "", `Target: \`${packet.target}\``, ""];
  lines.push(`Estimated tokens: ${packet.estimatedTokens}`);
  if (packet.budgetTokens) lines.push(`Budget: ${packet.budgetTokens}`);
  if (packet.truncated) {
    lines.push(`Omitted entries: ${packet.omittedEntries}`);
  }
  lines.push("");

  if (packet.entries.length === 0) {
    lines.push("No Ledger records mention this target.", "");
    return lines.join("\n");
  }

  for (const entry of packet.entries) {
    lines.push(`## ${entry.id}: ${entry.title}`, "");
    lines.push(`- Entry: \`${entry.path}\``);
    if (typeof entry.searchScore === "number") lines.push(`- Search score: ${entry.searchScore}`);
    if (entry.verificationStatus) {
      lines.push(`- Verified: ${entry.verificationStatus}${entry.verifiedAt ? ` (${entry.verifiedAt.slice(0, 10)})` : ""}`);
    }
    pushInlineList(lines, "Matched fields", entry.matchedFields ?? []);
    pushInlineList(lines, "Matched files", entry.matchedFiles);
    pushInlineList(lines, "Areas", entry.areas);
    pushInlineList(lines, "Symbols", entry.symbols);
    pushInlineList(lines, "Docs", entry.docs);
    pushSection(lines, "Conflict Rules", entry.conflictRules);
    pushSection(lines, "Invariants", entry.invariants);
    pushSection(lines, "Verification", entry.verification);
  }

  if (packet.related.length > 0) {
    lines.push("## Related Records", "");
    for (const record of packet.related) {
      lines.push(
        `- ${record.id} ${record.title} (${record.kind}, ${record.status}; via ${record.via.join(", ")}) \`${record.path}\``,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeAgentPacketReport(
  workspace: LedgerWorkspace,
  packet: LedgerAgentPacket,
): Promise<string> {
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "packet.md"));
  await applyFileTransaction(workspace, "write agent packet report", [
    { path: reportPath, content: formatAgentPacket(packet) },
  ]);
  return reportPath;
}

export function estimatePacketTokens(
  target: string,
  entries: readonly LedgerPacketEntry[],
  related: readonly LedgerPacketRelated[] = [],
): number {
  const text = [
    target,
    ...related.flatMap((record) => [record.id, record.title, record.path, ...record.via]),
    ...entries.flatMap((entry) => [
      entry.id,
      entry.title,
      entry.path,
      ...entry.areas,
      ...entry.symbols,
      ...entry.docs,
      ...entry.matchedFiles,
      ...entry.conflictRules,
      ...entry.invariants,
      ...entry.verification,
      entry.verificationStatus ?? "",
      entry.verifiedAt ?? "",
      entry.searchScore?.toString() ?? "",
      ...(entry.matchedFields ?? []),
    ]),
  ].join("\n");
  return estimateTokens(text);
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

const maxRelatedUnderBudget = 8;

function selectPacketEntries(
  entries: readonly LedgerPacketEntry[],
  related: readonly LedgerPacketRelated[],
  target: string,
  options: LedgerAgentPacketOptions,
): { readonly entries: readonly LedgerPacketEntry[]; readonly related: readonly LedgerPacketRelated[] } {
  const maxEntries = options.maxEntries && options.maxEntries > 0
    ? options.maxEntries
    : entries.length;
  let selected = entries.slice(0, maxEntries);
  const budgeted = Boolean(options.budgetTokens && options.budgetTokens > 0);
  const relatedFor = (chosen: readonly LedgerPacketEntry[]) => {
    const ids = new Set(chosen.map((entry) => entry.id));
    const scoped = related.filter((record) => record.from.some((id) => ids.has(id)));
    return budgeted ? scoped.slice(0, maxRelatedUnderBudget) : scoped;
  };

  if (budgeted && options.budgetTokens) {
    selected = selected.map(compactPacketEntry);
    while (
      selected.length > 0 &&
      estimatePacketTokens(target, selected, relatedFor(selected)) > options.budgetTokens
    ) {
      selected = selected.slice(0, -1);
    }
  }

  return { entries: selected, related: relatedFor(selected) };
}

function compactPacketEntry(entry: LedgerPacketEntry): LedgerPacketEntry {
  return {
    ...entry,
    areas: entry.areas.slice(0, 4),
    symbols: entry.symbols.slice(0, 6),
    docs: entry.docs.slice(0, 4),
    matchedFiles: entry.matchedFiles.slice(0, 4),
    conflictRules: entry.conflictRules.slice(0, 3),
    invariants: entry.invariants.slice(0, 5),
    verification: entry.verification.slice(0, 5),
  };
}

function pushInlineList(lines: string[], label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`- ${label}: ${values.map((value) => `\`${value}\``).join(", ")}`);
}

function pushSection(lines: string[], title: string, values: readonly string[]): void {
  lines.push("", `### ${title}`, "");
  if (values.length === 0) {
    lines.push("None recorded.", "");
    return;
  }
  for (const value of values) lines.push(`- ${value}`);
  lines.push("");
}
