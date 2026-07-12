import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { extractBullets, getSectionBody } from "./query.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export interface LedgerConflictEntry {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly matchedFiles: readonly string[];
  readonly conflictRules: readonly string[];
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
}

export interface LedgerConflictTarget {
  readonly target: string;
  readonly entries: readonly LedgerConflictEntry[];
}

export interface ChangedFileBlock {
  readonly title: string;
  readonly body: string;
}

export function buildConflictTargets(
  documents: readonly ParsedLedgerDocument[],
  targets: readonly string[],
): readonly LedgerConflictTarget[] {
  return targets.map((target) => {
    const normalizedTarget = normalizePath(target);
    return {
      target: normalizedTarget,
      entries: documents
        .map((document) => conflictEntryForTarget(document, normalizedTarget))
        .filter((entry): entry is LedgerConflictEntry => Boolean(entry)),
    };
  });
}

export async function writeConflictReport(
  workspace: LedgerWorkspace,
  targets: readonly LedgerConflictTarget[],
): Promise<string> {
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "conflict.md"));
  await applyFileTransaction(workspace, "write conflict report", [
    { path: reportPath, content: formatConflictReport(targets) },
  ]);
  return reportPath;
}

export function formatConflictReport(targets: readonly LedgerConflictTarget[]): string {
  const lines = ["# Ledger Conflict Report", "", `Targets: ${targets.length}`, ""];

  for (const target of targets) {
    lines.push(`## ${target.target}`, "");
    if (target.entries.length === 0) {
      lines.push("No Ledger records mention this path.", "");
      continue;
    }

    for (const entry of target.entries) {
      lines.push(`### ${entry.id}: ${entry.title}`, "");
      lines.push(`- Entry: \`${entry.path}\``);
      lines.push(`- Matched files: ${entry.matchedFiles.map((file) => `\`${file}\``).join(", ")}`);
      pushSection(lines, "Conflict Rules", entry.conflictRules);
      pushSection(lines, "Invariants", entry.invariants);
      pushSection(lines, "Verification", entry.verification);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function extractConflictRules(markdown: string | undefined): readonly string[] {
  if (!markdown) return [];
  const rules: string[] = [];
  let current: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- On conflict:")) {
      if (current) rules.push(current);
      current = trimmed.slice("- On conflict:".length).trim();
      continue;
    }
    if (current && /^\s+\S/.test(line) && !trimmed.startsWith("- ")) {
      current = `${current} ${trimmed}`;
      continue;
    }
    if (current) {
      rules.push(current);
      current = undefined;
    }
  }

  if (current) rules.push(current);
  return rules.filter((rule) => rule.length > 0);
}

export function extractChangedFileBlocks(markdown: string | undefined): readonly ChangedFileBlock[] {
  if (!markdown) return [];

  const lines = markdown.split(/\r?\n/);
  const headings: Array<{ title: string; index: number }> = [];
  for (const [index, line] of lines.entries()) {
    const match = /^###\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    headings.push({ title: match[1]?.trim() ?? "", index });
  }

  return headings.map((heading, offset) => {
    const next = headings[offset + 1];
    return {
      title: heading.title,
      body: lines.slice(heading.index + 1, next?.index).join("\n").trim(),
    };
  });
}

function conflictEntryForTarget(
  document: ParsedLedgerDocument,
  target: string,
): LedgerConflictEntry | undefined {
  const normalized = normalizeDocument(document);
  const matchedFiles = normalized.files.filter((filePath) => pathsMatch(filePath, target));
  if (matchedFiles.length === 0) return undefined;

  return {
    id: normalized.id,
    title: normalized.title,
    path: normalized.path,
    matchedFiles,
    conflictRules: extractConflictRulesForFiles(
      getSectionBody(document, "Changed Files"),
      target,
      matchedFiles,
    ),
    invariants: extractBullets(getSectionBody(document, "Invariants")),
    verification: extractBullets(getSectionBody(document, "Verification")),
  };
}

function extractConflictRulesForFiles(
  markdown: string | undefined,
  target: string,
  matchedFiles: readonly string[],
): readonly string[] {
  const blocks = extractChangedFileBlocks(markdown);
  if (blocks.length === 0) return extractConflictRules(markdown);

  const paths = [target, ...matchedFiles];
  return blocks
    .filter((block) => paths.some((filePath) => blockTitleMatchesPath(block.title, filePath)))
    .flatMap((block) => extractConflictRules(block.body));
}

function blockTitleMatchesPath(title: string, filePath: string): boolean {
  return titleCandidates(title).some((candidate) => {
    if (pathsMatch(candidate, filePath)) return true;
    if (candidate.includes("*")) return matchesSimpleGlob(filePath, candidate);
    return normalizePath(candidate).includes(normalizePath(filePath));
  });
}

function titleCandidates(title: string): readonly string[] {
  return title
    .replace(/`/g, "")
    .replace(/^Pattern:\s*/i, "")
    .split(/(?:,|\band\b|\bor\b)/i)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
}

function pathsMatch(filePath: string, target: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedTarget = normalizePath(target);
  return (
    normalizedFile === normalizedTarget ||
    normalizedFile.endsWith(`/${normalizedTarget}`) ||
    normalizedTarget.endsWith(`/${normalizedFile}`)
  );
}

function matchesSimpleGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  let source = "^";
  for (const character of normalizedPattern) {
    if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  source += "$";
  return new RegExp(source).test(normalizedPath);
}

function pushSection(lines: string[], title: string, values: readonly string[]): void {
  lines.push("", `#### ${title}`, "");
  if (values.length === 0) {
    lines.push("None recorded.", "");
    return;
  }
  for (const value of values) lines.push(`- ${value}`);
  lines.push("");
}
