import { buildStaticReaderModel, type LedgerSearchDocument } from "./render.js";
import { fuzzyScore, normalizeSearchText, scoreSearchFields, searchWeights } from "./searchCore.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export { fuzzyScore, normalizeSearchText, scoreSearchFields, searchWeights } from "./searchCore.js";

export interface LedgerSearchOptions {
  readonly limit?: number;
}

export interface LedgerSearchResult {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly kind: string;
  readonly status: string;
  readonly score: number;
  readonly matchedFields: readonly string[];
  readonly document: LedgerSearchDocument;
}

type SearchField = keyof typeof searchWeights;
const _weightsCoverEveryField: Record<keyof LedgerSearchDocument["fields"] | "terms", number> = searchWeights;
void _weightsCoverEveryField;

export function searchLedgerDocuments(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  query: string,
  options: LedgerSearchOptions = {},
): readonly LedgerSearchResult[] {
  const model = buildStaticReaderModel(workspace, documents);
  return searchLedgerIndex(model.searchIndex, query, options);
}

export function searchLedgerIndex(
  index: readonly LedgerSearchDocument[],
  query: string,
  options: LedgerSearchOptions = {},
): readonly LedgerSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const limit = validLimit(options.limit) ?? 10;
  return index
    .map((document) => scoreSearchDocument(document, normalizedQuery))
    .filter((result): result is LedgerSearchResult => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.id.localeCompare(right.id) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, limit);
}

function validLimit(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return undefined;
  return Math.floor(value);
}

export function scoreSearchDocument(
  document: LedgerSearchDocument,
  query: string,
): LedgerSearchResult {
  const { score, matchedFields } = scoreSearchFields(document, query);
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    kind: document.kind,
    status: document.status,
    score,
    matchedFields: matchedFields as SearchField[],
    document,
  };
}
