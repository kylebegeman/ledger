import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction, hashFileContent, type LedgerFileChange } from "./fileTransaction.js";
import {
  replaceSectionBody,
  setFrontmatterArray,
  setFrontmatterScalars,
} from "./frontmatterEdit.js";
import { LedgerError } from "./machine.js";
import { inferAreas, slugify } from "./newEntry.js";
import { nextRecordId } from "./authoring.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import { isExpiredSession } from "./stale.js";
import { renderLedgerTemplate } from "./template.js";
import type {
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";
import { sessionTemplate, sessionTemplatePlaceholders } from "./workspace.js";

/** Session lifecycle statuses written by Ledger. */
export const sessionStatuses = ["active", "closed", "promoted"] as const;
export type LedgerSessionStatus = (typeof sessionStatuses)[number];

/** Sections an agent may append notes to. */
export const sessionNoteSections = ["Summary", "Learned", "Next"] as const;
export type LedgerSessionNoteSection = (typeof sessionNoteSections)[number];

const sessionPlaceholderLines = new Set(sessionTemplatePlaceholders);

export interface SessionRecord {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly status: string;
  readonly expires?: string;
  readonly host?: string;
  readonly hostSession?: string;
  readonly areas: readonly string[];
  readonly files: readonly string[];
  readonly related: readonly string[];
}

export interface SessionSelector {
  /** Explicit session record id. */
  readonly id?: string;
  /** Host-assigned session identifier stored in the record. */
  readonly hostSession?: string;
}

export interface StartSessionOptions extends SessionSelector {
  readonly title?: string;
  readonly host?: string;
  readonly areas?: readonly string[];
  /** Days until the record expires. Defaults to the configured value. */
  readonly expiresInDays?: number;
}

export interface StartSessionResult {
  readonly session: SessionRecord;
  /** False when an active session already matched the selector. */
  readonly created: boolean;
}

/**
 * Start a session record, or return the active record that already matches
 * the host session id so hooks can call this on every SessionStart.
 */
export async function startSession(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: StartSessionOptions = {},
): Promise<StartSessionResult> {
  if (options.hostSession || options.id) {
    const existing = findSession(documents, options, { activeOnly: true });
    if (existing) return { session: toSessionRecord(existing.normalized), created: false };
  }
  const draft = await draftSession(workspace, documents, options);
  await applyFileTransaction(workspace, "start session", [
    { path: draft.path, content: draft.content, expectedHash: null },
  ]);
  return { session: draft.session, created: true };
}

interface DraftedSession {
  readonly path: string;
  readonly content: string;
  readonly session: SessionRecord;
}

async function draftSession(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: StartSessionOptions,
): Promise<DraftedSession> {
  const { ids, source, sessions } = workspace.config;
  const id = nextRecordId(documents, "session", ids.sessionPrefix, ids.sessionWidth);
  const today = isoDate(new Date());
  const days = options.expiresInDays ?? sessions.expiresInDays;
  const expires = isoDate(addDays(new Date(), days));
  const title = options.title?.trim() || defaultSessionTitle(options.host, today);
  const areas = options.areas ?? [];
  const template = await readSessionTemplate(workspace);
  let content = renderLedgerTemplate(template, {
    scalars: { id, title, date: today, status: "active", expires },
    arrays: { areas, files: [] },
  });
  const scalars: Record<string, string> = {};
  if (options.host) scalars.host = options.host;
  if (options.hostSession) scalars.hostSession = options.hostSession;
  if (Object.keys(scalars).length > 0) content = setFrontmatterScalars(content, scalars);
  const relativePath = normalizePath(path.join(source.sessions, `${id}-${slugify(title)}.md`));
  return {
    path: relativePath,
    content,
    session: {
      id,
      path: relativePath,
      title,
      status: "active",
      expires,
      host: options.host,
      hostSession: options.hostSession,
      areas,
      files: [],
      related: [],
    },
  };
}

export interface TouchSessionOptions extends SessionSelector {
  readonly host?: string;
}

export interface TouchSessionResult {
  readonly session: SessionRecord;
  /** Paths that were not already recorded. */
  readonly added: readonly string[];
  /** True when no active session matched and one was started. */
  readonly created: boolean;
}

/**
 * Record touched paths on the active session. Starts a session when none
 * matches so a hook installed mid-session still captures paths.
 */
export async function touchSession(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  paths: readonly string[],
  options: TouchSessionOptions = {},
): Promise<TouchSessionResult> {
  const normalizedPaths = [...new Set(paths.map(normalizePath).filter((value) => value.length > 0))];
  const existing = findSession(documents, options, { activeOnly: true });
  if (!existing) {
    const draft = await draftSession(workspace, documents, {
      host: options.host,
      hostSession: options.hostSession,
    });
    const content = withSessionFiles(workspace, draft.content, [], normalizedPaths);
    await applyFileTransaction(workspace, "touch session", [
      { path: draft.path, content, expectedHash: null },
    ]);
    return {
      session: { ...draft.session, files: normalizedPaths, areas: inferSessionAreas(workspace, normalizedPaths) },
      added: normalizedPaths,
      created: true,
    };
  }

  const { parsed, normalized } = existing;
  const added = normalizedPaths.filter((value) => !normalized.files.includes(value));
  if (added.length === 0) return { session: toSessionRecord(normalized), added, created: false };
  const files = [...normalized.files, ...added];
  const content = withSessionFiles(workspace, parsed.raw, normalized.areas, files);
  await applyFileTransaction(workspace, "touch session", [
    { path: normalizePath(parsed.relativePath), content, expectedHash: hashFileContent(parsed.raw) },
  ]);
  return {
    session: { ...toSessionRecord(normalized), files, areas: inferSessionAreas(workspace, files, normalized.areas) },
    added,
    created: false,
  };
}

function withSessionFiles(
  workspace: LedgerWorkspace,
  content: string,
  existingAreas: readonly string[],
  files: readonly string[],
): string {
  let next = setFrontmatterArray(content, "files", files);
  next = setFrontmatterArray(next, "areas", inferSessionAreas(workspace, files, existingAreas));
  return setFrontmatterScalars(next, { updated: isoDate(new Date()) });
}

function inferSessionAreas(
  workspace: LedgerWorkspace,
  files: readonly string[],
  existing: readonly string[] = [],
): readonly string[] {
  const inferred = inferAreas(
    workspace,
    files.map((filePath) => ({ path: filePath, status: "modified" as const })),
  );
  return [...new Set([...existing, ...inferred])].sort();
}

export interface NoteSessionOptions extends SessionSelector {
  readonly section?: LedgerSessionNoteSection;
}

export interface NoteSessionResult {
  readonly session: SessionRecord;
  readonly section: LedgerSessionNoteSection;
  readonly bullets: readonly string[];
}

/** Append a bullet to a session section, replacing template placeholders. */
export async function noteSession(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  text: string,
  options: NoteSessionOptions = {},
): Promise<NoteSessionResult> {
  const note = text.trim().replace(/\s+/g, " ");
  if (!note) throw new LedgerError("invalid-argument", "Session note must not be empty");
  const { parsed, normalized } = requireSession(documents, options, { activeOnly: true });
  const section = options.section ?? "Learned";
  const existing = extractBullets(getSectionBody(parsed, section)).filter(
    (bullet) => !sessionPlaceholderLines.has(bullet),
  );
  const bullets = existing.includes(note) ? existing : [...existing, note];
  let content = replaceSectionBody(parsed.raw, section, bullets.map((bullet) => `- ${bullet}`).join("\n"));
  content = setFrontmatterScalars(content, { updated: isoDate(new Date()) });
  await applyFileTransaction(workspace, "note session", [
    { path: normalizePath(parsed.relativePath), content, expectedHash: hashFileContent(parsed.raw) },
  ]);
  return { session: toSessionRecord(normalized), section, bullets };
}

export interface CloseSessionResult {
  readonly session: SessionRecord;
  /** False when the session was already closed or promoted. */
  readonly changed: boolean;
}

/** Mark the active session closed. Closed sessions still expire and can be promoted. */
export async function closeSession(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: SessionSelector = {},
): Promise<CloseSessionResult> {
  const { parsed, normalized } = requireSession(documents, options, { activeOnly: false });
  if (normalized.status !== "active") {
    return { session: toSessionRecord(normalized), changed: false };
  }
  const content = setFrontmatterScalars(parsed.raw, { status: "closed", updated: isoDate(new Date()) });
  await applyFileTransaction(workspace, "close session", [
    { path: normalizePath(parsed.relativePath), content, expectedHash: hashFileContent(parsed.raw) },
  ]);
  return { session: { ...toSessionRecord(normalized), status: "closed" }, changed: true };
}

export interface PruneSessionsResult {
  readonly today: string;
  readonly expired: readonly SessionRecord[];
  /** Paths removed when `write` was set. */
  readonly removed: readonly string[];
}

/** List expired session records and delete them when asked. */
export async function pruneSessions(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: { readonly write: boolean },
): Promise<PruneSessionsResult> {
  const today = isoDate(new Date());
  const expired = documents
    .map((parsed) => ({ parsed, normalized: normalizeDocument(parsed) }))
    .filter(({ normalized }) => isExpiredSession(normalized, today));
  const records = expired.map(({ normalized }) => toSessionRecord(normalized));
  if (!options.write || expired.length === 0) return { today, expired: records, removed: [] };
  const changes: LedgerFileChange[] = expired.map(({ parsed }) => ({
    path: normalizePath(parsed.relativePath),
    delete: true,
    expectedHash: hashFileContent(parsed.raw),
  }));
  const result = await applyFileTransaction(workspace, "prune expired sessions", changes);
  return { today, expired: records, removed: result.changedPaths };
}

export interface FoundSession {
  readonly parsed: ParsedLedgerDocument;
  readonly normalized: NormalizedLedgerDocument;
}

/**
 * Resolve a session record: by id, by host session id, or the most recently
 * updated active session when nothing more specific is given.
 */
export function findSession(
  documents: readonly ParsedLedgerDocument[],
  selector: SessionSelector,
  options: { readonly activeOnly: boolean },
): FoundSession | undefined {
  const sessions = documents
    .filter((document) => document.kind === "session")
    .map((parsed) => ({ parsed, normalized: normalizeDocument(parsed) }));
  if (selector.id) {
    return sessions.find(({ normalized }) => normalized.id === selector.id);
  }
  const candidates = options.activeOnly
    ? sessions.filter(({ normalized }) => normalized.status === "active")
    : sessions;
  if (selector.hostSession) {
    return candidates.find(({ normalized }) => normalized.hostSession === selector.hostSession);
  }
  return [...candidates].sort(
    (left, right) =>
      (right.normalized.updated ?? right.normalized.date).localeCompare(left.normalized.updated ?? left.normalized.date) ||
      right.normalized.id.localeCompare(left.normalized.id),
  )[0];
}

function requireSession(
  documents: readonly ParsedLedgerDocument[],
  selector: SessionSelector,
  options: { readonly activeOnly: boolean },
): FoundSession {
  const found = findSession(documents, selector, options);
  if (!found) {
    const label = selector.id
      ? `session ${selector.id}`
      : selector.hostSession
        ? `an active session for host session ${selector.hostSession}`
        : "an active session";
    throw new LedgerError("record-not-found", `Could not find ${label}; start one with ledger session start`, {
      id: selector.id,
      hostSession: selector.hostSession,
    });
  }
  if (selector.id && options.activeOnly && found.normalized.status !== "active") {
    throw new LedgerError("invalid-argument", `Session ${selector.id} is ${found.normalized.status}, not active`, {
      id: selector.id,
      status: found.normalized.status,
    });
  }
  return found;
}

export function toSessionRecord(document: NormalizedLedgerDocument): SessionRecord {
  return {
    id: document.id,
    path: document.path,
    title: document.title,
    status: document.status,
    expires: document.expires,
    host: document.host,
    hostSession: document.hostSession,
    areas: document.areas,
    files: document.files,
    related: document.related,
  };
}

async function readSessionTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/templates/session.md",
    "session template",
  );
  try {
    return await readUtf8FileLimited(templatePath, workspace.config.limits.maxDocumentBytes, "session template");
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return sessionTemplate();
  }
}

function defaultSessionTitle(host: string | undefined, date: string): string {
  return host ? `${hostLabel(host)} session ${date}` : `Session ${date}`;
}

function hostLabel(host: string): string {
  return host
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
