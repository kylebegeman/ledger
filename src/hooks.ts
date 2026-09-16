import { realpathSync } from "node:fs";
import path from "node:path";
import { normalizeDocument, normalizePath, readLedgerDocuments } from "./documents.js";
import { applyFileTransaction, hashFileContent } from "./fileTransaction.js";
import { getChangedFileDetails } from "./git.js";
import { LedgerError } from "./machine.js";
import { buildAgentPacket, estimateTokens } from "./packet.js";
import { isPathInside } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import {
  closeSession,
  draftSessionReceipt,
  findSession,
  startSession,
  touchSession,
  type SessionRecord,
} from "./sessions.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export const hookHosts = ["claude-code", "codex", "cursor"] as const;
export type LedgerHookHost = (typeof hookHosts)[number];

export const hookEvents = ["session-start", "post-tool-use", "stop", "session-end", "pre-compact"] as const;
export type LedgerHookEvent = (typeof hookEvents)[number];

/** Default token budget for the context a SessionStart hook injects. */
export const defaultHookContextBudget = 1600;

/** Largest hook payload read from stdin. Hosts send small JSON objects. */
export const maxHookPayloadBytes = 1_000_000;

const hookCommandPattern = /\bhook\s+(session-start|post-tool-use|stop|session-end|pre-compact)\b/;

/** Host-neutral view of a hook payload. */
export interface LedgerHookPayload {
  readonly sessionId?: string;
  /** SessionStart source such as startup, resume, or compact. */
  readonly source?: string;
  readonly toolName?: string;
  /** Project-relative paths the tool touched, already filtered to the project. */
  readonly paths: readonly string[];
  readonly stopHookActive: boolean;
  readonly reason?: string;
  readonly trigger?: string;
}

/**
 * Normalize a host's stdin JSON into the fields Ledger acts on. Unknown or
 * malformed fields are ignored; paths outside the project are dropped.
 */
export function normalizeHookPayload(
  host: LedgerHookHost,
  event: LedgerHookEvent,
  raw: unknown,
  projectRoot: string,
): LedgerHookPayload {
  const payload = isRecord(raw) ? raw : {};
  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : {};
  const sessionId = firstString(payload.session_id, payload.conversation_id, payload.thread_id);
  const toolName = firstString(payload.tool_name);
  const candidates: string[] = [];
  if (event === "post-tool-use") {
    candidates.push(
      ...stringsOf(toolInput.file_path, toolInput.notebook_path, toolInput.path, payload.file_path),
      ...patchPaths(firstString(toolInput.patch, toolInput.input)),
    );
    if (Array.isArray(toolInput.edits)) {
      for (const edit of toolInput.edits) {
        if (isRecord(edit)) candidates.push(...stringsOf(edit.file_path, edit.path));
      }
    }
  }
  const cwd = firstString(payload.cwd) ?? projectRoot;
  return {
    sessionId,
    source: firstString(payload.source),
    toolName,
    paths: projectRelativePaths(candidates, projectRoot, cwd),
    stopHookActive: payload.stop_hook_active === true,
    reason: firstString(payload.reason, payload.status),
    trigger: firstString(payload.trigger),
  };
}

function patchPaths(patch: string | undefined): readonly string[] {
  if (!patch) return [];
  return [...patch.matchAll(/^\*{3} (?:Add|Update|Delete|Move to) File: (.+)$/gm)].map((match) => match[1]!.trim());
}

/**
 * Make host paths project-relative. Hosts may report a path through a
 * symlinked or aliased directory (macOS `/tmp` versus `/private/tmp`), so
 * both the project root and each candidate are compared as given and as real
 * paths before a path is dropped as outside the project.
 */
function projectRelativePaths(candidates: readonly string[], projectRoot: string, cwd: string): readonly string[] {
  const roots = uniquePaths([path.resolve(projectRoot), tryRealpath(path.resolve(projectRoot))]);
  const results = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const absolute = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(cwd, trimmed);
    const relative = relativeToAnyRoot(uniquePaths([absolute, tryRealpath(absolute)]), roots);
    if (relative && relative !== "." && !relative.startsWith(".ledger/")) results.add(relative);
  }
  return [...results];
}

function relativeToAnyRoot(candidates: readonly string[], roots: readonly string[]): string | undefined {
  for (const root of roots) {
    for (const candidate of candidates) {
      if (isPathInside(root, candidate)) return normalizePath(path.relative(root, candidate));
    }
  }
  return undefined;
}

/** Real path of a file, or of its nearest existing ancestor joined with the rest, or undefined. */
function tryRealpath(absolute: string): string | undefined {
  let current = absolute;
  const trailing: string[] = [];
  while (true) {
    try {
      const real = realpathSync.native(current);
      return trailing.length > 0 ? path.join(real, ...trailing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

function uniquePaths(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

export interface HostHookFile {
  readonly host: LedgerHookHost;
  /** Project-relative path of the host's hook configuration. */
  readonly path: string;
  /** Events the host receives, in host vocabulary. */
  readonly events: readonly string[];
  /** What the user must do after installation, if anything. */
  readonly nextSteps: readonly string[];
}

const hostHookFiles: Record<LedgerHookHost, Omit<HostHookFile, "host">> = {
  "claude-code": {
    path: ".claude/settings.json",
    events: ["SessionStart", "PostToolUse", "Stop", "SessionEnd", "PreCompact"],
    nextSteps: [
      "Confirm the hook command resolves to this Ledger: `ledger version` should print the package version. Pass --command \"npx ledger\" or \"node dist/cli.js\" when another program owns the name.",
      "Restart the Claude Code session so it reloads .claude/settings.json.",
      "Claude Code reads CLAUDE.md, not AGENTS.md; add `@AGENTS.md` to CLAUDE.md if the Ledger block lives there.",
    ],
  },
  codex: {
    path: ".codex/hooks.json",
    events: ["SessionStart", "PostToolUse", "Stop", "SessionEnd", "PreCompact"],
    nextSteps: [
      "Confirm the hook command resolves to this Ledger; pass --command when another program owns the name.",
      "Codex requires trusting the project and approving the hook definitions once with /hooks.",
      "Re-approve after editing the hook file; Codex pins a hash of each definition.",
    ],
  },
  cursor: {
    path: ".cursor/hooks.json",
    events: ["sessionStart", "afterFileEdit", "stop", "sessionEnd", "preCompact"],
    nextSteps: [
      "Confirm the hook command resolves to this Ledger; pass --command when another program owns the name.",
      "Cursor reloads .cursor/hooks.json automatically in a trusted workspace.",
    ],
  },
};

export function hostHookFile(host: LedgerHookHost): HostHookFile {
  return { host, ...hostHookFiles[host] };
}

function hookCommand(command: string, event: LedgerHookEvent, host: LedgerHookHost): string {
  return `${command} hook ${event} --host ${host}`;
}

function isLedgerHookCommand(value: unknown): boolean {
  return typeof value === "string" && hookCommandPattern.test(value);
}

/**
 * Render the host's hook file with Ledger's hooks merged in. Existing entries
 * that are not Ledger's are preserved; earlier Ledger entries are replaced.
 */
export function renderHostHooks(
  host: LedgerHookHost,
  command: string,
  existing: string | undefined,
): string {
  const current = parseExistingJson(existing, hostHookFiles[host].path);
  const rendered = host === "cursor"
    ? renderCursorHooks(current, command)
    : renderNestedHooks(current, command, host);
  return `${JSON.stringify(rendered, null, 2)}\n`;
}

function parseExistingJson(existing: string | undefined, label: string): Record<string, unknown> {
  if (!existing || existing.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch (error) {
    throw new LedgerError("invalid-argument", `${label} is not valid JSON; fix it before installing hooks`, {
      path: label,
    }, { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new LedgerError("invalid-argument", `${label} must contain a JSON object`, { path: label });
  }
  return parsed;
}

interface NestedHookGroup {
  readonly matcher?: string;
  readonly hooks: readonly Record<string, unknown>[];
}

function renderNestedHooks(
  current: Record<string, unknown>,
  command: string,
  host: "claude-code" | "codex",
): Record<string, unknown> {
  const events: Record<string, { readonly event: LedgerHookEvent; readonly matcher?: string; readonly timeout: number }> = {
    SessionStart: { event: "session-start", matcher: "startup|resume|compact", timeout: 30 },
    PostToolUse: {
      event: "post-tool-use",
      matcher: host === "codex" ? "apply_patch|Edit|Write|MultiEdit|NotebookEdit" : "Edit|Write|MultiEdit|NotebookEdit",
      timeout: 30,
    },
    Stop: { event: "stop", timeout: 60 },
    SessionEnd: { event: "session-end", timeout: 30 },
    PreCompact: { event: "pre-compact", timeout: 30 },
  };
  const existingHooks = isRecord(current.hooks) ? current.hooks : {};
  const hooks: Record<string, unknown> = { ...existingHooks };
  for (const [name, spec] of Object.entries(events)) {
    const groups = Array.isArray(existingHooks[name]) ? (existingHooks[name] as unknown[]) : [];
    const kept = groups.filter((group) => !isLedgerNestedGroup(group));
    const group: NestedHookGroup = {
      ...(spec.matcher ? { matcher: spec.matcher } : {}),
      hooks: [{ type: "command", command: hookCommand(command, spec.event, host), timeout: spec.timeout }],
    };
    hooks[name] = [...kept, group];
  }
  const result: Record<string, unknown> = { ...current, hooks };
  if (host === "codex" && typeof result.description !== "string") {
    result.description = "Ledger capture hooks";
  }
  return result;
}

function isLedgerNestedGroup(group: unknown): boolean {
  if (!isRecord(group) || !Array.isArray(group.hooks) || group.hooks.length === 0) return false;
  return group.hooks.every((hook) => isRecord(hook) && isLedgerHookCommand(hook.command));
}

function renderCursorHooks(current: Record<string, unknown>, command: string): Record<string, unknown> {
  const events: Record<string, { readonly event: LedgerHookEvent; readonly timeout: number }> = {
    sessionStart: { event: "session-start", timeout: 30 },
    afterFileEdit: { event: "post-tool-use", timeout: 30 },
    stop: { event: "stop", timeout: 60 },
    sessionEnd: { event: "session-end", timeout: 30 },
    preCompact: { event: "pre-compact", timeout: 30 },
  };
  const existingHooks = isRecord(current.hooks) ? current.hooks : {};
  const hooks: Record<string, unknown> = { ...existingHooks };
  for (const [name, spec] of Object.entries(events)) {
    const entries = Array.isArray(existingHooks[name]) ? (existingHooks[name] as unknown[]) : [];
    const kept = entries.filter((entry) => !(isRecord(entry) && isLedgerHookCommand(entry.command)));
    hooks[name] = [...kept, { type: "command", command: hookCommand(command, spec.event, "cursor"), timeout: spec.timeout }];
  }
  const version = typeof current.version === "number" ? current.version : 1;
  return { ...current, version, hooks };
}

export interface InstallHooksOptions {
  readonly host: LedgerHookHost;
  /** Command prefix that runs Ledger, for example `ledger` or `npx ledger`. */
  readonly command: string;
  readonly dryRun: boolean;
}

export interface InstallHooksResult {
  readonly host: LedgerHookHost;
  readonly path: string;
  readonly command: string;
  readonly events: readonly string[];
  readonly changed: boolean;
  readonly dryRun: boolean;
  readonly nextSteps: readonly string[];
  /** The rendered file, returned on dry runs so callers can inspect it. */
  readonly content?: string;
}

export async function installHostHooks(
  workspace: LedgerWorkspace,
  options: InstallHooksOptions,
): Promise<InstallHooksResult> {
  const file = hostHookFile(options.host);
  const existing = await readProjectFile(workspace, file.path);
  const content = renderHostHooks(options.host, options.command, existing);
  const changed = existing !== content;
  if (options.dryRun) {
    return { host: options.host, path: file.path, command: options.command, events: file.events, changed, dryRun: true, nextSteps: file.nextSteps, content };
  }
  if (changed) {
    await applyFileTransaction(workspace, `install ${options.host} hooks`, [
      { path: file.path, content, expectedHash: existing === undefined ? null : hashFileContent(existing) },
    ]);
  }
  return { host: options.host, path: file.path, command: options.command, events: file.events, changed, dryRun: false, nextSteps: file.nextSteps };
}

async function readProjectFile(workspace: LedgerWorkspace, relativePath: string): Promise<string | undefined> {
  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(path.join(workspace.projectRoot, relativePath), "utf8");
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

export interface RunHookOptions {
  readonly budgetTokens?: number;
}

export interface HookEventResult {
  readonly host: LedgerHookHost;
  readonly event: LedgerHookEvent;
  readonly session?: SessionRecord;
  /** Context injected for SessionStart. */
  readonly context?: string;
  readonly touched?: readonly string[];
  readonly entry?: { readonly id: string; readonly path: string; readonly created: boolean };
  readonly closed?: boolean;
  readonly handoffPath?: string;
  /** The JSON object written to stdout for the host. */
  readonly output: Readonly<Record<string, unknown>>;
}

/** Run one lifecycle event against the workspace and return what the host should receive. */
export async function runHookEvent(
  workspace: LedgerWorkspace,
  host: LedgerHookHost,
  event: LedgerHookEvent,
  payload: LedgerHookPayload,
  options: RunHookOptions = {},
): Promise<HookEventResult> {
  const selector = { hostSession: payload.sessionId };
  switch (event) {
    case "session-start": {
      const documents = await readLedgerDocuments(workspace);
      const started = await startSession(workspace, documents, { host, hostSession: payload.sessionId });
      const catalog = started.created ? await readLedgerDocuments(workspace) : documents;
      const context = await buildSessionStartContext(workspace, catalog, started.session, {
        source: payload.source,
        budgetTokens: options.budgetTokens ?? defaultHookContextBudget,
      });
      return { host, event, session: started.session, context, output: contextOutput(host, context) };
    }
    case "post-tool-use": {
      if (payload.paths.length === 0) return { host, event, output: {} };
      const documents = await readLedgerDocuments(workspace);
      const touched = await touchSession(workspace, documents, payload.paths, { host, hostSession: payload.sessionId });
      return { host, event, session: touched.session, touched: touched.added, output: {} };
    }
    case "stop": {
      if (payload.stopHookActive) return { host, event, output: {} };
      const documents = await readLedgerDocuments(workspace);
      const drafted = await draftSessionReceipt(workspace, documents, selector, { fromDiff: true });
      if (!drafted) return { host, event, output: {} };
      return {
        host,
        event,
        session: drafted.session,
        entry: drafted.entry,
        output: drafted.entry.created ? systemMessage(host, `Ledger drafted ${drafted.entry.path}; finish it and run ledger ready.`) : {},
      };
    }
    case "session-end": {
      const documents = await readLedgerDocuments(workspace);
      const drafted = await draftSessionReceipt(workspace, documents, selector, { fromDiff: true });
      const session = findSession(drafted ? await readLedgerDocuments(workspace) : documents, selector, { activeOnly: true });
      if (!session) return { host, event, entry: drafted?.entry, output: {} };
      const closed = await closeSession(workspace, await readLedgerDocuments(workspace), { id: session.normalized.id });
      return { host, event, session: closed.session, entry: drafted?.entry, closed: closed.changed, output: {} };
    }
    case "pre-compact": {
      const changed = await changedWorkingTreePaths(workspace);
      let documents = await readLedgerDocuments(workspace);
      let session = findSession(documents, selector, { activeOnly: true })?.normalized;
      if (changed.length > 0 || session) {
        const touched = await touchSession(workspace, documents, changed.length > 0 ? changed : [], {
          host,
          hostSession: payload.sessionId,
        }).catch(() => undefined);
        if (touched) {
          documents = await readLedgerDocuments(workspace);
          session = findSession(documents, { id: touched.session.id }, { activeOnly: false })?.normalized;
        }
      }
      if (!session) return { host, event, output: {} };
      const record = findSession(documents, { id: session.id }, { activeOnly: false });
      const handoff = await buildSessionStartContext(workspace, documents, toRecord(session), {
        source: "compact",
        budgetTokens: options.budgetTokens ?? defaultHookContextBudget,
      });
      const handoffPath = normalizePath(path.join(workspace.config.reports.output, "handoff.md"));
      await applyFileTransaction(workspace, "write session handoff", [
        { path: handoffPath, content: `${handoff}\n` },
      ]);
      return { host, event, session: record ? toRecord(record.normalized) : undefined, handoffPath, output: {} };
    }
  }
}

function toRecord(document: ReturnType<typeof normalizeDocument>): SessionRecord {
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

async function changedWorkingTreePaths(workspace: LedgerWorkspace): Promise<readonly string[]> {
  try {
    const files = await getChangedFileDetails(workspace.projectRoot);
    return files
      .map((file) => normalizePath(file.path))
      .filter((filePath) => filePath.length > 0 && !filePath.startsWith(".ledger/"));
  } catch {
    return [];
  }
}

function contextOutput(host: LedgerHookHost, context: string): Readonly<Record<string, unknown>> {
  if (host === "cursor") return { additional_context: context };
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } };
}

function systemMessage(host: LedgerHookHost, message: string): Readonly<Record<string, unknown>> {
  if (host === "cursor") return {};
  return { systemMessage: message };
}

export interface SessionStartContextOptions {
  readonly source?: string;
  readonly budgetTokens: number;
}

/**
 * The memory an agent receives when a session starts: how to use Ledger, what
 * this session already touched and learned, and the records that mention the
 * paths it is likely to edit, trimmed to the token budget.
 */
export async function buildSessionStartContext(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  session: SessionRecord,
  options: SessionStartContextOptions,
): Promise<string> {
  const budget = Math.max(200, options.budgetTokens);
  const lines: string[] = [
    `# Ledger memory for ${workspace.config.project}`,
    "",
    `Session record: ${session.id} (${session.path}). Run \`ledger packet <path> --budget 1200\` before editing a file, \`ledger session note "<fact>"\` to remember something, and \`ledger ready\` before marking a receipt landed.`,
    "",
  ];
  const sessionDoc = documents.find((document) => normalizePath(document.relativePath) === session.path);
  const learned = sessionDoc ? extractBullets(getSectionBody(sessionDoc, "Learned")) : [];
  const next = sessionDoc ? extractBullets(getSectionBody(sessionDoc, "Next")) : [];
  const resuming = options.source === "compact" || options.source === "resume" || session.files.length > 0;
  if (resuming && (session.files.length > 0 || learned.length > 0 || next.length > 0)) {
    lines.push("## This session so far", "");
    if (session.files.length > 0) lines.push(`- Touched: ${session.files.slice(0, 12).map((file) => `\`${file}\``).join(", ")}`);
    for (const bullet of learned.filter((line) => !isPlaceholder(line))) lines.push(`- Learned: ${bullet}`);
    for (const bullet of next.filter((line) => !isPlaceholder(line))) lines.push(`- Next: ${bullet}`);
    lines.push("");
  }

  const targets = session.files.length > 0 ? session.files : await changedWorkingTreePaths(workspace);
  const seen = new Set<string>(session.related);
  const packetLines: string[] = [];
  for (const target of targets.slice(0, 8)) {
    const packet = buildAgentPacket(documents, target, { maxEntries: 4, budgetTokens: 400 });
    for (const entry of packet.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      packetLines.push(`- ${entry.id} ${entry.title} (\`${entry.path}\`) mentions \`${target}\``);
      for (const invariant of entry.invariants.filter(isSubstantive).slice(0, 3)) {
        packetLines.push(`  - Invariant: ${invariant}`);
      }
      for (const rule of entry.conflictRules.filter(isSubstantive).slice(0, 2)) {
        packetLines.push(`  - On conflict: ${rule}`);
      }
    }
  }
  if (packetLines.length > 0) {
    lines.push("## Records for the paths in play", "", ...packetLines, "");
  } else {
    const recent = documents
      .map(normalizeDocument)
      .filter((document) => document.kind === "change")
      .sort((left, right) => right.id.localeCompare(left.id))
      .slice(0, 5);
    const open = documents
      .map(normalizeDocument)
      .filter((document) => document.kind === "backlog" && ["proposed", "accepted", "in-progress"].includes(document.status))
      .slice(0, 5);
    if (recent.length > 0) {
      lines.push("## Recent changes", "", ...recent.map((document) => `- ${document.id} ${document.title}${document.areas.length > 0 ? ` [${document.areas.join(", ")}]` : ""}`), "");
    }
    if (open.length > 0) {
      lines.push("## Open backlog", "", ...open.map((document) => `- ${document.id} ${document.title} (${document.status})`), "");
    }
  }

  return trimToBudget(lines, budget);
}

function isPlaceholder(line: string): boolean {
  return /^Add (facts|follow-ups)\b/.test(line);
}

/** Drop template placeholders and TODO markers from bullets shown to an agent. */
function isSubstantive(line: string): boolean {
  return !/^Add (invariants|checks)\b/.test(line) && !/\bTODO(?=\s*[:(\-]|\s*$)/i.test(line);
}

function trimToBudget(lines: readonly string[], budgetTokens: number): string {
  const kept: string[] = [];
  for (const line of lines) {
    const candidate = [...kept, line].join("\n");
    if (estimateTokens(candidate) > budgetTokens) {
      kept.push("", "(Ledger context truncated to the budget; run ledger packet for more.)");
      break;
    }
    kept.push(line);
  }
  return kept.join("\n").trimEnd();
}

export async function readStdinJson(maxBytes = maxHookPayloadBytes): Promise<unknown> {
  if (process.stdin.isTTY) return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > maxBytes) throw new LedgerError("resource-limit-exceeded", `hook payload exceeds ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function stringsOf(...values: readonly unknown[]): readonly string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === code;
}
