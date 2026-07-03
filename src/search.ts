import { buildStaticReaderModel, type LedgerSearchDocument } from "./render.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

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

const searchWeights = {
  id: 16,
  title: 14,
  path: 10,
  symbols: 9,
  files: 8,
  docs: 6,
  metadata: 5,
  context: 4,
  summary: 3,
  terms: 1,
} as const satisfies Record<keyof LedgerSearchDocument["fields"] | "terms", number>;

type SearchField = keyof typeof searchWeights;

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
  const limit = options.limit ?? 10;
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

export function scoreSearchDocument(
  document: LedgerSearchDocument,
  query: string,
): LedgerSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  const matchedFields: SearchField[] = [];
  let score = 0;
  for (const field of Object.keys(searchWeights) as SearchField[]) {
    const value = field === "terms" ? document.terms : document.fields[field];
    const fieldScore = fuzzyScore(normalizedQuery, normalizeSearchText(value));
    if (fieldScore <= 0) continue;
    matchedFields.push(field);
    score += fieldScore * searchWeights[field];
  }

  return {
    id: document.id,
    title: document.title,
    path: document.path,
    kind: document.kind,
    status: document.status,
    score: Math.round(score * 100) / 100,
    matchedFields,
    document,
  };
}

export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  if (!text) return 0;
  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(text);
  if (normalizedText.includes(normalizedQuery)) return 100 + normalizedQuery.length;

  let score = 0;
  let position = 0;
  for (const character of normalizedQuery) {
    const found = normalizedText.indexOf(character, position);
    if (found === -1) return 0;
    score += Math.max(1, 12 - (found - position));
    position = found + 1;
  }
  return score;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().trim();
}
