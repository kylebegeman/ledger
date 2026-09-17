import { realpathSync } from "node:fs";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { agentsCommandRule, isValidAgentsCommand, renderConfigWithAgentsCommand } from "./config.js";
import { normalizeDocument, normalizePath, readLedgerDocuments } from "./documents.js";
import { applyFileTransaction, hashFileContent, type LedgerFileChange } from "./fileTransaction.js";
import { getChangedFileDetails } from "./git.js";
import { LedgerError } from "./machine.js";
import { buildAgentPacket, estimateTokens } from "./packet.js";
import { isPathInside } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import {
  closeSession,
  draftSessionReceipt,
  findExpiredActiveSession,
  findSession,
  startSession,
  touchSession,
  type SessionRecord,
} from "./sessions.js";
import { agentsBlockStart } from "./skills.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export const hookHosts = ["claude-code", "codex", "cursor"] as const;
export type LedgerHookHost = (typeof hookHosts)[number];

export const hookEvents = [
  "session-start",
  "user-prompt-submit",
  "post-tool-use",
  "stop",
  "session-end",
  "pre-compact",
] as const;
export type LedgerHookEvent = (typeof hookEvents)[number];

/** Default token budget for the context a SessionStart hook injects. */
export const defaultHookContextBudget = 1600;

/** Largest hook payload read from stdin. Hosts send small JSON objects. */
export const maxHookPayloadBytes = 1_000_000;

const hookCommandPattern = /\bhook\s+(session-start|user-prompt-submit|post-tool-use|stop|session-end|pre-compact)\b/;

/** Derived, git-ignored record of which hook drafts each host session has been told about. */
const hookNoticesFile = "hook-notices.json";

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
    // Codex puts the apply_patch body in tool_input.command, as one string or as an argv array whose
    // first word is apply_patch. Only a patch body is parsed, so a shell command that merely contains
    // patch-shaped text (a heredoc, for example) records no paths.
    const commandWords = Array.isArray(toolInput.command)
      ? toolInput.command.filter((word): word is string => typeof word === "string")
      : undefined;
    const patchBody = firstString(toolInput.command) ?? commandWords?.find((word) => beginPatchPattern.test(word));
    const patchCommand =
      patchBody !== undefined &&
      (toolName === "apply_patch" || commandWords?.[0] === "apply_patch" || beginPatchPattern.test(patchBody));
    candidates.push(
      ...stringsOf(toolInput.file_path, toolInput.notebook_path, toolInput.path, payload.file_path),
      ...patchPaths(firstString(toolInput.patch, toolInput.input)),
      ...(patchCommand ? patchPaths(patchBody) : []),
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

const beginPatchPattern = /^\s*\*\*\* Begin Patch\b/;

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

const defaultAgentsCommand = "ledger";

const hostHookFiles: Record<LedgerHookHost, Omit<HostHookFile, "host">> = {
  "claude-code": {
    path: ".claude/settings.json",
    events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd", "PreCompact"],
    nextSteps: ["Restart the Claude Code session so it reloads .claude/settings.json."],
  },
  codex: {
    path: ".codex/hooks.json",
    events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd", "PreCompact"],
    nextSteps: [
      "Codex requires trusting the project and approving the hook definitions once, with /hooks in the Codex CLI or on the Hooks page of the Codex app's settings.",
      "Approve them again whenever the hook file changes, such as a new pinned version; Codex skips a changed hook until it is trusted again.",
    ],
  },
  cursor: {
    path: ".cursor/hooks.json",
    events: ["sessionStart", "afterFileEdit", "stop", "sessionEnd", "preCompact"],
    nextSteps: ["Cursor reloads .cursor/hooks.json automatically in a trusted workspace."],
  },
};

/** The host's hook file description with next steps rendered for the command that runs Ledger. */
export function hostHookFile(host: LedgerHookHost, command = defaultAgentsCommand): HostHookFile {
  const file = hostHookFiles[host];
  const hint = command === defaultAgentsCommand
    ? " Pass --command \"npx ledger\" or \"node dist/cli.js\" when another program owns the name."
    : "";
  return {
    host,
    path: file.path,
    events: file.events,
    nextSteps: [
      `Confirm the hook command resolves to this Ledger: \`${command} version\` should print the package version.${hint}`,
      ...file.nextSteps,
    ],
  };
}

function hookCommand(command: string, event: LedgerHookEvent, host: LedgerHookHost): string {
  return `${command} hook ${event} --host ${host}`;
}

function isLedgerHookCommand(value: unknown): boolean {
  return typeof value === "string" && hookCommandPattern.test(value);
}

/**
 * The command prefix a Ledger hook entry runs, such as `npx ledger` for
 * `npx ledger hook stop --host codex`, or undefined for other commands.
 */
export function ledgerHookCommandPrefix(value: unknown): string | undefined {
  if (!isLedgerHookCommand(value)) return undefined;
  const match = /^(.*?)\s+hook\s+\S+(?:\s+--host\s+\S+)?\s*$/.exec(String(value).trim());
  return match?.[1]?.trim() || undefined;
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
    SessionStart: { event: "session-start", matcher: "startup|resume|clear|compact", timeout: 30 },
    UserPromptSubmit: { event: "user-prompt-submit", timeout: 15 },
    PostToolUse: {
      event: "post-tool-use",
      matcher: host === "codex" ? "apply_patch|Edit|Write|MultiEdit|NotebookEdit" : "Edit|Write|MultiEdit|NotebookEdit",
      timeout: 30,
    },
    Stop: { event: "stop", timeout: 60 },
    // Codex caps SessionEnd hooks at 3 seconds; Claude Code raises its budget to the per-hook timeout.
    SessionEnd: { event: "session-end", timeout: host === "codex" ? 3 : 30 },
    PreCompact: { event: "pre-compact", timeout: 30 },
  };
  const existingHooks = isRecord(current.hooks) ? current.hooks : {};
  const hooks: Record<string, unknown> = { ...existingHooks };
  for (const [name, spec] of Object.entries(events)) {
    const groups = Array.isArray(existingHooks[name]) ? (existingHooks[name] as unknown[]) : [];
    const kept = groups.flatMap((group) => withoutLedgerHooks(group));
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

/** The group without Ledger's own entries, or nothing when those were all it held, so a user's entry in Ledger's group survives a reinstall. */
function withoutLedgerHooks(group: unknown): readonly unknown[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return [group];
  const hooks = group.hooks.filter((hook) => !(isRecord(hook) && isLedgerHookCommand(hook.command)));
  if (hooks.length === group.hooks.length) return [group];
  return hooks.length === 0 ? [] : [{ ...group, hooks }];
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
  /**
   * Command prefix that runs Ledger, for example `ledger` or `npx ledger`.
   * Defaults to `agents.command` in the config and is persisted there when given.
   */
  readonly command?: string;
  /** Add the `@AGENTS.md` import to CLAUDE.md when it is missing (Claude Code only). */
  readonly importAgents?: boolean;
  readonly dryRun: boolean;
}

export interface AgentsImportResult {
  readonly path: "CLAUDE.md";
  /** Whether CLAUDE.md already imports AGENTS.md or carries the Ledger block. */
  readonly present: boolean;
  /** Whether this run added the import. */
  readonly added: boolean;
  /** Whether this run created CLAUDE.md. */
  readonly created: boolean;
}

export interface InstallHooksResult {
  readonly host: LedgerHookHost;
  readonly path: string;
  readonly command: string;
  readonly events: readonly string[];
  readonly changed: boolean;
  readonly dryRun: boolean;
  /** Whether `agents.command` was written to the config in this run. */
  readonly configured: boolean;
  /** The CLAUDE.md import check, present for Claude Code. */
  readonly agentsImport?: AgentsImportResult;
  readonly nextSteps: readonly string[];
  /** The rendered file, returned on dry runs so callers can inspect it. */
  readonly content?: string;
}

const claudeMdPath = "CLAUDE.md";
const agentsMdPath = "AGENTS.md";
const agentsImportLine = "@AGENTS.md";

/**
 * Whether CLAUDE.md loads the Ledger instructions: an `@AGENTS.md` import
 * outside code spans and fenced blocks, or the managed block itself.
 */
export function claudeMdImportsAgents(content: string): boolean {
  // Code spans open and close with a backtick run of the same length, so ``@AGENTS.md`` is a mention too.
  const stripped = content.replace(/```[\s\S]*?```/g, "").replace(/(`+)[^\n]*?\1/g, "");
  // A trailing period must end the sentence; @AGENTS.md.bak names another file.
  return /(^|\s)@(?:\.\/)?AGENTS\.md(?=$|[\s,;:)]|\.(?=\s|$))/m.test(stripped) || stripped.includes(agentsBlockStart);
}

/**
 * Install the host's hooks, persist `--command` as `agents.command`, and
 * optionally add the CLAUDE.md import, all in one file transaction.
 */
export async function installHostHooks(
  workspace: LedgerWorkspace,
  options: InstallHooksOptions,
): Promise<InstallHooksResult> {
  if (options.importAgents && options.host !== "claude-code") {
    throw new LedgerError("invalid-argument", "--import-agents applies to --host claude-code", { host: options.host });
  }
  if (options.command !== undefined && !isValidAgentsCommand(options.command)) {
    throw new LedgerError("invalid-argument", `--command ${agentsCommandRule}`, { command: options.command });
  }
  const command = options.command ?? workspace.config.agents.command;
  const file = hostHookFile(options.host, command);
  const existing = await readProjectFile(workspace, file.path);
  const content = renderHostHooks(options.host, command, existing);
  const changed = existing !== content;
  const changes: LedgerFileChange[] = [];
  if (changed) {
    changes.push({ path: file.path, content, expectedHash: existing === undefined ? null : hashFileContent(existing) });
  }

  let configChange = false;
  if (options.command !== undefined) {
    const configRelative = normalizePath(path.relative(workspace.projectRoot, workspace.configPath));
    const rawConfig = await readProjectFile(workspace, configRelative);
    if (rawConfig === undefined) {
      throw new LedgerError("invalid-config", `${configRelative} is missing; run ledger init first`, { path: configRelative });
    }
    const nextConfig = renderConfigWithAgentsCommand(rawConfig, command);
    if (nextConfig !== rawConfig) {
      changes.push({ path: configRelative, content: nextConfig, expectedHash: hashFileContent(rawConfig) });
      configChange = true;
    }
  }

  const nextSteps = [...file.nextSteps];
  let agentsImport: AgentsImportResult | undefined;
  if (options.host === "claude-code") {
    const claudeMd = await readProjectFile(workspace, claudeMdPath);
    const present = claudeMd !== undefined && claudeMdImportsAgents(claudeMd);
    if (present) {
      agentsImport = { path: claudeMdPath, present: true, added: false, created: false };
    } else if (options.importAgents) {
      const imported = claudeMd === undefined
        ? `${agentsImportLine}\n`
        : `${claudeMd.replace(/\s+$/, "")}\n\n${agentsImportLine}\n`;
      changes.push({ path: claudeMdPath, content: imported, expectedHash: claudeMd === undefined ? null : hashFileContent(claudeMd) });
      agentsImport = { path: claudeMdPath, present: false, added: true, created: claudeMd === undefined };
      if ((await readProjectFile(workspace, agentsMdPath)) === undefined) {
        nextSteps.push(`${agentsMdPath} is missing; run \`${command} agents --write\` so the import has a block to load.`);
      }
    } else {
      agentsImport = { path: claudeMdPath, present: false, added: false, created: false };
      nextSteps.push(
        `${claudeMdPath} does not import ${agentsMdPath}; re-run with --import-agents to add \`${agentsImportLine}\`, or keep the block in ${claudeMdPath} with \`${command} agents --write --file ${claudeMdPath}\`.`,
      );
    }
  }

  const base = { host: options.host, path: file.path, command, events: file.events, changed, nextSteps };
  if (options.dryRun) {
    // Nothing is written on a dry run, so the import result reports the check only.
    return {
      ...base,
      dryRun: true,
      configured: false,
      agentsImport: agentsImport && { ...agentsImport, added: false, created: false },
      content,
    };
  }
  if (changes.length > 0) {
    await applyFileTransaction(workspace, `install ${options.host} hooks`, changes);
  }
  return { ...base, dryRun: false, configured: configChange, agentsImport };
}

/**
 * Read a project file the way the transaction reads it (bounded, BOM
 * stripped), so `expectedHash` matches what the transaction hashes.
 */
async function readProjectFile(workspace: LedgerWorkspace, relativePath: string): Promise<string | undefined> {
  try {
    return await readUtf8FileLimited(
      path.join(workspace.projectRoot, relativePath),
      workspace.config.limits.maxTotalDocumentBytes,
      relativePath,
    );
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
  /** Context injected for SessionStart, or the draft notice injected for UserPromptSubmit. */
  readonly context?: string;
  readonly touched?: readonly string[];
  readonly entry?: { readonly id: string; readonly path: string; readonly created: boolean };
  readonly closed?: boolean;
  readonly handoffPath?: string;
  /** Why the event did nothing, for the host's stderr. */
  readonly note?: string;
  /** The JSON object written to stdout for the host. */
  readonly output: Readonly<Record<string, unknown>>;
}

const concurrentWriteAttempts = 6;

/**
 * Run a write planned against the catalog, re-reading and retrying when a
 * hook for a parallel tool call changed the record between the read and the
 * write. The write lock serializes the writes; this keeps their plans fresh.
 */
async function withFreshCatalog<T>(
  workspace: LedgerWorkspace,
  write: (documents: readonly ParsedLedgerDocument[]) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const documents = await readLedgerDocuments(workspace);
    try {
      return await write(documents);
    } catch (error) {
      if (attempt >= concurrentWriteAttempts || !isCode(error, "concurrent-file-change")) throw error;
    }
  }
}

/** Run one lifecycle event against the workspace and return what the host should receive. */
export async function runHookEvent(
  workspace: LedgerWorkspace,
  host: LedgerHookHost,
  event: LedgerHookEvent,
  payload: LedgerHookPayload,
  options: RunHookOptions = {},
): Promise<HookEventResult> {
  // Every supported host names its session; without an id a touch would land on whichever session is newest.
  if (!payload.sessionId) return { host, event, note: "the payload carries no session id, so nothing was recorded", output: {} };
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
      return { host, event, session: started.session, context, output: contextOutput(host, context, "SessionStart") };
    }
    case "user-prompt-submit": {
      // Cursor has no prompt hook that can add agent context; the other hosts get one notice per draft.
      if (host === "cursor" || !payload.sessionId) return { host, event, output: {} };
      try {
        const context = await announcePendingDrafts(workspace, payload.sessionId);
        if (!context) return { host, event, output: {} };
        return { host, event, context, output: contextOutput(host, context, "UserPromptSubmit") };
      } catch {
        return { host, event, output: {} };
      }
    }
    case "post-tool-use": {
      if (payload.paths.length === 0) return { host, event, output: {} };
      const touched = await withFreshCatalog(workspace, (documents) =>
        touchSession(workspace, documents, payload.paths, { host, hostSession: payload.sessionId }),
      );
      return { host, event, session: touched.session, touched: touched.added, output: {} };
    }
    case "stop": {
      if (payload.stopHookActive) return { host, event, output: {} };
      const drafted = await withFreshCatalog(workspace, (documents) =>
        draftSessionReceipt(workspace, documents, selector, { fromDiff: true }),
      );
      if (!drafted) return { host, event, output: {} };
      if (drafted.entry.created) await forgetHookNotice(workspace, drafted.session.id, drafted.entry.id);
      return {
        host,
        event,
        session: drafted.session,
        entry: drafted.entry,
        output: drafted.entry.created
          ? systemMessage(
            host,
            `Ledger drafted ${drafted.entry.path}; give it a title and finish it with ${workspace.config.agents.command} ready.`,
          )
          : {},
      };
    }
    case "session-end": {
      const drafted = await withFreshCatalog(workspace, (documents) =>
        draftSessionReceipt(workspace, documents, selector, { fromDiff: true }),
      );
      if (drafted?.entry.created) await forgetHookNotice(workspace, drafted.session.id, drafted.entry.id);
      const current = await readLedgerDocuments(workspace);
      // A record that expired while its tab stayed open is still closed when SessionEnd finally arrives.
      const session =
        findSession(current, selector, { activeOnly: true }) ??
        (payload.sessionId ? findExpiredActiveSession(current, payload.sessionId) : undefined);
      if (!session) return { host, event, entry: drafted?.entry, output: {} };
      const closed = await closeSession(workspace, current, { id: session.normalized.id });
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

type HookContextEvent = "SessionStart" | "UserPromptSubmit";

function contextOutput(host: LedgerHookHost, context: string, eventName: HookContextEvent): Readonly<Record<string, unknown>> {
  if (host === "cursor") return { additional_context: context };
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: context } };
}

/** Announced draft ids keyed by session record id. */
type HookNotices = Readonly<Record<string, readonly string[]>>;

function hookNoticesPath(workspace: LedgerWorkspace): string {
  return normalizePath(path.join(workspace.config.cache.output, hookNoticesFile));
}

/** Read the notice store tolerantly: a missing or invalid file means nothing has been announced. */
async function readHookNotices(workspace: LedgerWorkspace): Promise<{ readonly raw?: string; readonly notices: HookNotices }> {
  let raw: string | undefined;
  try {
    raw = await readProjectFile(workspace, hookNoticesPath(workspace));
  } catch {
    return { notices: {} };
  }
  if (raw === undefined) return { notices: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { raw, notices: {} };
    const notices: Record<string, readonly string[]> = {};
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) notices[sessionId] = value.filter((item): item is string => typeof item === "string");
    }
    return { raw, notices };
  } catch {
    return { raw, notices: {} };
  }
}

/**
 * Build the one-time notice for hook drafts linked to the host session that
 * the agent has not been told about, and record the announcement. Reads the
 * cached catalog once and never calls Git, so it stays cheap on every prompt.
 */
async function announcePendingDrafts(workspace: LedgerWorkspace, hostSession: string): Promise<string | undefined> {
  const documents = await readLedgerDocuments(workspace);
  const session = findSession(documents, { hostSession }, { activeOnly: true });
  if (!session || session.normalized.related.length === 0) return undefined;
  const store = await readHookNotices(workspace);
  const announced = new Set(store.notices[session.normalized.id] ?? []);
  const pending = linkedChangeEntries(documents, session.normalized.related).filter(
    (entry) => entry.status === "draft" && !announced.has(entry.id),
  );
  if (pending.length === 0) return undefined;
  const command = workspace.config.agents.command;
  const context = pending
    .map(
      (entry) =>
        `Ledger drafted ${entry.path} for this session (${session.normalized.id}). Finish that draft and run ${command} ready; do not create another receipt with ${command} new.`,
    )
    .join("\n");
  // Sessions that no longer exist take their announcements with them, so the store stays small.
  const liveSessions = new Set(
    documents.filter((document) => document.kind === "session").map((document) => normalizeDocument(document).id),
  );
  const next: HookNotices = Object.fromEntries([
    ...Object.entries(store.notices).filter(([id]) => id !== session.normalized.id && liveSessions.has(id)),
    [session.normalized.id, [...announced, ...pending.map((entry) => entry.id)]],
  ]);
  await writeHookNotices(workspace, store.raw, next);
  return context;
}

/** Drop a draft's id from the store so a draft created anew, even under an id a deleted draft used, is announced. */
async function forgetHookNotice(workspace: LedgerWorkspace, sessionId: string, entryId: string): Promise<void> {
  const store = await readHookNotices(workspace);
  const announced = store.notices[sessionId];
  if (!announced?.includes(entryId)) return;
  await writeHookNotices(workspace, store.raw, { ...store.notices, [sessionId]: announced.filter((id) => id !== entryId) });
}

async function writeHookNotices(workspace: LedgerWorkspace, previous: string | undefined, next: HookNotices): Promise<void> {
  await applyFileTransaction(workspace, "record hook notices", [
    {
      path: hookNoticesPath(workspace),
      content: `${JSON.stringify(next, null, 2)}\n`,
      expectedHash: previous === undefined ? null : hashFileContent(previous),
    },
  ]);
}

/** Change entries whose id the session lists in `related`, in catalog order. */
function linkedChangeEntries(
  documents: readonly ParsedLedgerDocument[],
  related: readonly string[],
): readonly ReturnType<typeof normalizeDocument>[] {
  if (related.length === 0) return [];
  return documents
    .filter((document) => document.kind === "change")
    .map(normalizeDocument)
    .filter((entry) => related.includes(entry.id));
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
  const command = workspace.config.agents.command;
  const lines: string[] = [
    `# Ledger memory for ${workspace.config.project}`,
    "",
    `Session record: ${session.id} (${session.path}). Run \`${command} packet <path> --budget 1200\` before editing a file, \`${command} session note "<fact>"\` to remember something, and \`${command} ready\` before marking a receipt landed.`,
  ];
  for (const entry of linkedChangeEntries(documents, session.related)) {
    const label = `Linked receipt: ${entry.id} ${entry.title} (${entry.path}, ${entry.status}).`;
    lines.push(
      entry.status === "draft"
        ? `${label} Finish it and run ${command} ready before landing; do not create another receipt with ${command} new.`
        : label,
    );
  }
  lines.push("");
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

  return trimToBudget(lines, budget, command);
}

function isPlaceholder(line: string): boolean {
  return /^Add (facts|follow-ups)\b/.test(line);
}

/** Drop template placeholders and TODO markers from bullets shown to an agent. */
function isSubstantive(line: string): boolean {
  return !/^Add (invariants|checks)\b/.test(line) && !/\bTODO(?=\s*[:(\-]|\s*$)/i.test(line);
}

function trimToBudget(lines: readonly string[], budgetTokens: number, command: string): string {
  const kept: string[] = [];
  for (const line of lines) {
    const candidate = [...kept, line].join("\n");
    if (estimateTokens(candidate) > budgetTokens) {
      kept.push("", `(Ledger context truncated to the budget; run ${command} packet for more.)`);
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
