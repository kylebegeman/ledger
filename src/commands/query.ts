import { readLedgerDocuments } from "../documents.js";
import {
  normalizeKindFilter,
  queryDocuments,
  type LedgerQueryFilters,
} from "../query.js";
import type { LedgerWorkspace, NormalizedLedgerDocument } from "../types.js";

export interface LedgerQueryCommandResult {
  readonly matches: readonly NormalizedLedgerDocument[];
}

export async function runLedgerQueryCommand(
  workspace: LedgerWorkspace,
  filters: LedgerQueryFilters,
): Promise<LedgerQueryCommandResult> {
  const documents = await readLedgerDocuments(workspace);
  return {
    matches: queryDocuments(documents, {
      ...filters,
      kind: normalizeKindFilter(filters.kind),
    }),
  };
}

export function formatLedgerQueryResult(result: LedgerQueryCommandResult): string {
  const lines = [`Ledger query: ${result.matches.length} match(es).`];
  for (const document of result.matches) {
    lines.push(`- ${document.id} ${document.title} (${document.kind}, ${document.status})`);
    if (document.release) lines.push(`  Release: ${document.release}`);
    if (document.areas.length > 0) lines.push(`  Areas: ${document.areas.join(", ")}`);
    if (document.tags.length > 0) lines.push(`  Tags: ${document.tags.join(", ")}`);
    if (document.files.length > 0) lines.push(`  Files: ${document.files.join(", ")}`);
    if (document.symbols.length > 0) lines.push(`  Symbols: ${document.symbols.join(", ")}`);
    if (document.docs.length > 0) lines.push(`  Docs: ${document.docs.join(", ")}`);
  }
  return lines.join("\n");
}
