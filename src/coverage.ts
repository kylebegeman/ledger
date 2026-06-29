import { normalizeDocument, normalizePath } from "./documents.js";
import { getChangedFiles } from "./git.js";
import type {
  LedgerCoverageResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export interface CheckCoverageOptions {
  readonly staged?: boolean;
}

export async function checkCoverage(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CheckCoverageOptions = {},
): Promise<LedgerCoverageResult> {
  const changedFiles = (await getChangedFiles(workspace.projectRoot, options)).map(normalizePath);
  const requiredFiles = changedFiles.filter((filePath) => isCoverageRequired(workspace, filePath));
  const coveredPaths = collectCoveredPaths(documents);
  const coveredFiles = requiredFiles.filter((filePath) => coveredPaths.has(filePath));
  const missingFiles = requiredFiles.filter((filePath) => !coveredPaths.has(filePath));

  return {
    changedFiles,
    requiredFiles,
    coveredFiles,
    missingFiles,
  };
}

export function isCoverageRequired(workspace: LedgerWorkspace, filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (workspace.config.git.ignore.some((pattern) => matchesGlob(normalized, pattern))) {
    return false;
  }
  return workspace.config.git.requireEntryFor.some((pattern) => matchesGlob(normalized, pattern));
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern === "**") return true;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith("**/")) {
    const suffix = normalizedPattern.slice(3);
    return normalizedPath === suffix || normalizedPath.endsWith(`/${suffix}`);
  }
  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern;
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(character ?? "");
    }
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function collectCoveredPaths(documents: readonly ParsedLedgerDocument[]): Set<string> {
  const paths = new Set<string>();
  for (const document of documents) {
    const normalized = normalizeDocument(document);
    for (const filePath of normalized.files) {
      paths.add(normalizePath(filePath));
    }
  }
  return paths;
}
