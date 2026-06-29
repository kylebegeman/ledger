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
  readonly release?: string;
  readonly decision?: string;
  readonly backlog?: string;
  readonly symbol?: string;
  readonly file?: string;
  readonly doc?: string;
  readonly id?: string;
  readonly text?: string;
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
      if (filters.release && document.release !== filters.release) return false;
      if (filters.decision && !document.decisions.includes(filters.decision)) return false;
      if (filters.backlog && !document.backlog.includes(filters.backlog)) return false;
      if (filters.symbol && !document.symbols.includes(filters.symbol)) return false;
      const fileFilter = filters.file;
      if (fileFilter && !document.files.some((filePath) => pathsMatch(filePath, fileFilter))) {
        return false;
      }
      const docFilter = filters.doc;
      if (docFilter && !document.docs.some((filePath) => pathsMatch(filePath, docFilter))) {
        return false;
      }
      if (filters.id && document.id !== filters.id) return false;
      if (filters.text && !documentMatchesText(document, filters.text)) return false;
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

function pathsMatch(candidate: string, target: string): boolean {
  return (
    candidate === target ||
    candidate.endsWith(`/${target}`) ||
    target.endsWith(`/${candidate}`)
  );
}

function documentMatchesText(document: NormalizedLedgerDocument, text: string): boolean {
  const normalizedText = text.trim().toLowerCase();
  if (normalizedText.length === 0) return true;
  return [
    document.id,
    document.title,
    document.status,
    document.release ?? "",
    document.path,
    ...document.areas,
    ...document.files,
    ...document.symbols,
    ...document.docs,
    ...document.decisions,
    ...document.backlog,
    ...document.sections,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedText);
}
