import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { coveragePatternMatches } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction, hashFileContent, type LedgerFileChange } from "./fileTransaction.js";
import {
  replaceSectionBody,
  setFrontmatterArray,
  setFrontmatterScalars,
} from "./frontmatterEdit.js";
import { LedgerError } from "./machine.js";
import { defaultDraftTitle, draftChangeEntry, inferAreas, slugify } from "./newEntry.js";
import { nextRecordId } from "./authoring.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import { expiredSessions, isExpiredSession } from "./stale.js";
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
 * the host session id so hooks can call this on every SessionStart. An
 * active record past `expires` no longer matches; the new record copies the
 * `related` list of the most recent expired record for the host session so
 * the receipts linked to the dead tab stay linked to the work that continues.
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
  const related = inheritedRelated(documents, options.hostSession);
  const draft = await draftSession(workspace, documents, options);
  const content = related.length > 0 ? setFrontmatterArray(draft.content, "related", related) : draft.content;
  await applyFileTransaction(workspace, "start session", [
    { path: draft.path, content, expectedHash: null },
  ]);
  return { session: { ...draft.session, related }, created: true };
}

/** The `related` list a replacement record inherits from the host session's expired record, if any. */
function inheritedRelated(documents: readonly ParsedLedgerDocument[], hostSession: string | undefined): readonly string[] {
  if (!hostSession) return [];
  return findExpiredActiveSession(documents, hostSession)?.normalized.related ?? [];
}

/**
 * The most recent record for a host session that is still `active` but past
 * its `expires` date. Hosts such as the Claude desktop app may never fire
 * SessionEnd, so a tab can outlive its record; the replacement record inherits
 * this one's links, and a late SessionEnd can still close it.
 */
export function findExpiredActiveSession(
  documents: readonly ParsedLedgerDocument[],
  hostSession: string,
): FoundSession | undefined {
  const today = isoDate(new Date());
  return documents
    .filter((document) => document.kind === "session")
    .map((parsed) => ({ parsed, normalized: normalizeDocument(parsed) }))
    .filter(
      ({ normalized }) =>
        normalized.hostSession === hostSession && normalized.status === "active" && isExpiredSession(normalized, today),
    )
    .sort((left, right) => right.normalized.id.localeCompare(left.normalized.id))[0];
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
    // A touch after the host session's record expired starts a replacement that keeps its links.
    const related = inheritedRelated(documents, options.hostSession);
    const draft = await draftSession(workspace, documents, {
      host: options.host,
      hostSession: options.hostSession,
    });
    let content = withSessionFiles(workspace, draft.content, [], normalizedPaths);
    if (related.length > 0) content = setFrontmatterArray(content, "related", related);
    await applyFileTransaction(workspace, "touch session", [
      { path: draft.path, content, expectedHash: null },
    ]);
    return {
      session: {
        ...draft.session,
        files: normalizedPaths,
        areas: inferSessionAreas(workspace, normalizedPaths),
        related,
      },
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

export interface SessionReceiptResult {
  readonly session: SessionRecord;
  readonly entry: { readonly id: string; readonly path: string; readonly created: boolean };
}

/**
 * Draft the change entry for a session, or refresh the draft already linked
 * to it. Returns undefined when the session has touched nothing. The session
 * stays active so later touches keep flowing into the same draft.
 *
 * Every change entry the session lists in `related` counts as linked, whatever
 * its status. Touched paths that no linked entry's `files` cover (patterns such
 * as `src/**` count) go to the linked draft when one exists; when every path is
 * covered nothing is written and the most recent linked entry is returned with
 * `created: false`; otherwise a new draft is created for the uncovered paths,
 * related to the session and the earlier receipts. With `fromDiff` the new
 * draft's file list still follows the Git working tree.
 */
export async function draftSessionReceipt(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  selector: SessionSelector,
  options: { readonly fromDiff: boolean },
): Promise<SessionReceiptResult | undefined> {
  const found = findSession(documents, selector, { activeOnly: true });
  if (!found || found.normalized.files.length === 0) return undefined;
  const { parsed, normalized } = found;
  const today = isoDate(new Date());

  const linked = documents
    .map((document) => ({ parsed: document, normalized: normalizeDocument(document) }))
    .filter(({ parsed: candidate, normalized: entry }) => candidate.kind === "change" && normalized.related.includes(entry.id));
  const uncovered = normalized.files.filter(
    (file) => !linked.some(({ normalized: entry }) => entry.files.some((pattern) => coveragePatternMatches(file, pattern))),
  );
  const linkedDraft = linked.find(({ normalized: entry }) => entry.status === "draft");
  if (linkedDraft) {
    const entry = { id: linkedDraft.normalized.id, path: normalizePath(linkedDraft.parsed.relativePath), created: false };
    if (uncovered.length === 0) return { session: toSessionRecord(normalized), entry };
    const files = [...new Set([...linkedDraft.normalized.files, ...uncovered])];
    let content = setFrontmatterArray(linkedDraft.parsed.raw, "files", files);
    content = setFrontmatterScalars(content, { updated: today });
    await applyFileTransaction(workspace, `refresh receipt for ${normalized.id}`, [
      { path: entry.path, content, expectedHash: hashFileContent(linkedDraft.parsed.raw) },
    ]);
    return { session: toSessionRecord(normalized), entry };
  }
  if (linked.length > 0 && uncovered.length === 0) {
    const latest = [...linked].sort((left, right) => right.normalized.id.localeCompare(left.normalized.id))[0]!;
    return {
      session: toSessionRecord(normalized),
      entry: { id: latest.normalized.id, path: normalizePath(latest.parsed.relativePath), created: false },
    };
  }

  const notes = sessionNoteLines(parsed);
  const sectionBodies: Record<string, string> = notes.length > 0 ? { Notes: notes.join("\n") } : {};
  const entryOptions = {
    title: sessionSummaryTitle(parsed) ?? defaultDraftTitle(normalized.areas, uncovered),
    staged: false,
    areas: normalized.areas,
    status: "draft",
    files: uncovered,
    related: [normalized.id, ...linked.map(({ normalized: entry }) => entry.id)],
    sectionBodies,
  };
  let draft;
  try {
    draft = await draftChangeEntry(workspace, documents, { ...entryOptions, fromDiff: options.fromDiff });
  } catch (error) {
    if (!options.fromDiff) throw error;
    draft = await draftChangeEntry(workspace, documents, { ...entryOptions, fromDiff: false });
  }
  let session = setFrontmatterArray(parsed.raw, "related", [...new Set([...normalized.related, draft.id])]);
  session = setFrontmatterScalars(session, { updated: today });
  await applyFileTransaction(workspace, `draft receipt for ${normalized.id}`, [
    { path: draft.path, content: draft.content, expectedHash: null },
    { path: normalizePath(parsed.relativePath), content: session, expectedHash: hashFileContent(parsed.raw) },
  ]);
  return {
    session: { ...toSessionRecord(normalized), related: [...normalized.related, draft.id] },
    entry: { id: draft.id, path: draft.path, created: true },
  };
}

/** The first Summary line of a session that is not the template placeholder, as a receipt title. */
function sessionSummaryTitle(parsed: ParsedLedgerDocument): string | undefined {
  const body = getSectionBody(parsed, "Summary") ?? "";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (line.length === 0 || sessionPlaceholderLines.has(line)) continue;
    return line;
  }
  return undefined;
}

function sessionNoteLines(parsed: ParsedLedgerDocument): readonly string[] {
  const lines: string[] = [];
  for (const section of ["Learned", "Next"] as const) {
    const bullets = extractBullets(getSectionBody(parsed, section)).filter(
      (bullet) => !sessionPlaceholderLines.has(bullet),
    );
    if (bullets.length === 0) continue;
    lines.push(`${section}:`, ...bullets.map((bullet) => `- ${bullet}`), "");
  }
  return lines.length > 0 ? lines.slice(0, -1) : lines;
}

export interface KeptSession {
  readonly session: SessionRecord;
  /** Ids of the records that link this session through `related`. */
  readonly linkedBy: readonly string[];
  /** Whether prune closed this session because it was still active. */
  readonly closed: boolean;
}

export interface PruneSessionsResult {
  readonly today: string;
  /** Expired sessions no record links; `write` deletes them. */
  readonly expired: readonly SessionRecord[];
  /** Expired sessions another record links, which are never deleted. */
  readonly kept: readonly KeptSession[];
  /** Paths removed when `write` was set. */
  readonly removed: readonly string[];
}

/**
 * List expired session records and, when asked, delete those no record links
 * and close the linked ones that are still active, in one transaction.
 */
export async function pruneSessions(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: { readonly write: boolean },
): Promise<PruneSessionsResult> {
  const today = isoDate(new Date());
  const entries = documents.map((parsed) => ({ parsed, normalized: normalizeDocument(parsed) }));
  const { prunable, retained } = expiredSessions(entries.map(({ normalized }) => normalized), today);
  // Match by document, not id, so a record sharing an id with an expired one is never touched.
  const prunableDocuments = new Set(prunable);
  const expired = entries.filter(({ normalized }) => prunableDocuments.has(normalized));
  const keptEntries = entries.filter(
    ({ normalized }) => isExpiredSession(normalized, today) && retained.has(normalized.id),
  );
  const records = expired.map(({ normalized }) => toSessionRecord(normalized));
  const keptRecords = (closing: boolean): KeptSession[] =>
    keptEntries.map(({ normalized }) => {
      const closed = closing && normalized.status === "active";
      const session = toSessionRecord(normalized);
      return { session: closed ? { ...session, status: "closed" } : session, linkedBy: retained.get(normalized.id)!, closed };
    });
  const closable = keptEntries.filter(({ normalized }) => normalized.status === "active");
  if (!options.write || (expired.length === 0 && closable.length === 0)) {
    return { today, expired: records, kept: keptRecords(false), removed: [] };
  }
  const changes: LedgerFileChange[] = [
    ...expired.map(({ parsed }): LedgerFileChange => ({
      path: normalizePath(parsed.relativePath),
      delete: true,
      expectedHash: hashFileContent(parsed.raw),
    })),
    ...closable.map(({ parsed }) => ({
      path: normalizePath(parsed.relativePath),
      content: setFrontmatterScalars(parsed.raw, { status: "closed", updated: today }),
      expectedHash: hashFileContent(parsed.raw),
    })),
  ];
  const result = await applyFileTransaction(workspace, "prune expired sessions", changes);
  const deleted = new Set(expired.map(({ parsed }) => normalizePath(parsed.relativePath)));
  return {
    today,
    expired: records,
    kept: keptRecords(true),
    removed: result.changedPaths.filter((changed) => deleted.has(changed)),
  };
}

export interface FoundSession {
  readonly parsed: ParsedLedgerDocument;
  readonly normalized: NormalizedLedgerDocument;
}

/**
 * Resolve a session record: by id, by host session id, or the most recently
 * updated active session when nothing more specific is given. With
 * `activeOnly`, an active record whose `expires` date is before today is
 * treated as inactive, so a tab whose host never fired SessionEnd stops
 * receiving touches, notes, and drafts; a by-id lookup still reaches it.
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
  const today = isoDate(new Date());
  const candidates = options.activeOnly
    ? sessions.filter(({ normalized }) => normalized.status === "active" && !isExpiredSession(normalized, today))
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
