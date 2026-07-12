import { readLedgerDocuments } from "../documents.js";
import { searchLedgerDocuments, type LedgerSearchResult } from "../search.js";
import { LedgerError } from "../machine.js";
import type { LedgerWorkspace } from "../types.js";

export interface LedgerSearchCommandOptions {
  readonly limit?: number;
}

export interface LedgerSearchCommandResult {
  readonly query: string;
  readonly matches: readonly LedgerSearchResult[];
}

export async function runLedgerSearchCommand(
  workspace: LedgerWorkspace,
  query: string,
  options: LedgerSearchCommandOptions = {},
): Promise<LedgerSearchCommandResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new LedgerError("invalid-argument", "Search query must not be empty");
  }
  const documents = await readLedgerDocuments(workspace);
  return {
    query: normalizedQuery,
    matches: searchLedgerDocuments(workspace, documents, normalizedQuery, {
      limit: options.limit,
    }),
  };
}

export function formatLedgerSearchResult(result: LedgerSearchCommandResult): string {
  const lines = [`Ledger search: ${result.matches.length} match(es).`];
  for (const match of result.matches) {
    lines.push(`- ${match.id} ${match.title} (${match.kind}, ${match.status})`);
    lines.push(`  Path: ${match.path}`);
    lines.push(`  Score: ${match.score}; fields: ${match.matchedFields.join(", ")}`);
    if (match.document.files.length > 0) lines.push(`  Files: ${match.document.files.join(", ")}`);
    if (match.document.docs.length > 0) lines.push(`  Docs: ${match.document.docs.join(", ")}`);
    if (match.document.symbols.length > 0) lines.push(`  Symbols: ${match.document.symbols.join(", ")}`);
  }
  return lines.join("\n");
}
