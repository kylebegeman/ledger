import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildConflictTargets } from "./conflict.js";
import { normalizeDocument, normalizePath } from "./documents.js";
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
}

export interface LedgerAgentPacket {
  readonly target: string;
  readonly entries: readonly LedgerPacketEntry[];
}

export function buildAgentPacket(
  documents: readonly ParsedLedgerDocument[],
  target: string,
): LedgerAgentPacket {
  const [conflictTarget] = buildConflictTargets(documents, [target]);
  const normalizedById = new Map(documents.map((document) => {
    const normalized = normalizeDocument(document);
    return [normalized.id, normalized] as const;
  }));

  return {
    target: conflictTarget?.target ?? target,
    entries: (conflictTarget?.entries ?? []).map((entry) => {
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
    }),
  };
}

export function formatAgentPacket(packet: LedgerAgentPacket): string {
  const lines = ["# Ledger Agent Packet", "", `Target: \`${packet.target}\``, ""];
  if (packet.entries.length === 0) {
    lines.push("No Ledger records mention this target.", "");
    return lines.join("\n");
  }

  for (const entry of packet.entries) {
    lines.push(`## ${entry.id}: ${entry.title}`, "");
    lines.push(`- Entry: \`${entry.path}\``);
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
