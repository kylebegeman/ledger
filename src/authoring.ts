import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction, hashFileContent } from "./fileTransaction.js";
import { ensureFrontmatterArrays, setFrontmatterScalars } from "./frontmatterEdit.js";
import { LedgerError } from "./machine.js";
import { draftChangeEntry, slugify, type DraftedRecord } from "./newEntry.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import { renderLedgerTemplate } from "./template.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";
import { backlogTemplate, decisionTemplate } from "./workspace.js";

/** Backlog status written when an item is promoted into a change entry. */
export const promotedBacklogStatus = "in-progress";

export interface CreateRecordOptions {
  readonly title: string;
  readonly areas: readonly string[];
  readonly status: string;
  readonly decisions?: readonly string[];
  readonly related?: readonly string[];
  readonly docs?: readonly string[];
}

/**
 * Next sequential id for a record kind that shares a prefix, for example
 * `B008` for backlog items. Only records of the same kind count.
 */
export function nextRecordId(
  documents: readonly ParsedLedgerDocument[],
  kind: LedgerDocumentKind,
  prefix: string,
  width: number,
): string {
  const max = documents
    .filter((document) => document.kind === kind)
    .map((document) => sequenceNumber(String(document.frontmatter.id ?? ""), prefix))
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
  let rendered = renderLedgerTemplate(template, {
    scalars: { id: input.id, title: options.title, date, status: options.status },
    arrays: { areas: options.areas, decisions, related, docs },
  });
  rendered = ensureFrontmatterArrays(rendered, { decisions, related, docs });
  const relativePath = normalizePath(path.join(input.directory, `${input.id}-${slugify(options.title)}.md`));
  return { id: input.id, path: relativePath, content: rendered };
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

/**
 * Turn a backlog item into a linked draft change entry. The entry carries the
 * item's areas, decisions, and acceptance checks; the item's status is updated
 * in the same transaction.
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
  if (normalized.kind !== "backlog") {
    throw new LedgerError(
      "invalid-argument",
      `Only backlog items can be promoted; ${id} is a ${normalized.kind} record`,
      { id, kind: normalized.kind },
    );
  }

  const carriedChecks = extractBullets(getSectionBody(parsed, "Acceptance Checks"));
  const draft = await draftChangeEntry(workspace, documents, {
    title: options.title ?? normalized.title,
    fromDiff: options.fromDiff,
    staged: options.staged,
    areas: options.areas && options.areas.length > 0 ? options.areas : normalized.areas,
    status: options.status,
    backlog: [normalized.id],
    decisions: normalized.decisions,
    related: normalized.related,
    sectionBodies: carriedChecks.length > 0
      ? { Verification: carriedChecks.map((check) => `- ${check}`).join("\n") }
      : {},
  });

  const sourceStatus = options.sourceStatus ?? promotedBacklogStatus;
  const updatedSource = setFrontmatterScalars(parsed.raw, {
    status: sourceStatus,
    updated: new Date().toISOString().slice(0, 10),
  });
  await applyFileTransaction(workspace, `promote ${normalized.id}`, [
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
