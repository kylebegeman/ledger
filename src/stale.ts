import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath, stringArrayValue } from "./documents.js";
import { extractBullets, getSectionBody } from "./query.js";
import { isSafeProjectRelativePath, resolveProjectPath } from "./projectPaths.js";
import type {
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export interface LedgerStaleIssue {
  readonly kind:
    | "missing-reference"
    | "missing-relationship"
    | "superseded-relationship"
    | "stale-symbol"
    | "release-verification";
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

    if (document.symbols.length > 0 && document.files.length > 0) {
      const parsed = parsedByPath.get(document.path);
      const acknowledged = new Set([
        ...stringArrayValue(parsed?.frontmatter.staleRefs),
        ...stringArrayValue(parsed?.frontmatter.stale_refs),
      ]);
      const missingSymbols = await symbolsMissingFromFiles(workspace, document.files, document.symbols);
      for (const symbol of missingSymbols) {
        if (acknowledged.has(symbol) || acknowledged.has(`symbols:${symbol}`)) continue;
        issues.push({
          kind: "stale-symbol",
          path: document.path,
          target: symbol,
          message: `symbol may be stale because it was not found in referenced files: ${symbol}`,
        });
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
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  const reportPath = path.join(reportDirectory, "stale-knowledge.md");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, formatStaleReport(report), "utf8");
  return normalizePath(path.relative(workspace.projectRoot, reportPath));
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
  const exactFiles = files
    .map(normalizePath)
    .filter((filePath) => !isCoveragePattern(filePath) && isSafeProjectRelativePath(filePath));
  if (exactFiles.length === 0) return [];

  const contents = await Promise.all(
    exactFiles.map(async (filePath) => {
      try {
        return await readFile(resolveProjectPath(workspace.projectRoot, filePath, "files reference"), "utf8");
      } catch {
        return "";
      }
    }),
  );
  const combined = contents.join("\n");
  if (combined.length === 0) return [];
  return checkableSymbols.filter((symbol) => !combined.includes(symbol));
}

function isCheckableSymbol(symbol: string): boolean {
  return /^[A-Za-z_$][\w$.-]*$/.test(symbol);
}
