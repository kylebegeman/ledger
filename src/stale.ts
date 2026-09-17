import { stat } from "node:fs/promises";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath, stringArrayValue } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { extractBullets, getSectionBody } from "./query.js";
import { extractAnchoredBlocks, type LedgerAnchor } from "./retrieval.js";
import { isSafeProjectRelativePath, resolveProjectPath } from "./projectPaths.js";
import { evidenceFreshness, readEvidence } from "./verify.js";
import type {
  LedgerValidationResult,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export interface LedgerStaleIssue {
  readonly kind:
    | "missing-reference"
    | "missing-relationship"
    | "superseded-relationship"
    | "stale-symbol"
    | "release-verification"
    | "expired-session"
    | "stale-verification"
    | "stale-anchor"
    | "stale-invariant";
  readonly path: string;
  readonly message: string;
  readonly target?: string;
}

export interface LedgerStaleReport {
  readonly ok: boolean;
  readonly issues: readonly LedgerStaleIssue[];
}

export async function detectStaleKnowledge(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  validation: LedgerValidationResult,
): Promise<LedgerStaleReport> {
  const normalized = documents.map(normalizeDocument);
  const byId = new Map(normalized.map((document) => [document.id, document]));
  const parsedByPath = new Map(documents.map((document) => [document.relativePath, document]));
  const issues: LedgerStaleIssue[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const evidence = await readEvidence(workspace);
  const prunableSessions: ReadonlySet<NormalizedLedgerDocument> = new Set(expiredSessions(normalized, today).prunable);
  // Many records reference the same source files; read each file once per run.
  const sources = new ReferencedFileCache(workspace);

  for (const issue of validation.issues) {
    if (issue.code !== "missing-reference" || !issue.path) continue;
    issues.push({
      kind: "missing-reference",
      path: issue.path,
      target: issue.target,
      message: issue.message,
    });
  }

  for (const document of normalized) {
    for (const [field, ids] of relationshipFields(document)) {
      for (const id of ids) {
        const target = byId.get(id);
        if (!target) {
          issues.push({
            kind: "missing-relationship",
            path: document.path,
            target: id,
            message: `${field} references missing Ledger record ${id}`,
          });
          continue;
        }
        if (target.status === "superseded") {
          issues.push({
            kind: "superseded-relationship",
            path: document.path,
            target: id,
            message: `${field} references superseded Ledger record ${id}`,
          });
        }
      }
    }

    if (document.kind === "release") {
      const parsed = parsedByPath.get(document.path);
      const verification = parsed ? extractBullets(getSectionBody(parsed, "Verification")) : [];
      if (verification.length === 0) {
        issues.push({
          kind: "release-verification",
          path: document.path,
          target: document.id,
          message: `release ${document.id} has no verification bullets`,
        });
      }
    }

    if (document.kind === "change") {
      const freshness = evidenceFreshness(evidence.entries[document.id], workspace.config.verification.maxAgeDays);
      if (freshness === "stale" || freshness === "failed") {
        issues.push({
          kind: "stale-verification",
          path: document.path,
          target: document.id,
          message: freshness === "failed"
            ? `verification evidence for ${document.id} records a failed run; rerun ledger verify ${document.id} --run`
            : `verification evidence for ${document.id} is older than ${workspace.config.verification.maxAgeDays} days; rerun ledger verify ${document.id} --run`,
        });
      }
    }

    if (prunableSessions.has(document)) {
      issues.push({
        kind: "expired-session",
        path: document.path,
        target: document.id,
        message: `session ${document.id} expired on ${document.expires}; promote it or run ledger session prune --write`,
      });
    }

    const parsed = parsedByPath.get(document.path);
    const acknowledged = new Set([
      ...stringArrayValue(parsed?.frontmatter.staleRefs),
      ...stringArrayValue(parsed?.frontmatter.stale_refs),
    ]);
    const staleTargets = new Set<string>();

    if (document.symbols.length > 0 && document.files.length > 0) {
      const missingSymbols = await symbolsMissingFromFiles(sources, document.files, document.symbols);
      for (const symbol of missingSymbols) {
        if (acknowledged.has(symbol) || acknowledged.has(`symbols:${symbol}`)) continue;
        staleTargets.add(symbol);
        issues.push({
          kind: "stale-symbol",
          path: document.path,
          target: symbol,
          message: `symbol may be stale because it was not found in referenced files: ${symbol}`,
        });
      }
    }

    if (parsed && document.kind === "change") {
      for (const block of extractAnchoredBlocks(getSectionBody(parsed, "Changed Files"), document.files)) {
        const checkable = block.anchors.filter((anchor) => isCheckableAnchor(anchor, block.files)).map((anchor) => anchor.text);
        if (checkable.length === 0 || block.files.length === 0) continue;
        const missing = await anchorsMissingFromFiles(sources, block.files, checkable);
        for (const anchor of missing) {
          if (acknowledged.has(anchor) || acknowledged.has(`anchors:${anchor}`)) continue;
          staleTargets.add(anchor);
          issues.push({
            kind: "stale-anchor",
            path: document.path,
            target: anchor,
            message: `anchor "${anchor}" from the ${block.title} block was not found in ${block.files.join(", ")}`,
          });
        }
      }
      if (staleTargets.size > 0) {
        for (const invariant of extractBullets(getSectionBody(parsed, "Invariants"))) {
          const cited = [...invariant.matchAll(/`([^`]+)`/g)].map((match) => match[1]!.trim());
          const stale = cited.find((name) => staleTargets.has(name));
          if (!stale) continue;
          issues.push({
            kind: "stale-invariant",
            path: document.path,
            target: stale,
            message: `invariant cites "${stale}", which no longer exists in the referenced files: ${clip(invariant)}`,
          });
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues: issues.sort((left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.path.localeCompare(right.path) ||
      (left.target ?? "").localeCompare(right.target ?? ""),
    ),
  };
}

export async function writeStaleReport(
  workspace: LedgerWorkspace,
  report: LedgerStaleReport,
): Promise<string> {
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "stale-knowledge.md"));
  await applyFileTransaction(workspace, "write stale knowledge report", [
    { path: reportPath, content: formatStaleReport(report) },
  ]);
  return reportPath;
}

export function formatStaleReport(report: LedgerStaleReport): string {
  const lines = [
    "# Ledger Stale Knowledge Report",
    "",
    `Issues: ${report.issues.length}`,
    "",
  ];
  if (report.issues.length === 0) {
    lines.push("No stale knowledge signals found.", "");
    return `${lines.join("\n")}\n`;
  }
  for (const issue of report.issues) {
    const target = issue.target ? ` (${issue.target})` : "";
    lines.push(`- ${issue.kind}: \`${issue.path}\`${target}: ${issue.message}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Sessions that passed their expiry date without being promoted. */
export function isExpiredSession(
  document: Pick<NormalizedLedgerDocument, "kind" | "status" | "expires">,
  today: string,
): boolean {
  if (document.kind !== "session" || !document.expires) return false;
  if (document.status === "promoted") return false;
  return document.expires < today;
}

export interface ExpiredSessions {
  /** Expired session documents no record links, which `session prune --write` deletes. */
  readonly prunable: readonly NormalizedLedgerDocument[];
  /** Expired sessions kept because a record links them, mapped to the sorted ids of those records. */
  readonly retained: ReadonlyMap<string, readonly string[]>;
}

/**
 * Split expired sessions into those prune may delete and those it must keep.
 * A session is kept when an existing non-session record lists it in `related`,
 * or when its own `related` names an existing record, so pruning never leaves
 * a non-session record with a dangling session link. Another session listing
 * the session id does not keep it.
 */
export function expiredSessions(catalog: readonly NormalizedLedgerDocument[], today: string): ExpiredSessions {
  const ids = new Set(catalog.map((document) => document.id));
  const expired = catalog.filter((document) => isExpiredSession(document, today));
  const links = new Map<string, Set<string>>(expired.map((session) => [session.id, new Set<string>()]));
  for (const document of catalog) {
    const sessionLinks = document.kind === "session" ? links.get(document.id) : undefined;
    for (const id of document.related) {
      if (document.kind !== "session") links.get(id)?.add(document.id);
      else if (sessionLinks && id !== document.id && ids.has(id)) sessionLinks.add(id);
    }
  }
  const prunable: NormalizedLedgerDocument[] = [];
  const retained = new Map<string, readonly string[]>();
  for (const session of expired) {
    const linkedBy = [...links.get(session.id)!].sort();
    if (linkedBy.length === 0) prunable.push(session);
    else retained.set(session.id, linkedBy);
  }
  return { prunable, retained };
}

function relationshipFields(
  document: ReturnType<typeof normalizeDocument>,
): ReadonlyArray<readonly [string, readonly string[]]> {
  return [
    ["decisions", document.decisions],
    ["backlog", document.backlog],
    ["related", document.related],
    ["supersedes", document.supersedes],
  ];
}

async function symbolsMissingFromFiles(
  sources: ReferencedFileCache,
  files: readonly string[],
  symbols: readonly string[],
): Promise<readonly string[]> {
  const checkableSymbols = symbols.filter(isCheckableSymbol);
  if (checkableSymbols.length === 0) return [];
  const combined = await sources.read(files);
  if (combined === undefined) return [];
  return checkableSymbols.filter((symbol) => !combined.includes(symbol));
}

/**
 * Whether an anchor names checkable text. Descriptions written without
 * backticks that contain spaces are prose, and an anchor that is the block's
 * own file path, file name, or directory names the file rather than its content.
 */
export function isCheckableAnchor(anchor: LedgerAnchor, files: readonly string[]): boolean {
  if (!anchor.literal && /\s/.test(anchor.text)) return false;
  const names = new Set<string>();
  for (const file of files) {
    const normalized = normalizePath(file);
    names.add(normalized);
    for (const segment of normalized.split("/")) if (segment) names.add(segment);
  }
  return !names.has(normalizePath(anchor.text));
}

const dottedKeyPattern = /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)+$/;

/**
 * Anchors from a Changed Files block that none of the block's existing files
 * contain. A dotted key path such as `git.ignore` counts as present when every
 * segment appears, because YAML and JSON spell nested keys across lines.
 */
async function anchorsMissingFromFiles(
  sources: ReferencedFileCache,
  files: readonly string[],
  anchors: readonly string[],
): Promise<readonly string[]> {
  const combined = await sources.read(files);
  if (combined === undefined) return [];
  return anchors.filter((anchor) => {
    if (combined.includes(anchor)) return false;
    if (dottedKeyPattern.test(anchor)) return !anchor.split(".").every((segment) => combined.includes(segment));
    return true;
  });
}

/**
 * Reads the exact, existing files a record references and remembers each
 * file's content for the rest of a stale run. Every combined read is bounded
 * by `limits.maxTotalDocumentBytes`, as a single read was before.
 */
class ReferencedFileCache {
  private readonly contents = new Map<string, Promise<string | undefined>>();

  constructor(private readonly workspace: LedgerWorkspace) {}

  /**
   * Concatenated contents of the exact, existing files in a reference list,
   * or undefined when nothing could be read (patterns only, or every file missing).
   */
  async read(files: readonly string[]): Promise<string | undefined> {
    const exactFiles = [...new Set(files.map(normalizePath))].filter(
      (filePath) => !isCoveragePattern(filePath) && isSafeProjectRelativePath(filePath),
    );
    if (exactFiles.length === 0) return undefined;
    const limit = this.workspace.config.limits.maxTotalDocumentBytes;
    const contents: string[] = [];
    let totalBytes = 0;
    for (const filePath of exactFiles) {
      const content = await this.readOne(filePath);
      if (content === undefined) continue;
      totalBytes += Buffer.byteLength(content, "utf8");
      if (totalBytes > limit) {
        throw new LedgerError("resource-limit-exceeded", `${filePath}: referenced files exceed ${limit} bytes`, {
          path: filePath,
          limit,
        });
      }
      contents.push(content);
    }
    if (contents.length === 0) return undefined;
    return contents.join("\n");
  }

  /** One file's content, or undefined when it is missing or not a regular file. */
  private readOne(filePath: string): Promise<string | undefined> {
    let pending = this.contents.get(filePath);
    if (!pending) {
      pending = this.load(filePath);
      this.contents.set(filePath, pending);
    }
    return pending;
  }

  private async load(filePath: string): Promise<string | undefined> {
    const absolutePath = resolveProjectPath(this.workspace.projectRoot, filePath, "files reference");
    try {
      if (!(await stat(absolutePath)).isFile()) return undefined;
    } catch (error) {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    }
    return await readUtf8FileLimited(absolutePath, this.workspace.config.limits.maxTotalDocumentBytes, "symbol source");
  }
}

function clip(value: string): string {
  return value.length > 100 ? `${value.slice(0, 97)}...` : value;
}

function isCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === code;
}

function isCheckableSymbol(symbol: string): boolean {
  return /^[A-Za-z_$][\w$.-]*$/.test(symbol);
}
