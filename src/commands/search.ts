import { searchLedgerCatalogCache } from "../catalogCache.js";
import { normalizePath, readLedgerDocuments } from "../documents.js";
import { searchLedgerDocuments, type LedgerSearchResult } from "../search.js";
import { LedgerError } from "../machine.js";
import type { LedgerWorkspace } from "../types.js";

export interface LedgerSearchCommandOptions {
  readonly limit?: number;
  /**
   * Narrow candidates with sqlite FTS5 before ranking. Faster on large
   * catalogs, but only records whose text contains the query words are
   * ranked, so fuzzy-only matches can be missed. Ignored when the workspace
   * does not use the sqlite cache backend.
   */
  readonly fullText?: boolean;
}

export interface LedgerSearchCommandResult {
  readonly query: string;
  readonly matches: readonly LedgerSearchResult[];
  /** How candidates were found: sqlite full-text search, or a scan of every record. */
  readonly candidates: "fts5" | "scan";
  /** Set when full-text search was requested but the cache backend cannot serve it. */
  readonly fullTextUnavailable?: boolean;
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
  const limit = options.limit ?? 10;
  if (options.fullText) {
    const fts = await searchLedgerCatalogCache(workspace, normalizedQuery, Math.max(limit * 5, 50));
    if (fts) {
      const wanted = new Set(fts.paths.map(normalizePath));
      const candidates = documents.filter((document) => wanted.has(normalizePath(document.relativePath)));
      return {
        query: normalizedQuery,
        matches: searchLedgerDocuments(workspace, candidates, normalizedQuery, { limit }),
        candidates: "fts5",
      };
    }
  }
  return {
    query: normalizedQuery,
    matches: searchLedgerDocuments(workspace, documents, normalizedQuery, { limit }),
    candidates: "scan",
    ...(options.fullText ? { fullTextUnavailable: true } : {}),
  };
}

export function formatLedgerSearchResult(result: LedgerSearchCommandResult): string {
  const note = result.candidates === "fts5"
    ? " (sqlite full-text candidates)"
    : result.fullTextUnavailable
      ? " (full-text search needs a warm sqlite cache; scanned every record)"
      : "";
  const lines = [`Ledger search: ${result.matches.length} match(es)${note}.`];
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
