import { normalizeDocument } from "./documents.js";
import type {
  LedgerDocumentKind,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export interface LedgerQueryFilters {
  readonly kind?: LedgerDocumentKind;
  readonly status?: string;
  readonly area?: string;
}

export function queryDocuments(
  documents: readonly ParsedLedgerDocument[],
  filters: LedgerQueryFilters,
): readonly NormalizedLedgerDocument[] {
  return documents
    .map(normalizeDocument)
    .filter((document) => {
      if (filters.kind && document.kind !== filters.kind) return false;
      if (filters.status && document.status !== filters.status) return false;
      if (filters.area && !document.areas.includes(filters.area)) return false;
      return true;
    });
}

export function getSectionBody(
  document: ParsedLedgerDocument,
  title: string,
): string | undefined {
  return document.sections.find((section) => section.title === title)?.body;
}

export function extractBullets(markdown: string | undefined): readonly string[] {
  if (!markdown) return [];
  const bullets: string[] = [];
  let current: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().startsWith("- ")) {
      if (current) bullets.push(current);
      current = line.trim().slice(2).trim();
      continue;
    }

    if (current && /^\s+\S/.test(line)) {
      current = `${current} ${line.trim()}`;
    }
  }

  if (current) bullets.push(current);
  return bullets.filter((line) => line.length > 0);
}

export function normalizeKindFilter(value: string | undefined): LedgerDocumentKind | undefined {
  if (
    value === "change" ||
    value === "backlog" ||
    value === "decision" ||
    value === "release"
  ) {
    return value;
  }
  return undefined;
}
