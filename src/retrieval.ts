import { coveragePatternMatches, isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { extractBullets, getSectionBody } from "./query.js";
import type {
  LedgerDocumentKind,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

/** How a record's file reference matched a retrieval target. */
export type LedgerFileMatchKind = "exact" | "pattern" | "suffix";

/** Relationship kinds a record can declare toward other records. */
export type LedgerRelationshipKind =
  | "decision"
  | "backlog"
  | "related"
  | "supersedes"
  | "superseded-by";

export interface LedgerRetrievalFileMatch {
  readonly file: string;
  readonly kind: LedgerFileMatchKind;
}

/** One record that matched a retrieval target, with everything an agent needs to act on it. */
export interface LedgerRetrievalRecord {
  readonly id: string;
  readonly kind: LedgerDocumentKind;
  readonly title: string;
  readonly status: string;
  readonly date: string;
  readonly updated?: string;
  readonly release?: string;
  readonly path: string;
  readonly areas: readonly string[];
  readonly tags: readonly string[];
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly docs: readonly string[];
  readonly decisions: readonly string[];
  readonly backlog: readonly string[];
  readonly related: readonly string[];
  readonly supersedes: readonly string[];
  readonly supersededBy: readonly string[];
  /** File references that matched the target, in record order. */
  readonly matchedFiles: readonly string[];
  readonly matches: readonly LedgerRetrievalFileMatch[];
  readonly conflictRules: readonly string[];
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
}

/** A record reached by one relationship hop from a matched record. */
export interface LedgerRetrievalRelatedRecord {
  readonly id: string;
  readonly kind: LedgerDocumentKind;
  readonly title: string;
  readonly status: string;
  readonly path: string;
  readonly via: readonly LedgerRelationshipKind[];
  /** Matched record ids that reference this record. */
  readonly from: readonly string[];
}

export interface LedgerRetrievalMissingRecord {
  readonly id: string;
  readonly via: LedgerRelationshipKind;
  readonly from: string;
}

/** The shared retrieval contract used by explain, conflict, packet, MCP, and the API. */
export interface LedgerRetrievalResult {
  readonly target: string;
  readonly records: readonly LedgerRetrievalRecord[];
  readonly related: readonly LedgerRetrievalRelatedRecord[];
  readonly missing: readonly LedgerRetrievalMissingRecord[];
}

export interface ChangedFileBlock {
  readonly title: string;
  readonly body: string;
}

/**
 * Match a target path against a record file reference. Exact paths win, then
 * coverage patterns (globs, `prefix:`, `glob:`, trailing slash), then a
 * directory suffix in either direction.
 */
export function matchFilePath(target: string, candidate: string): LedgerFileMatchKind | undefined {
  const normalizedTarget = normalizePath(target);
  const normalizedCandidate = normalizePath(candidate);
  if (normalizedCandidate === normalizedTarget) return "exact";
  if (isCoveragePattern(normalizedCandidate) && coveragePatternMatches(normalizedTarget, normalizedCandidate)) {
    return "pattern";
  }
  if (
    normalizedCandidate.endsWith(`/${normalizedTarget}`) ||
    normalizedTarget.endsWith(`/${normalizedCandidate}`)
  ) {
    return "suffix";
  }
  return undefined;
}

/** Retrieve every record whose file references match a path, plus one hop of relationships. */
export function retrieveByPath(
  documents: readonly ParsedLedgerDocument[],
  target: string,
): LedgerRetrievalResult {
  const normalizedTarget = normalizePath(target);
  const normalized = documents.map((document) => ({ parsed: document, doc: normalizeDocument(document) }));
  const supersededBy = supersededByIndex(normalized.map((item) => item.doc));

  const records: LedgerRetrievalRecord[] = [];
  for (const { parsed, doc } of normalized) {
    const matches = doc.files.flatMap((file): LedgerRetrievalFileMatch[] => {
      const kind = matchFilePath(normalizedTarget, file);
      return kind ? [{ file, kind }] : [];
    });
    if (matches.length === 0) continue;
    const matchedFiles = matches.map((match) => match.file);
    records.push({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      status: doc.status,
      date: doc.date,
      updated: doc.updated,
      release: doc.release,
      path: doc.path,
      areas: doc.areas,
      tags: doc.tags,
      files: doc.files,
      symbols: doc.symbols,
      docs: doc.docs,
      decisions: doc.decisions,
      backlog: doc.backlog,
      related: doc.related,
      supersedes: doc.supersedes,
      supersededBy: supersededBy.get(doc.id) ?? [],
      matchedFiles,
      matches,
      conflictRules: extractConflictRulesForFiles(
        getSectionBody(parsed, "Changed Files"),
        normalizedTarget,
        matchedFiles,
      ),
      invariants: extractBullets(getSectionBody(parsed, "Invariants")),
      verification: extractBullets(getSectionBody(parsed, "Verification")),
    });
  }

  const { related, missing } = relatedRecords(
    records,
    normalized.map((item) => item.doc),
    supersededBy,
  );
  return { target: normalizedTarget, records, related, missing };
}

/**
 * Resolve one hop of relationships (decisions, backlog, related, supersedes,
 * and reverse supersession) from a set of records, excluding the records
 * themselves and reporting references that do not resolve.
 */
export function relatedRecords(
  sources: readonly Pick<
    NormalizedLedgerDocument,
    "id" | "decisions" | "backlog" | "related" | "supersedes"
  >[],
  catalog: readonly NormalizedLedgerDocument[],
  supersededBy: ReadonlyMap<string, readonly string[]> = supersededByIndex(catalog),
): { readonly related: readonly LedgerRetrievalRelatedRecord[]; readonly missing: readonly LedgerRetrievalMissingRecord[] } {
  const byId = new Map(catalog.map((document) => [document.id, document]));
  const sourceIds = new Set(sources.map((source) => source.id));
  const related = new Map<string, { via: Set<LedgerRelationshipKind>; from: Set<string> }>();
  const missing: LedgerRetrievalMissingRecord[] = [];

  const visit = (from: string, id: string, via: LedgerRelationshipKind) => {
    if (sourceIds.has(id)) return;
    if (!byId.has(id)) {
      missing.push({ id, via, from });
      return;
    }
    const entry = related.get(id) ?? { via: new Set<LedgerRelationshipKind>(), from: new Set<string>() };
    entry.via.add(via);
    entry.from.add(from);
    related.set(id, entry);
  };

  for (const source of sources) {
    for (const id of source.decisions) visit(source.id, id, "decision");
    for (const id of source.backlog) visit(source.id, id, "backlog");
    for (const id of source.related) visit(source.id, id, "related");
    for (const id of source.supersedes) visit(source.id, id, "supersedes");
    for (const id of supersededBy.get(source.id) ?? []) visit(source.id, id, "superseded-by");
  }

  const relationshipOrder: readonly LedgerRelationshipKind[] = [
    "decision",
    "backlog",
    "related",
    "supersedes",
    "superseded-by",
  ];
  return {
    related: [...related.entries()]
      .map(([id, entry]) => {
        const document = byId.get(id)!;
        return {
          id,
          kind: document.kind,
          title: document.title,
          status: document.status,
          path: document.path,
          via: relationshipOrder.filter((kind) => entry.via.has(kind)),
          from: [...entry.from].sort(),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    missing: missing.sort(
      (left, right) =>
        left.id.localeCompare(right.id) || left.from.localeCompare(right.from) || left.via.localeCompare(right.via),
    ),
  };
}

/** Map each record id to the ids of records that declare they supersede it. */
export function supersededByIndex(
  catalog: readonly Pick<NormalizedLedgerDocument, "id" | "supersedes">[],
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const document of catalog) {
    for (const superseded of document.supersedes) {
      const list = index.get(superseded) ?? [];
      list.push(document.id);
      index.set(superseded, list);
    }
  }
  for (const list of index.values()) list.sort();
  return index;
}

export function extractConflictRules(markdown: string | undefined): readonly string[] {
  if (!markdown) return [];
  const rules: string[] = [];
  let current: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- On conflict:")) {
      if (current) rules.push(current);
      current = trimmed.slice("- On conflict:".length).trim();
      continue;
    }
    if (current && /^\s+\S/.test(line) && !trimmed.startsWith("- ")) {
      current = `${current} ${trimmed}`;
      continue;
    }
    if (current) {
      rules.push(current);
      current = undefined;
    }
  }

  if (current) rules.push(current);
  return rules.filter((rule) => rule.length > 0);
}

export function extractChangedFileBlocks(markdown: string | undefined): readonly ChangedFileBlock[] {
  if (!markdown) return [];

  const lines = markdown.split(/\r?\n/);
  const headings: Array<{ title: string; index: number }> = [];
  for (const [index, line] of lines.entries()) {
    const match = /^###\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    headings.push({ title: match[1]?.trim() ?? "", index });
  }

  return headings.map((heading, offset) => {
    const next = headings[offset + 1];
    return {
      title: heading.title,
      body: lines.slice(heading.index + 1, next?.index).join("\n").trim(),
    };
  });
}

/** Conflict rules from the Changed Files blocks that name the target or a matched file. */
export function extractConflictRulesForFiles(
  markdown: string | undefined,
  target: string,
  matchedFiles: readonly string[],
): readonly string[] {
  const blocks = extractChangedFileBlocks(markdown);
  if (blocks.length === 0) return extractConflictRules(markdown);

  const paths = [target, ...matchedFiles];
  return blocks
    .filter((block) => paths.some((filePath) => blockTitleMatchesPath(block.title, filePath)))
    .flatMap((block) => extractConflictRules(block.body));
}

function blockTitleMatchesPath(title: string, filePath: string): boolean {
  return titleCandidates(title).some((candidate) => {
    if (matchFilePath(filePath, candidate) !== undefined || matchFilePath(candidate, filePath) !== undefined) {
      return true;
    }
    if (candidate.includes("*")) return matchesSimpleGlob(filePath, candidate);
    return normalizePath(candidate).includes(normalizePath(filePath));
  });
}

function titleCandidates(title: string): readonly string[] {
  return title
    .replace(/`/g, "")
    .replace(/^Pattern:\s*/i, "")
    .split(/(?:,|\band\b|\bor\b)/i)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
}

function matchesSimpleGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  let source = "^";
  for (const character of normalizedPattern) {
    if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source).test(normalizedPath);
}
