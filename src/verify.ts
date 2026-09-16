import { execFile } from "node:child_process";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { getChangedFileDetails, getHeadCommit } from "./git.js";
import { LedgerError } from "./machine.js";
import { isSafeProjectRelativePath, resolveSafeProjectPath } from "./projectPaths.js";
import { extractBullets, getSectionBody } from "./query.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

/** One Verification bullet, parsed into a runnable command when it has the command shape. */
export interface LedgerVerificationCommand {
  readonly bullet: string;
  /** The first backticked span when the bullet starts with one. */
  readonly raw?: string;
  readonly env: Readonly<Record<string, string>>;
  readonly argv: readonly string[];
  readonly allowed: boolean;
  /** Why the bullet will not run: prose, shell operators, or not on the allowlist. */
  readonly skipReason?: string;
}

export interface LedgerEvidenceResult {
  readonly command: string;
  readonly ok: boolean;
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly skipped?: string;
}

export interface LedgerEvidenceEntry {
  readonly id: string;
  readonly path: string;
  readonly commit?: string;
  /** Whether the working tree had uncommitted changes when the commands ran. */
  readonly dirty: boolean;
  readonly ranAt: string;
  readonly ok: boolean;
  readonly results: readonly LedgerEvidenceResult[];
}

/** The derived evidence sidecar: latest run per change entry. */
export interface LedgerEvidenceIndex {
  readonly version: 1;
  readonly generatedAt: string;
  readonly entries: Readonly<Record<string, LedgerEvidenceEntry>>;
}

export type LedgerVerificationFreshness = "fresh" | "stale" | "failed" | "none";

export interface LedgerVerifyRecord {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly status: string;
  readonly commands: readonly LedgerVerificationCommand[];
  readonly evidence?: LedgerEvidenceEntry;
  readonly freshness: LedgerVerificationFreshness;
  readonly ran: boolean;
}

export interface LedgerVerifyReport {
  readonly ok: boolean;
  readonly ran: boolean;
  readonly evidencePath: string;
  readonly records: readonly LedgerVerifyRecord[];
}

export interface VerifyOptions {
  /** Change entry ids or paths. */
  readonly targets?: readonly string[];
  /** Select every change entry instead of the ones in the working-tree change set. */
  readonly all?: boolean;
  readonly run: boolean;
  readonly timeoutMs?: number;
}

const maxCommandOutputBytes = 4_000_000;
/** Set in the environment of commands `verify --run` executes so a nested verify never runs commands again. */
export const nestedVerifyEnvironmentVariable = "LEDGER_VERIFY_NESTED";
const shellOperatorPattern = /[|&;<>`$(){}\n]/;

export function emptyEvidenceIndex(): LedgerEvidenceIndex {
  return { version: 1, generatedAt: new Date(0).toISOString(), entries: {} };
}

/** Parse a Verification bullet: the first backticked span, an optional `KEY=value` prefix, then argv. */
export function parseVerificationBullet(bullet: string, allow: readonly string[]): LedgerVerificationCommand {
  const trimmed = bullet.trim();
  const match = /^`([^`]+)`/.exec(trimmed);
  if (!match) return { bullet: trimmed, env: {}, argv: [], allowed: false, skipReason: "not a command" };
  const raw = match[1]!.trim();
  if (shellOperatorPattern.test(raw)) {
    return { bullet: trimmed, raw, env: {}, argv: [], allowed: false, skipReason: "shell operators are not run" };
  }
  const words = splitShellWords(raw);
  if (!words || words.length === 0) {
    return { bullet: trimmed, raw, env: {}, argv: [], allowed: false, skipReason: "could not parse the command" };
  }
  const env: Record<string, string> = {};
  let index = 0;
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]!)) {
    const [key, ...rest] = words[index]!.split("=");
    env[key!] = rest.join("=");
    index += 1;
  }
  const argv = words.slice(index);
  if (argv.length === 0) return { bullet: trimmed, raw, env, argv, allowed: false, skipReason: "no command after the environment" };
  const allowed = isAllowedCommand(argv, allow);
  return allowed
    ? { bullet: trimmed, raw, env, argv, allowed }
    : { bullet: trimmed, raw, env, argv, allowed, skipReason: "not on verification.allow" };
}

/** Split on whitespace honoring single and double quotes; undefined when quotes are unbalanced. */
export function splitShellWords(input: string): readonly string[] | undefined {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let hasWord = false;
  for (const character of input) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      hasWord = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (hasWord) words.push(current);
      current = "";
      hasWord = false;
      continue;
    }
    current += character;
    hasWord = true;
  }
  if (quote) return undefined;
  if (hasWord) words.push(current);
  return words;
}

/**
 * Match argv against allowlist patterns. Pattern tokens match literally,
 * `*` matches exactly one token, and a trailing `**` matches the rest,
 * including nothing.
 */
export function isAllowedCommand(argv: readonly string[], patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const tokens = pattern.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    const rest = tokens[tokens.length - 1] === "**";
    const fixed = rest ? tokens.slice(0, -1) : tokens;
    if (rest ? argv.length < fixed.length : argv.length !== fixed.length) return false;
    return fixed.every((token, index) => token === "*" || token === argv[index]);
  });
}

export function evidenceFreshness(
  entry: LedgerEvidenceEntry | undefined,
  maxAgeDays: number,
  now = Date.now(),
): LedgerVerificationFreshness {
  if (!entry) return "none";
  if (!entry.ok) return "failed";
  const ranAt = Date.parse(entry.ranAt);
  if (!Number.isFinite(ranAt)) return "stale";
  const ageDays = (now - ranAt) / 86_400_000;
  return ageDays <= maxAgeDays ? "fresh" : "stale";
}

export async function readEvidence(workspace: LedgerWorkspace): Promise<LedgerEvidenceIndex> {
  const evidencePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    workspace.config.verification.evidence,
    "verification evidence",
  );
  let raw: string;
  try {
    raw = await readUtf8FileLimited(evidencePath, workspace.config.limits.maxTotalDocumentBytes, "verification evidence");
  } catch (error) {
    if (isCode(error, "ENOENT")) return emptyEvidenceIndex();
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LedgerError("invalid-argument", `${workspace.config.verification.evidence} is not valid JSON`, {
      path: workspace.config.verification.evidence,
    }, { cause: error });
  }
  if (!isEvidenceIndex(parsed)) {
    throw new LedgerError("invalid-argument", `${workspace.config.verification.evidence} is not a Ledger evidence index`, {
      path: workspace.config.verification.evidence,
    });
  }
  return parsed;
}

export async function writeEvidence(workspace: LedgerWorkspace, index: LedgerEvidenceIndex): Promise<string> {
  const relativePath = normalizePath(workspace.config.verification.evidence);
  const sorted: Record<string, LedgerEvidenceEntry> = {};
  for (const id of Object.keys(index.entries).sort()) sorted[id] = index.entries[id]!;
  await applyFileTransaction(workspace, "write verification evidence", [
    { path: relativePath, content: `${JSON.stringify({ ...index, entries: sorted }, null, 2)}\n` },
  ]);
  return relativePath;
}

function isEvidenceIndex(value: unknown): value is LedgerEvidenceIndex {
  if (!isRecord(value) || value.version !== 1 || !isBoundedText(value.generatedAt, 100) || !isRecord(value.entries)) {
    return false;
  }
  for (const [id, entry] of Object.entries(value.entries)) {
    if (!isBoundedText(id, 200) || !isRecord(entry)) return false;
    if (
      entry.id !== id ||
      !isBoundedText(entry.path, 4_096) ||
      !isSafeProjectRelativePath(entry.path) ||
      (entry.commit !== undefined && !(typeof entry.commit === "string" && /^[a-f0-9]{7,64}$/.test(entry.commit))) ||
      typeof entry.dirty !== "boolean" ||
      !isBoundedText(entry.ranAt, 100) ||
      typeof entry.ok !== "boolean" ||
      !Array.isArray(entry.results)
    ) {
      return false;
    }
    for (const result of entry.results) {
      if (
        !isRecord(result) ||
        !isBoundedText(result.command, 10_000) ||
        typeof result.ok !== "boolean" ||
        (result.exitCode !== undefined && !Number.isInteger(result.exitCode)) ||
        (result.durationMs !== undefined && !Number.isFinite(result.durationMs)) ||
        (result.skipped !== undefined && !isBoundedText(result.skipped, 1_000))
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * List, and with `run` execute, the verification commands of change entries
 * and record the outcome in the evidence sidecar.
 */
export async function runVerification(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: VerifyOptions,
): Promise<LedgerVerifyReport> {
  const { allow, maxAgeDays, timeoutMs, evidence: evidencePath } = workspace.config.verification;
  const selected = await selectEntries(workspace, documents, options);
  const evidence = await readEvidence(workspace);
  const updated: Record<string, LedgerEvidenceEntry> = { ...evidence.entries };
  if (options.run && process.env[nestedVerifyEnvironmentVariable]) {
    throw new LedgerError(
      "invalid-argument",
      "ledger verify --run was started by another verify run; a Verification bullet must not run verify --run itself",
      { nested: true },
    );
  }
  const commit = options.run ? await getHeadCommit(workspace.projectRoot) : undefined;
  const dirty = options.run ? await workingTreeDirty(workspace) : false;
  const records: LedgerVerifyRecord[] = [];

  for (const parsed of selected) {
    const normalized = normalizeDocument(parsed);
    const commands = extractBullets(getSectionBody(parsed, "Verification")).map((bullet) =>
      parseVerificationBullet(bullet, allow),
    );
    let entryEvidence = evidence.entries[normalized.id];
    let ran = false;
    if (options.run) {
      const results: LedgerEvidenceResult[] = [];
      for (const command of commands) {
        if (!command.allowed || command.argv.length === 0) {
          results.push({ command: command.raw ?? command.bullet, ok: true, skipped: command.skipReason ?? "skipped" });
          continue;
        }
        results.push(await executeCommand(workspace, command, options.timeoutMs ?? timeoutMs));
        ran = true;
      }
      entryEvidence = {
        id: normalized.id,
        path: normalizePath(parsed.relativePath),
        commit,
        dirty,
        ranAt: new Date().toISOString(),
        ok: results.every((result) => result.ok),
        results,
      };
      updated[normalized.id] = entryEvidence;
    }
    records.push({
      id: normalized.id,
      path: normalizePath(parsed.relativePath),
      title: normalized.title,
      status: normalized.status,
      commands,
      evidence: entryEvidence,
      freshness: evidenceFreshness(entryEvidence, maxAgeDays),
      ran,
    });
  }

  if (options.run && records.length > 0) {
    await writeEvidence(workspace, { version: 1, generatedAt: new Date().toISOString(), entries: updated });
  }
  return {
    ok: records.every((record) => record.freshness !== "failed"),
    ran: options.run,
    evidencePath: normalizePath(evidencePath),
    records,
  };
}

async function selectEntries(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: VerifyOptions,
): Promise<readonly ParsedLedgerDocument[]> {
  const entries = documents.filter((document) => document.kind === "change");
  const targets = (options.targets ?? []).map((target) => target.trim()).filter(Boolean);
  if (targets.length > 0) {
    const wanted = new Set(targets.map(normalizePath));
    const found = entries.filter(
      (document) => wanted.has(normalizeDocument(document).id) || wanted.has(normalizePath(document.relativePath)),
    );
    const missing = targets.filter(
      (target) => !found.some((document) => normalizeDocument(document).id === target || normalizePath(document.relativePath) === normalizePath(target)),
    );
    if (missing.length > 0) {
      throw new LedgerError("record-not-found", `Change entry not found: ${missing.join(", ")}`, { targets: missing });
    }
    return found;
  }
  if (options.all) return entries;
  let changed: ReadonlySet<string>;
  try {
    changed = new Set((await getChangedFileDetails(workspace.projectRoot)).map((file) => normalizePath(file.path)));
  } catch {
    changed = new Set();
  }
  return entries.filter((document) => changed.has(normalizePath(document.relativePath)));
}

async function workingTreeDirty(workspace: LedgerWorkspace): Promise<boolean> {
  try {
    const changed = await getChangedFileDetails(workspace.projectRoot);
    return changed.some((file) => !normalizePath(file.path).startsWith(".ledger/"));
  } catch {
    return false;
  }
}

async function executeCommand(
  workspace: LedgerWorkspace,
  command: LedgerVerificationCommand,
  timeoutMs: number,
): Promise<LedgerEvidenceResult> {
  const [file, ...args] = command.argv;
  const startedAt = Date.now();
  const label = command.raw ?? command.argv.join(" ");
  return await new Promise<LedgerEvidenceResult>((resolve) => {
    execFile(
      file!,
      args,
      {
        cwd: workspace.projectRoot,
        env: { ...process.env, ...command.env, [nestedVerifyEnvironmentVariable]: "1" },
        timeout: timeoutMs,
        maxBuffer: maxCommandOutputBytes,
        shell: process.platform === "win32",
      },
      (error) => {
        const durationMs = Date.now() - startedAt;
        if (!error) {
          resolve({ command: label, ok: true, exitCode: 0, durationMs });
          return;
        }
        const coded = error as NodeJS.ErrnoException & { readonly killed?: boolean; readonly signal?: string };
        const exitCode = typeof coded.code === "number" ? coded.code : undefined;
        resolve({
          command: label,
          ok: false,
          exitCode,
          durationMs,
          ...(coded.killed ? { skipped: `timed out after ${timeoutMs} ms` } : {}),
        });
      },
    );
  });
}

export function formatVerifyReport(report: LedgerVerifyReport): string {
  if (report.records.length === 0) {
    return "Ledger verify: no change entries selected; pass ids, --all, or change entries in the working tree.";
  }
  const lines = [
    `Ledger verify${report.ran ? " --run" : ""}: ${report.records.length} ${report.records.length === 1 ? "entry" : "entries"}, ${report.records.filter((record) => record.freshness === "failed").length} failed.`,
  ];
  for (const record of report.records) {
    const evidence = record.evidence
      ? `${record.freshness}, ran ${record.evidence.ranAt.slice(0, 10)}${record.evidence.commit ? ` at ${record.evidence.commit.slice(0, 7)}` : ""}${record.evidence.dirty ? " (dirty tree)" : ""}`
      : "no evidence";
    lines.push(`- ${record.id} ${record.title} (${evidence})`);
    const results = new Map(record.evidence?.results.map((result) => [result.command, result]) ?? []);
    for (const command of record.commands) {
      const key = command.raw ?? command.bullet;
      const result = results.get(key);
      const state = command.allowed
        ? result
          ? result.skipped
            ? `skipped: ${result.skipped}`
            : result.ok
              ? `ok${result.durationMs !== undefined ? ` in ${Math.round(result.durationMs)} ms` : ""}`
              : `failed with exit ${result.exitCode ?? "unknown"}`
          : "runnable"
        : `skipped: ${command.skipReason ?? "not runnable"}`;
      lines.push(`  - ${command.raw ? `\`${command.raw}\`` : command.bullet}: ${state}`);
    }
  }
  lines.push(`Evidence: ${report.evidencePath}`);
  return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[ -]/.test(value);
}

function isCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === code;
}

export function evidencePathFor(workspace: LedgerWorkspace): string {
  return normalizePath(path.join(workspace.config.verification.evidence));
}
