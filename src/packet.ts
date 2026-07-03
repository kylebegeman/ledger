import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildConflictTargets } from "./conflict.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import type { LedgerStaticReaderModel } from "./render.js";
import { searchLedgerIndex } from "./search.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

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
  readonly searchScore?: number;
  readonly matchedFields?: readonly string[];
}

export interface LedgerAgentPacket {
  readonly target: string;
  readonly entries: readonly LedgerPacketEntry[];
  readonly estimatedTokens: number;
  readonly budgetTokens?: number;
  readonly truncated: boolean;
  readonly omittedEntries: number;
}

export interface LedgerAgentPacketOptions {
  readonly budgetTokens?: number;
  readonly maxEntries?: number;
}

export interface LedgerSearchAgentPacketOptions extends LedgerAgentPacketOptions {
  readonly limit?: number;
}

export function buildAgentPacket(
  documents: readonly ParsedLedgerDocument[],
  target: string,
  options: LedgerAgentPacketOptions = {},
): LedgerAgentPacket {
  const [conflictTarget] = buildConflictTargets(documents, [target]);
  const normalizedById = new Map(documents.map((document) => {
    const normalized = normalizeDocument(document);
    return [normalized.id, normalized] as const;
  }));

  const allEntries = (conflictTarget?.entries ?? []).map((entry) => {
    const normalized = normalizedById.get(entry.id);
    return {
      id: entry.id,
      title: entry.title,
      path: entry.path,
      areas: normalized?.areas ?? [],
      symbols: normalized?.symbols ?? [],
      docs: normalized?.docs ?? [],
      matchedFiles: entry.matchedFiles,
      conflictRules: entry.conflictRules,
      invariants: entry.invariants,
      verification: entry.verification,
    };
  });
  const entries = selectPacketEntries(allEntries, conflictTarget?.target ?? target, options);

  return {
    target: conflictTarget?.target ?? target,
    entries,
    estimatedTokens: estimatePacketTokens(conflictTarget?.target ?? target, entries),
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
    throw new Error("Search query must not be empty");
  }

  const renderedById = new Map(model.documents.map((document) => [document.id, document]));
  const maxEntries = options.maxEntries ?? options.limit;
  const matches = searchLedgerIndex(model.searchIndex, normalizedQuery, {
    limit: options.limit ?? maxEntries,
  });
  const allEntries = matches.map((match) => {
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
  const entries = selectPacketEntries(allEntries, target, { ...options, maxEntries });

  return {
    target,
    entries,
    estimatedTokens: estimatePacketTokens(target, entries),
    budgetTokens: options.budgetTokens,
    truncated: entries.length < allEntries.length,
    omittedEntries: Math.max(0, allEntries.length - entries.length),
  };
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
    pushInlineList(lines, "Matched fields", entry.matchedFields ?? []);
    pushInlineList(lines, "Matched files", entry.matchedFiles);
    pushInlineList(lines, "Areas", entry.areas);
    pushInlineList(lines, "Symbols", entry.symbols);
    pushInlineList(lines, "Docs", entry.docs);
    pushSection(lines, "Conflict Rules", entry.conflictRules);
    pushSection(lines, "Invariants", entry.invariants);
    pushSection(lines, "Verification", entry.verification);
  }

  return `${lines.join("\n")}\n`;
}

export async function writeAgentPacketReport(
  workspace: LedgerWorkspace,
  packet: LedgerAgentPacket,
): Promise<string> {
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  const reportPath = path.join(reportDirectory, "packet.md");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, formatAgentPacket(packet), "utf8");
  return normalizePath(path.relative(workspace.projectRoot, reportPath));
}

export function estimatePacketTokens(
  target: string,
  entries: readonly LedgerPacketEntry[],
): number {
  const text = [
    target,
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

function selectPacketEntries(
  entries: readonly LedgerPacketEntry[],
  target: string,
  options: LedgerAgentPacketOptions,
): readonly LedgerPacketEntry[] {
  const maxEntries = options.maxEntries && options.maxEntries > 0
    ? options.maxEntries
    : entries.length;
  let selected = entries.slice(0, maxEntries);

  if (options.budgetTokens && options.budgetTokens > 0) {
    selected = selected.map(compactPacketEntry);
    while (
      selected.length > 0 &&
      estimatePacketTokens(target, selected) > options.budgetTokens
    ) {
      selected = selected.slice(0, -1);
    }
  }

  return selected;
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
