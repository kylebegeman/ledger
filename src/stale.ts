import { stat } from "node:fs/promises";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath, stringArrayValue } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { extractBullets, getSectionBody } from "./query.js";
import { extractAnchoredBlocks } from "./retrieval.js";
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

    if (document.kind === "session" && isExpiredSession(document, today)) {
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
      const missingSymbols = await symbolsMissingFromFiles(workspace, document.files, document.symbols);
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
        if (block.anchors.length === 0 || block.files.length === 0) continue;
        const missing = await anchorsMissingFromFiles(workspace, block.files, block.anchors);
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
  workspace: LedgerWorkspace,
  files: readonly string[],
  symbols: readonly string[],
): Promise<readonly string[]> {
  const checkableSymbols = symbols.filter(isCheckableSymbol);
  if (checkableSymbols.length === 0) return [];
  const combined = await readReferencedFiles(workspace, files);
  if (combined === undefined) return [];
  return checkableSymbols.filter((symbol) => !combined.includes(symbol));
}

/** Anchors from a Changed Files block that none of the block's existing files contain. */
async function anchorsMissingFromFiles(
  workspace: LedgerWorkspace,
  files: readonly string[],
  anchors: readonly string[],
): Promise<readonly string[]> {
  const combined = await readReferencedFiles(workspace, files);
  if (combined === undefined) return [];
  return anchors.filter((anchor) => !combined.includes(anchor));
}

/**
 * Concatenated contents of the exact, existing files in a reference list, or
 * undefined when nothing could be read (patterns only, or every file missing).
 */
async function readReferencedFiles(
  workspace: LedgerWorkspace,
  files: readonly string[],
): Promise<string | undefined> {
  const exactFiles = files
    .map(normalizePath)
    .filter((filePath) => !isCoveragePattern(filePath) && isSafeProjectRelativePath(filePath));
  if (exactFiles.length === 0) return undefined;
  const contents: string[] = [];
  let remainingBytes = workspace.config.limits.maxTotalDocumentBytes;
  for (const filePath of exactFiles) {
    const absolutePath = resolveProjectPath(workspace.projectRoot, filePath, "files reference");
    let regular: boolean;
    try {
      regular = (await stat(absolutePath)).isFile();
    } catch (error) {
      if (isCode(error, "ENOENT")) continue;
      throw error;
    }
    if (!regular) continue;
    const content = await readUtf8FileLimited(absolutePath, remainingBytes, "symbol source");
    contents.push(content);
    remainingBytes -= Buffer.byteLength(content, "utf8");
  }
  if (contents.length === 0) return undefined;
  return contents.join("\n");
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
