/**
 * Search scoring shared by Node and the browser. `ledger search` imports it
 * directly and the reader runtime (src/reader/runtime.ts) imports it into the
 * esbuild bundle, so both rank with one implementation. Keep this file free of
 * Node-only dependencies.
 */

export interface SearchableFields {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly symbols: string;
  readonly files: string;
  readonly docs: string;
  readonly metadata: string;
  readonly context: string;
  readonly summary: string;
}

export interface SearchableDocument {
  /** Concatenated field text; derived from `fields` with `searchTermsFor` when omitted. */
  readonly terms?: string;
  readonly fields: SearchableFields;
}

/** The canonical `terms` text for a document: every field value joined in field order. */
export function searchTermsFor(fields: SearchableFields): string {
  return [
    fields.id,
    fields.title,
    fields.path,
    fields.metadata,
    fields.files,
    fields.symbols,
    fields.docs,
    fields.summary,
    fields.context,
  ].join(" ");
}

export interface SearchFieldScore {
  readonly score: number;
  readonly matchedFields: readonly string[];
}

export const searchWeights = {
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
} as const;

export type SearchField = keyof typeof searchWeights;

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().trim();
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

/** Weighted score across every search field, rounded to two decimals. */
export function scoreSearchFields(document: SearchableDocument, query: string): SearchFieldScore {
  const normalizedQuery = normalizeSearchText(query);
  const matchedFields: string[] = [];
  let score = 0;
  for (const field of Object.keys(searchWeights)) {
    const value = field === "terms" ? (document.terms ?? searchTermsFor(document.fields)) : document.fields[field as keyof SearchableFields];
    const fieldScore = fuzzyScore(normalizedQuery, normalizeSearchText(value || ""));
    if (fieldScore <= 0) continue;
    matchedFields.push(field);
    score += fieldScore * searchWeights[field as SearchField];
  }
  return { score: Math.round(score * 100) / 100, matchedFields };
}
