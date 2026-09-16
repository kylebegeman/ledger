import path from "node:path";
import { normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { retrieveByPath } from "./retrieval.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export {
  extractChangedFileBlocks,
  extractConflictRules,
  extractConflictRulesForFiles,
  type ChangedFileBlock,
} from "./retrieval.js";

export interface LedgerConflictEntry {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly matchedFiles: readonly string[];
  readonly conflictRules: readonly string[];
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
}

export interface LedgerConflictTarget {
  readonly target: string;
  readonly entries: readonly LedgerConflictEntry[];
}

/** Conflict guidance per target path, projected from the shared retrieval contract. */
export function buildConflictTargets(
  documents: readonly ParsedLedgerDocument[],
  targets: readonly string[],
): readonly LedgerConflictTarget[] {
  return targets.map((target) => {
    const retrieval = retrieveByPath(documents, target);
    return {
      target: retrieval.target,
      entries: retrieval.records.map((record) => ({
        id: record.id,
        title: record.title,
        path: record.path,
        matchedFiles: record.matchedFiles,
        conflictRules: record.conflictRules,
        invariants: record.invariants,
        verification: record.verification,
      })),
    };
  });
}

export async function writeConflictReport(
  workspace: LedgerWorkspace,
  targets: readonly LedgerConflictTarget[],
): Promise<string> {
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "conflict.md"));
  await applyFileTransaction(workspace, "write conflict report", [
    { path: reportPath, content: formatConflictReport(targets) },
  ]);
  return reportPath;
}

export function formatConflictReport(targets: readonly LedgerConflictTarget[]): string {
  const lines = ["# Ledger Conflict Report", "", `Targets: ${targets.length}`, ""];

  for (const target of targets) {
    lines.push(`## ${target.target}`, "");
    if (target.entries.length === 0) {
      lines.push("No Ledger records mention this path.", "");
      continue;
    }

    for (const entry of target.entries) {
      lines.push(`### ${entry.id}: ${entry.title}`, "");
      lines.push(`- Entry: \`${entry.path}\``);
      lines.push(`- Matched files: ${entry.matchedFiles.map((file) => `\`${file}\``).join(", ")}`);
      pushSection(lines, "Conflict Rules", entry.conflictRules);
      pushSection(lines, "Invariants", entry.invariants);
      pushSection(lines, "Verification", entry.verification);
    }
  }

  return `${lines.join("\n")}\n`;
}

function pushSection(lines: string[], title: string, values: readonly string[]): void {
  lines.push("", `#### ${title}`, "");
  if (values.length === 0) {
    lines.push("None recorded.", "");
    return;
  }
  for (const value of values) lines.push(`- ${value}`);
  lines.push("");
}
