/**
 * Search scoring shared by Node and the browser. Everything in this file must
 * stay dependency-free and self-contained: the functions are serialized with
 * Function.prototype.toString() into the static reader runtime, so they may
 * only reference each other and `searchWeights`.
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
  readonly terms: string;
  readonly fields: SearchableFields;
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
    const value = field === "terms" ? document.terms : document.fields[field as keyof SearchableFields];
    const fieldScore = fuzzyScore(normalizedQuery, normalizeSearchText(value || ""));
    if (fieldScore <= 0) continue;
    matchedFields.push(field);
    score += fieldScore * searchWeights[field as SearchField];
  }
  return { score: Math.round(score * 100) / 100, matchedFields };
}

/**
 * The scoring functions as browser JavaScript. Embedded into the static reader
 * so the browser ranks exactly like `ledger search`.
 */
export const sharedSearchRuntime = [
  `const searchWeights = ${JSON.stringify(searchWeights)};`,
  normalizeSearchText.toString(),
  fuzzyScore.toString(),
  scoreSearchFields.toString(),
].join("\n");
