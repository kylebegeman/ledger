import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction, hashFileContent } from "./fileTransaction.js";
import { parseMarkdownWithFrontmatter } from "./frontmatter.js";
import { ensureFrontmatterArrays, setFrontmatterArray, setFrontmatterBlock, setFrontmatterScalars } from "./frontmatterEdit.js";
import { LedgerError } from "./machine.js";
import { docsImpactLines, draftChangeEntry, slugify, type DraftedRecord, type LedgerDocsImpactInput } from "./newEntry.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import { applySectionBodies, checkSectionBodies, sectionTitles, type LedgerSectionBodies } from "./sections.js";
import { renderLedgerTemplate } from "./template.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";
import {
  backlogTemplate,
  changeTemplate,
  decisionTemplate,
  productNoteTemplate,
  releaseTemplate,
  sessionTemplate,
  sessionTemplatePlaceholders,
} from "./workspace.js";

/** Backlog status written when an item is promoted into a change entry. */
export const promotedBacklogStatus = "in-progress";

export interface CreateRecordOptions {
  readonly title: string;
  readonly areas: readonly string[];
  readonly status: string;
  readonly decisions?: readonly string[];
  readonly related?: readonly string[];
  readonly docs?: readonly string[];
  /** Caller-written section bodies, checked against the template's headings. */
  readonly sections?: LedgerSectionBodies;
  /** Render and check the record without writing it. */
  readonly dryRun?: boolean;
}

/**
 * Next sequential id for a record kind that shares a prefix, for example
 * `B008` for backlog items. Only records of the same kind count, plus, for
 * sessions, session-shaped ids that any record lists in `related`.
 */
export function nextRecordId(
  documents: readonly ParsedLedgerDocument[],
  kind: LedgerDocumentKind,
  prefix: string,
  width: number,
): string {
  const ids = documents.filter((document) => document.kind === kind).map((document) => String(document.frontmatter.id ?? ""));
  // A session id still named in a related list is never reissued, even after its record was pruned.
  if (kind === "session" && prefix) {
    for (const document of documents) ids.push(...normalizeDocument(document).related);
  }
  const max = ids
    .map((id) => sequenceNumber(id, prefix))
    .filter((value): value is number => value !== undefined)
    .reduce((current, candidate) => Math.max(current, candidate), 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

function sequenceNumber(id: string, prefix: string): number | undefined {
  if (prefix && !id.startsWith(prefix)) return undefined;
  const value = prefix ? id.slice(prefix.length) : id;
  if (!/^\d+$/.test(value)) return undefined;
  return Number.parseInt(value, 10);
}

export async function createBacklogItem(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateRecordOptions,
): Promise<string> {
  const { ids, source } = workspace.config;
  const draft = await draftRecord(workspace, {
    kind: "backlog",
    id: nextRecordId(documents, "backlog", ids.backlogPrefix, ids.backlogWidth),
    directory: source.backlog,
    templatePath: ".ledger/templates/backlog.md",
    fallbackTemplate: backlogTemplate,
    options,
  });
  if (options.dryRun) return draft.path;
  await applyFileTransaction(workspace, "create backlog item", [
    { path: draft.path, content: draft.content, expectedHash: null },
  ]);
  return draft.path;
}

export async function createDecision(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateRecordOptions,
): Promise<string> {
  const { ids, source } = workspace.config;
  const draft = await draftRecord(workspace, {
    kind: "decision",
    id: nextRecordId(documents, "decision", ids.decisionPrefix, ids.decisionWidth),
    directory: source.decisions,
    templatePath: ".ledger/templates/decision.md",
    fallbackTemplate: decisionTemplate,
    options,
  });
  if (options.dryRun) return draft.path;
  await applyFileTransaction(workspace, "create decision", [
    { path: draft.path, content: draft.content, expectedHash: null },
  ]);
  return draft.path;
}

interface DraftRecordInput {
  readonly kind: LedgerDocumentKind;
  readonly id: string;
  readonly directory: string;
  readonly templatePath: string;
  readonly fallbackTemplate: () => string;
  readonly options: CreateRecordOptions;
}

async function draftRecord(workspace: LedgerWorkspace, input: DraftRecordInput): Promise<DraftedRecord> {
  const { options } = input;
  const template = await readRecordTemplate(workspace, input.templatePath, input.kind, input.fallbackTemplate);
  const date = new Date().toISOString().slice(0, 10);
  const decisions = options.decisions ?? [];
  const related = options.related ?? [];
  const docs = (options.docs ?? []).map(normalizePath);
  const sections = options.sections
    ? checkSectionBodies(options.sections, sectionTitles(template), `A ${input.kind} record`)
    : {};
  let rendered = renderLedgerTemplate(template, {
    scalars: { id: input.id, title: options.title, date, status: options.status },
    arrays: { areas: options.areas, decisions, related, docs },
  });
  rendered = ensureFrontmatterArrays(rendered, { decisions, related, docs });
  rendered = applySectionBodies(rendered, sections);
  const relativePath = normalizePath(path.join(input.directory, `${input.id}-${slugify(options.title)}.md`));
  return { id: input.id, path: relativePath, content: rendered };
}

const kindTemplates: Record<LedgerDocumentKind, { readonly path: string; readonly fallback: () => string }> = {
  change: { path: ".ledger/templates/change.md", fallback: changeTemplate },
  backlog: { path: ".ledger/templates/backlog.md", fallback: backlogTemplate },
  decision: { path: ".ledger/templates/decision.md", fallback: decisionTemplate },
  release: { path: ".ledger/templates/release.md", fallback: releaseTemplate },
  "product-note": { path: ".ledger/templates/product-note.md", fallback: productNoteTemplate },
  feedback: { path: ".ledger/templates/product-note.md", fallback: productNoteTemplate },
  session: { path: ".ledger/templates/session.md", fallback: sessionTemplate },
};

/** The project's template for a record kind, or the built-in one when the file is missing. */
export async function readKindTemplate(workspace: LedgerWorkspace, kind: LedgerDocumentKind): Promise<string> {
  const template = kindTemplates[kind];
  return readRecordTemplate(workspace, template.path, kind, template.fallback);
}

async function readRecordTemplate(
  workspace: LedgerWorkspace,
  templatePath: string,
  kind: LedgerDocumentKind,
  fallback: () => string,
): Promise<string> {
  const label = `${kind} template`;
  const absolutePath = await resolveSafeProjectPath(workspace.projectRoot, templatePath, label);
  try {
    return await readUtf8FileLimited(absolutePath, workspace.config.limits.maxDocumentBytes, label);
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return fallback();
  }
}

export interface PromoteOptions {
  readonly title?: string;
  readonly areas?: readonly string[];
  readonly status: string;
  readonly fromDiff: boolean;
  readonly staged: boolean;
  /** Status written back to the promoted record. */
  readonly sourceStatus?: string;
  /** Caller-written section bodies for the new entry; they replace carried checks and notes. */
  readonly sections?: LedgerSectionBodies;
  /** Check the promotion and draft the entry without writing either record. */
  readonly dryRun?: boolean;
}

export interface PromoteResult {
  readonly source: {
    readonly id: string;
    readonly kind: LedgerDocumentKind;
    readonly path: string;
    readonly status: string;
  };
  readonly entry: {
    readonly id: string;
    readonly path: string;
  };
  /** Acceptance checks carried into the entry's Verification section. */
  readonly carriedChecks: readonly string[];
}

/** Session status written when a session is promoted into a change entry. */
export const promotedSessionStatus = "promoted";

/**
 * Turn a backlog item or session record into a linked draft change entry.
 * A backlog item contributes its areas, decisions, and acceptance checks
 * (as Verification bullets) and becomes `in-progress`. A session contributes
 * its touched files, areas, and Learned and Next bullets (as Notes) and
 * becomes `promoted`. The source record is updated in the same transaction.
 */
export async function promoteRecord(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  id: string,
  options: PromoteOptions,
): Promise<PromoteResult> {
  const found = findRecordById(documents, id);
  if (!found) {
    throw new LedgerError("record-not-found", `Ledger record ${id} was not found`, { id });
  }
  const { parsed, normalized } = found;
  if (normalized.kind !== "backlog" && normalized.kind !== "session") {
    throw new LedgerError(
      "invalid-argument",
      `Only backlog items and sessions can be promoted; ${id} is a ${normalized.kind} record`,
      { id, kind: normalized.kind },
    );
  }
  const isSession = normalized.kind === "session";

  const carriedChecks = isSession ? [] : extractBullets(getSectionBody(parsed, "Acceptance Checks"));
  const sessionNotes = isSession ? sessionNoteLines(parsed) : [];
  const sectionBodies: Record<string, string> = {};
  if (carriedChecks.length > 0) {
    sectionBodies.Verification = carriedChecks.map((check) => `- ${check}`).join("\n");
  }
  if (sessionNotes.length > 0) sectionBodies.Notes = sessionNotes.join("\n");
  const draft = await draftChangeEntry(workspace, documents, {
    title: options.title ?? normalized.title,
    fromDiff: options.fromDiff,
    staged: options.staged,
    areas: options.areas && options.areas.length > 0 ? options.areas : normalized.areas,
    status: options.status,
    files: isSession ? normalized.files : [],
    backlog: isSession ? normalized.backlog : [normalized.id],
    decisions: normalized.decisions,
    related: isSession ? [normalized.id, ...normalized.related] : normalized.related,
    sectionBodies,
    sections: options.sections,
  });

  const sourceStatus = options.sourceStatus ?? (isSession ? promotedSessionStatus : promotedBacklogStatus);
  let updatedSource = setFrontmatterScalars(parsed.raw, {
    status: sourceStatus,
    updated: new Date().toISOString().slice(0, 10),
  });
  if (isSession) {
    updatedSource = setFrontmatterArray(updatedSource, "related", [...new Set([...normalized.related, draft.id])]);
  }
  if (!options.dryRun) await applyFileTransaction(workspace, `promote ${normalized.id}`, [
    { path: draft.path, content: draft.content, expectedHash: null },
    {
      path: normalizePath(parsed.relativePath),
      content: updatedSource,
      expectedHash: hashFileContent(parsed.raw),
    },
  ]);

  return {
    source: {
      id: normalized.id,
      kind: normalized.kind,
      path: normalizePath(parsed.relativePath),
      status: sourceStatus,
    },
    entry: { id: draft.id, path: draft.path },
    carriedChecks,
  };
}

/** List-valued frontmatter fields `update` can replace. */
export const recordListFields = ["areas", "files", "symbols", "docs", "related", "decisions", "backlog", "tags"] as const;
export type LedgerRecordListField = (typeof recordListFields)[number];

/** Path-valued list fields, normalized to forward slashes. */
const pathListFields: ReadonlySet<LedgerRecordListField> = new Set(["files", "docs"]);

export interface UpdateRecordChanges {
  readonly title?: string;
  readonly status?: string;
  /** Lists that replace the record's current values. */
  readonly lists?: Readonly<Partial<Record<LedgerRecordListField, readonly string[]>>>;
  /** A docs impact declaration; change entries only. */
  readonly docsImpact?: LedgerDocsImpactInput;
  /** Section bodies that replace the record's sections; a template heading the record lacks is appended. */
  readonly sections?: LedgerSectionBodies;
}

export interface UpdateRecordResult {
  readonly id: string;
  readonly kind: LedgerDocumentKind;
  readonly path: string;
  /** Frontmatter fields that were written, in input order. */
  readonly fields: readonly string[];
  /** Section titles that were written. */
  readonly sections: readonly string[];
}

/**
 * Change a record in place: its title (and the matching `# id: title`
 * heading), status, list fields, docs impact, and section bodies. `updated`
 * becomes today. The file keeps its path, so links to it stay valid.
 */
export async function updateRecord(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  idOrPath: string,
  changes: UpdateRecordChanges,
  options: { readonly dryRun?: boolean } = {},
): Promise<UpdateRecordResult> {
  const found = findRecordById(documents, idOrPath) ?? findRecordByPath(documents, idOrPath);
  if (!found) {
    throw new LedgerError("record-not-found", `Ledger record ${idOrPath} was not found`, { id: idOrPath });
  }
  const { parsed, normalized } = found;
  const lists = Object.entries(changes.lists ?? {}).filter(
    (entry): entry is [LedgerRecordListField, readonly string[]] => entry[1] !== undefined,
  );
  const sectionEntries = Object.keys(changes.sections ?? {});
  if (
    changes.title === undefined &&
    changes.status === undefined &&
    lists.length === 0 &&
    changes.docsImpact === undefined &&
    sectionEntries.length === 0
  ) {
    throw new LedgerError("invalid-argument", `Nothing to update in ${normalized.id}; pass a field or a section.`, {
      id: normalized.id,
    });
  }
  if (normalized.kind !== "change") {
    if (changes.docsImpact) {
      throw new LedgerError("invalid-argument", `Only change entries declare docs impact; ${normalized.id} is a ${normalized.kind} record`, {
        id: normalized.id,
        kind: normalized.kind,
      });
    }
    if (lists.some(([field]) => field === "symbols")) {
      throw new LedgerError("invalid-argument", `Only change entries anchor symbols; ${normalized.id} is a ${normalized.kind} record`, {
        id: normalized.id,
        kind: normalized.kind,
      });
    }
  }

  const fields: string[] = [];
  const scalars: Record<string, string> = {};
  if (changes.title !== undefined) {
    scalars.title = changes.title;
    fields.push("title");
  }
  if (changes.status !== undefined) {
    scalars.status = changes.status;
    fields.push("status");
  }
  scalars.updated = new Date().toISOString().slice(0, 10);
  let content = setFrontmatterScalars(parsed.raw, scalars, `update ${normalized.id}`);
  if (changes.title !== undefined) content = retitleHeading(content, normalized.id, normalized.title, changes.title);
  for (const [field, values] of lists) {
    const cleaned = [...new Set(values.map((value) => (pathListFields.has(field) ? normalizePath(value) : value.trim())))].filter(
      (value) => value.length > 0,
    );
    content = setFrontmatterArray(content, field, cleaned);
    fields.push(field);
  }
  if (changes.docsImpact) {
    content = setFrontmatterBlock(content, "docsImpact", docsImpactLines(changes.docsImpact));
    fields.push("docsImpact");
  }
  let written: readonly string[] = [];
  if (changes.sections && sectionEntries.length > 0) {
    const template = await readKindTemplate(workspace, normalized.kind);
    const allowed = [...new Set([...parsed.sections.map((section) => section.title), ...sectionTitles(template)])];
    const sections = checkSectionBodies(changes.sections, allowed, `Record ${normalized.id}`);
    content = applySectionBodies(content, sections, { append: true });
    written = Object.keys(sections);
  }
  // A malformed result is refused before it reaches the file.
  parseMarkdownWithFrontmatter(content, parsed.relativePath);

  const recordPath = normalizePath(parsed.relativePath);
  if (!options.dryRun) {
    await applyFileTransaction(workspace, `update ${normalized.id}`, [
      { path: recordPath, content, expectedHash: hashFileContent(parsed.raw) },
    ]);
  }
  return { id: normalized.id, kind: normalized.kind, path: recordPath, fields, sections: written };
}

/** Rewrite the `# id: title` (or `# title`) heading that still carries the old title. */
function retitleHeading(markdown: string, id: string, oldTitle: string, newTitle: string): string {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const body = lines.findIndex((line, index) => index > 0 && /^---[ \t]*$/.test(line));
  const index = lines.findIndex((line, position) => position > body && /^#\s/.test(line));
  if (index < 0) return markdown;
  const heading = lines[index]!.replace(/^#\s+/, "").trim();
  const prefixed = `${id}: `;
  if (heading.startsWith(prefixed) && heading.slice(prefixed.length).trim().toLowerCase() === oldTitle.trim().toLowerCase()) {
    lines[index] = `# ${prefixed}${newTitle}`;
  } else if (heading.toLowerCase() === oldTitle.trim().toLowerCase()) {
    lines[index] = `# ${newTitle}`;
  } else {
    return markdown;
  }
  return lines.join(eol);
}

/** A record addressed by its project-relative path. */
export function findRecordByPath(
  documents: readonly ParsedLedgerDocument[],
  recordPath: string,
): { readonly parsed: ParsedLedgerDocument; readonly normalized: NormalizedLedgerDocument } | undefined {
  const wanted = normalizePath(recordPath).replace(/^\.\//, "");
  for (const parsed of documents) {
    if (normalizePath(parsed.relativePath) === wanted) return { parsed, normalized: normalizeDocument(parsed) };
  }
  return undefined;
}

export interface ReleaseNotes {
  readonly version: string;
  readonly title: string;
  readonly date: string;
  readonly status: string;
  readonly path: string;
  /** Public Notes body, or an empty string when the section is missing. */
  readonly notes: string;
}

/** Read the Public Notes of a release record for changelogs and GitHub Releases. */
export function readReleaseNotes(
  documents: readonly ParsedLedgerDocument[],
  version: string,
): ReleaseNotes {
  const found = findRecordById(documents, version);
  if (!found || found.normalized.kind !== "release") {
    throw new LedgerError("record-not-found", `Release record ${version} was not found`, { version });
  }
  const { parsed, normalized } = found;
  return {
    version: normalized.id,
    title: normalized.title,
    date: normalized.date,
    status: normalized.status,
    path: normalizePath(parsed.relativePath),
    notes: (getSectionBody(parsed, "Public Notes") ?? "").trim(),
  };
}

function sessionNoteLines(parsed: ParsedLedgerDocument): readonly string[] {
  const lines: string[] = [];
  for (const section of ["Learned", "Next"] as const) {
    const bullets = extractBullets(getSectionBody(parsed, section)).filter(
      (bullet) => !sessionTemplatePlaceholders.includes(bullet),
    );
    if (bullets.length === 0) continue;
    lines.push(`${section}:`, ...bullets.map((bullet) => `- ${bullet}`), "");
  }
  return lines.length > 0 ? lines.slice(0, -1) : lines;
}

export function findRecordById(
  documents: readonly ParsedLedgerDocument[],
  id: string,
): { readonly parsed: ParsedLedgerDocument; readonly normalized: NormalizedLedgerDocument } | undefined {
  for (const parsed of documents) {
    const normalized = normalizeDocument(parsed);
    if (normalized.id === id) return { parsed, normalized };
  }
  return undefined;
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
