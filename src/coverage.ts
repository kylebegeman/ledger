import { normalizeDocument, normalizePath } from "./documents.js";
import { getChangedFiles } from "./git.js";
import type {
  LedgerCoverageFile,
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
  const coveragePatterns = collectCoveragePatterns(documents);
  const files = changedFiles.map((filePath) =>
    explainCoverageForPath(workspace, filePath, coveragePatterns),
  );
  const requiredFiles = files
    .filter((file) => file.required)
    .map((file) => file.path);
  const coveredFiles = files
    .filter((file) => file.required && file.covered)
    .map((file) => file.path);
  const missingFiles = files
    .filter((file) => file.required && !file.covered)
    .map((file) => file.path);

  return {
    changedFiles,
    requiredFiles,
    coveredFiles,
    missingFiles,
    files,
  };
}

export function isCoverageRequired(workspace: LedgerWorkspace, filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (findMatchingPattern(normalized, workspace.config.git.ignore)) {
    return false;
  }
  return Boolean(findMatchingPattern(normalized, workspace.config.git.requireEntryFor));
}

export function isIgnoredByGitConfig(workspace: LedgerWorkspace, filePath: string): boolean {
  return Boolean(findMatchingPattern(normalizePath(filePath), workspace.config.git.ignore));
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern === "**") return true;
  if (normalizedPattern.endsWith("/**") && !normalizedPattern.startsWith("**/")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith("**/") && !normalizedPattern.slice(3).includes("*")) {
    const suffix = normalizedPattern.slice(3);
    return normalizedPath === suffix || normalizedPath.endsWith(`/${suffix}`);
  }
  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern;
}

export function coveragePatternMatches(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.startsWith("glob:")) {
    return matchesGlob(normalizedPath, normalizedPattern.slice("glob:".length));
  }
  if (normalizedPattern.startsWith("prefix:")) {
    return matchesPrefix(normalizedPath, normalizedPattern.slice("prefix:".length));
  }
  if (normalizedPattern.endsWith("/")) {
    return matchesPrefix(normalizedPath, normalizedPattern);
  }
  if (normalizedPattern.includes("*")) {
    return matchesGlob(normalizedPath, normalizedPattern);
  }
  return normalizedPath === normalizedPattern;
}

export function isCoveragePattern(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith("glob:") ||
    normalized.startsWith("prefix:") ||
    normalized.includes("*") ||
    normalized.endsWith("/")
  );
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
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

function explainCoverageForPath(
  workspace: LedgerWorkspace,
  filePath: string,
  coveragePatterns: readonly string[],
): LedgerCoverageFile {
  const normalized = normalizePath(filePath);
  const ignoredBy = findMatchingPattern(normalized, workspace.config.git.ignore);
  if (ignoredBy) {
    return {
      path: normalized,
      required: false,
      covered: false,
      status: "ignored",
      ignoredBy,
      coveredBy: [],
    };
  }

  const requiredBy = findMatchingPattern(normalized, workspace.config.git.requireEntryFor);
  if (!requiredBy) {
    return {
      path: normalized,
      required: false,
      covered: false,
      status: "not-required",
      coveredBy: [],
    };
  }

  const coveredBy = coveragePatterns.filter((pattern) =>
    coveragePatternMatches(normalized, pattern),
  );
  return {
    path: normalized,
    required: true,
    covered: coveredBy.length > 0,
    status: coveredBy.length > 0 ? "covered" : "missing",
    requiredBy,
    coveredBy,
  };
}

function collectCoveragePatterns(documents: readonly ParsedLedgerDocument[]): readonly string[] {
  const paths = new Set<string>();
  for (const document of documents) {
    const normalized = normalizeDocument(document);
    for (const filePath of normalized.files) {
      paths.add(normalizePath(filePath));
    }
  }
  return [...paths].sort();
}

function findMatchingPattern(
  filePath: string,
  patterns: readonly string[],
): string | undefined {
  return patterns.find((pattern) => matchesGlob(filePath, pattern));
}

function matchesPrefix(filePath: string, prefix: string): boolean {
  const normalizedPrefix = normalizePath(prefix).replace(/\/$/, "");
  return filePath === normalizedPrefix || filePath.startsWith(`${normalizedPrefix}/`);
}
