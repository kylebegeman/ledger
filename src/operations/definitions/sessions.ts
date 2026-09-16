import { z } from "zod";
import {
  closeSession,
  noteSession,
  pruneSessions,
  sessionNoteSections,
  startSession,
  touchSession,
  type CloseSessionResult,
  type LedgerSessionNoteSection,
  type NoteSessionResult,
  type PruneSessionsResult,
  type StartSessionResult,
  type TouchSessionResult,
} from "../../sessions.js";
import { loadDocuments, looseRecord, pathString, plural, positiveInt, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

const sessionRecordSchema = looseRecord({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  status: z.string(),
  expires: z.string().optional(),
  host: z.string().optional(),
  hostSession: z.string().optional(),
  areas: z.array(z.string()),
  files: z.array(z.string()),
  related: z.array(z.string()),
});

const selectorShape = {
  id: shortString.optional().describe("Session record id, for example S0001."),
  hostSession: shortString.optional().describe("Host session identifier stored in the record."),
};

const selectorFlags = {
  id: { type: "string", description: "Session record id." },
  "host-session": { type: "string", field: "hostSession", description: "Host session identifier." },
} as const;

interface SessionStartInput extends Record<string, unknown> {
  readonly title?: string;
  readonly host?: string;
  readonly hostSession?: string;
  readonly id?: string;
  readonly areas?: readonly string[];
  readonly expiresInDays?: number;
}

export const sessionStartOperation = defineOperation<SessionStartInput, StartSessionResult>({
  name: "session.start",
  title: "Start a session record",
  description: "Start an expiring session record, or return the active one for the same host session.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    title: z.string().max(500).optional().describe("Session title. Defaults to the host and date."),
    host: shortString.optional().describe("Agent host, for example claude-code."),
    ...selectorShape,
    areas: z.array(shortString).optional().describe("Area tags."),
    expiresInDays: positiveInt.max(3650).optional().describe("Days until the record expires."),
  }),
  output: looseRecord({ session: sessionRecordSchema, created: z.boolean() }),
  cli: {
    path: ["session", "start"],
    aliases: [["scratch"]],
    helpTopics: ["scratch"],
    usage:
      "ledger session start [title] [--host <host>] [--host-session <id>] [--id <id>] [--area <area>] [--expires-in <days>] [--json]",
    positionals: { field: "title", min: 0, join: true },
    flags: {
      host: { type: "string", description: "Agent host, for example claude-code." },
      ...selectorFlags,
      area: { type: "string[]", field: "areas", description: "Area tag (repeatable)." },
      "expires-in": { type: "number", field: "expiresInDays", description: "Days until the record expires." },
    },
    json: true,
    help: `Starts a session record under the configured sessions directory. The record
expires after sessions.expiresInDays (default 7) unless it is promoted with
ledger promote <id>. When --host-session names a host session that already has
an active record, that record is returned instead of creating another.
ledger scratch <title> is an alias for scratch notes without a host.`,
    prepare: (input) => (input.title === "" ? { ...input, title: undefined } : input),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await startSession(workspace, documents, {
      title: input.title,
      host: input.host,
      hostSession: input.hostSession,
      id: input.id,
      areas: input.areas,
      expiresInDays: input.expiresInDays,
    });
    return { data: result };
  },
  format(data) {
    return data.created
      ? `Started ${data.session.id} at ${data.session.path} (expires ${data.session.expires ?? "never"})`
      : `Active ${data.session.id} at ${data.session.path}`;
  },
});

interface SessionTouchInput extends Record<string, unknown> {
  readonly paths: readonly string[];
  readonly host?: string;
  readonly hostSession?: string;
  readonly id?: string;
}

export const sessionTouchOperation = defineOperation<SessionTouchInput, TouchSessionResult>({
  name: "session.touch",
  title: "Record touched paths",
  description: "Record touched paths on the active session record, starting one when none exists.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    paths: z.array(pathString).min(1).describe("Project-relative paths that were touched."),
    host: shortString.optional().describe("Agent host used when a session must be started."),
    ...selectorShape,
  }),
  output: looseRecord({ session: sessionRecordSchema, added: z.array(z.string()), created: z.boolean() }),
  cli: {
    path: ["session", "touch"],
    usage: "ledger session touch <path...> [--host <host>] [--host-session <id>] [--id <id>] [--json]",
    positionals: { field: "paths", min: 1 },
    flags: {
      host: { type: "string", description: "Agent host used when a session must be started." },
      ...selectorFlags,
    },
    json: true,
    help: `Appends paths to the files list of the active session and refreshes its
inferred areas. Starts a session first when no active record matches, so a
hook installed mid-session still captures paths.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await touchSession(workspace, documents, input.paths, {
      host: input.host,
      hostSession: input.hostSession,
      id: input.id,
    });
    return { data: result };
  },
  format(data) {
    const count = data.added.length;
    return `${data.created ? "Started" : "Updated"} ${data.session.id}: ${count} new ${plural(count, "path", "paths")}, ${data.session.files.length} total.`;
  },
});

interface SessionNoteInput extends Record<string, unknown> {
  readonly text: string;
  readonly section?: LedgerSessionNoteSection;
  readonly hostSession?: string;
  readonly id?: string;
}

export const sessionNoteOperation = defineOperation<SessionNoteInput, NoteSessionResult>({
  name: "session.note",
  title: "Add a session note",
  description: "Append a bullet to the Learned, Next, or Summary section of the active session.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    text: z.string().min(1).max(2000).describe("Note text."),
    section: z.enum(sessionNoteSections).optional().describe("Section to append to. Defaults to Learned."),
    ...selectorShape,
  }),
  output: looseRecord({ session: sessionRecordSchema, section: z.string(), bullets: z.array(z.string()) }),
  cli: {
    path: ["session", "note"],
    usage: "ledger session note <text> [--section <Summary|Learned|Next>] [--host-session <id>] [--id <id>] [--json]",
    positionals: { field: "text", min: 1, join: true },
    flags: {
      section: {
        type: "string",
        description: "Section to append to.",
        choices: [...sessionNoteSections],
        choicesLabel: "session section",
      },
      ...selectorFlags,
    },
    json: true,
    help: `Appends one bullet to a section of the active session record, replacing the
template placeholder on first use. Use Learned for durable facts and Next for
follow-ups the next session should pick up.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await noteSession(workspace, documents, input.text, {
      section: input.section,
      hostSession: input.hostSession,
      id: input.id,
    });
    return { data: result };
  },
  format(data) {
    return `Noted in ${data.session.id} ${data.section} (${data.bullets.length} bullets).`;
  },
});

interface SessionCloseInput extends Record<string, unknown> {
  readonly hostSession?: string;
  readonly id?: string;
}

export const sessionCloseOperation = defineOperation<SessionCloseInput, CloseSessionResult>({
  name: "session.close",
  title: "Close a session record",
  description: "Mark the active session record closed.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({ ...selectorShape }),
  output: looseRecord({ session: sessionRecordSchema, changed: z.boolean() }),
  cli: {
    path: ["session", "close"],
    usage: "ledger session close [--host-session <id>] [--id <id>] [--json]",
    flags: { ...selectorFlags },
    json: true,
    help: `Sets the session status to closed. Closed sessions keep their expiry and can
still be promoted with ledger promote <id>.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await closeSession(workspace, documents, { hostSession: input.hostSession, id: input.id });
    return { data: result };
  },
  format(data) {
    return data.changed
      ? `Closed ${data.session.id} (${data.session.files.length} touched paths).`
      : `${data.session.id} is already ${data.session.status}.`;
  },
});

interface SessionPruneInput extends Record<string, unknown> {
  readonly write?: boolean;
}

export const sessionPruneOperation = defineOperation<SessionPruneInput, PruneSessionsResult>({
  name: "session.prune",
  title: "Prune expired sessions",
  description: "List expired session records and delete them with --write.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    write: z.boolean().optional().describe("Delete the expired records."),
  }),
  output: looseRecord({
    today: z.string(),
    expired: z.array(sessionRecordSchema),
    removed: z.array(z.string()),
  }),
  cli: {
    path: ["session", "prune"],
    usage: "ledger session prune [--write] [--json]",
    flags: {
      write: { type: "boolean", description: "Delete the expired records." },
    },
    json: true,
    help: `Lists session records whose expires date has passed without promotion.
--write deletes them in one transaction. Promoted sessions are never pruned.`,
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const result = await pruneSessions(workspace, documents, { write: Boolean(input.write) });
    return { data: result };
  },
  format(data) {
    if (data.expired.length === 0) return "No expired sessions.";
    const lines = [`${data.expired.length} expired ${plural(data.expired.length, "session", "sessions")} as of ${data.today}:`];
    for (const session of data.expired) {
      lines.push(`- ${session.id} ${session.title} (expired ${session.expires ?? "unknown"}) ${session.path}`);
    }
    lines.push(data.removed.length > 0 ? `Removed ${data.removed.length}.` : "Run with --write to delete them.");
    return lines.join("\n");
  },
});
