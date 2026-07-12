import path from "node:path";
import { coveragePatternMatches } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import type {
  LedgerIndexes,
  LedgerManifest,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export function buildIndexes(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerIndexes {
  const normalized = documents.map(normalizeDocument);
  const manifest: LedgerManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    projectRoot: workspace.projectRoot,
    documents: normalized,
  };

  return {
    manifest,
    byFile: groupByMany(normalized, (document) => document.files),
    byArea: groupByMany(normalized, (document) => document.areas),
    byRelease: groupByMany(normalized, (document) =>
      document.release ? [document.release] : [],
    ),
    bySymbol: groupByMany(normalized, (document) => document.symbols),
    byDecision: groupByMany(normalized, (document) => document.decisions),
    byBacklog: groupByMany(normalized, (document) => document.backlog),
  };
}

export async function writeIndexes(
  workspace: LedgerWorkspace,
  indexes: LedgerIndexes,
): Promise<void> {
  const output = workspace.config.indexes.output;
  await applyFileTransaction(workspace, "write Ledger indexes", [
    jsonChange(output, "manifest.json", indexes.manifest),
    jsonChange(output, "by-file.json", indexes.byFile),
    jsonChange(output, "by-area.json", indexes.byArea),
    jsonChange(output, "by-release.json", indexes.byRelease),
    jsonChange(output, "by-symbol.json", indexes.bySymbol),
    jsonChange(output, "by-decision.json", indexes.byDecision),
    jsonChange(output, "by-backlog.json", indexes.byBacklog),
  ]);
}

export function explainFile(
  documents: readonly ParsedLedgerDocument[],
  filePath: string,
): readonly NormalizedLedgerDocument[] {
  const normalizedPath = normalizePath(filePath);
  return documents
    .map(normalizeDocument)
    .filter((document) =>
      document.files.some(
        (candidate) =>
          coveragePatternMatches(normalizedPath, candidate) ||
          candidate === normalizedPath ||
          candidate.endsWith(`/${normalizedPath}`) ||
          normalizedPath.endsWith(`/${candidate}`),
      ),
    );
}

function groupByMany(
  documents: readonly NormalizedLedgerDocument[],
  selectKeys: (document: NormalizedLedgerDocument) => readonly string[],
): Record<string, readonly string[]> {
  const groups = new Map<string, string[]>();

  for (const document of documents) {
    for (const rawKey of selectKeys(document)) {
      const key = normalizePath(rawKey);
      const group = groups.get(key) ?? [];
      group.push(document.id);
      groups.set(key, group);
    }
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, ids]) => [key, ids.sort()]),
  );
}

function jsonChange(output: string, filename: string, value: unknown) {
  return {
    path: normalizePath(path.join(output, filename)),
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}
