import { normalizeDocument, normalizePath } from "./documents.js";
import { getChangedFileDetails, type GetChangedFilesOptions } from "./git.js";
import { coveragePatternMatches, isCoveragePattern, matchesGlob } from "./pathPatterns.js";
import type {
  LedgerCoverageFile,
  LedgerCoverageMode,
  LedgerCoverageResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export { coveragePatternMatches, isCoveragePattern, matchesGlob } from "./pathPatterns.js";

export interface CheckCoverageOptions extends GetChangedFilesOptions {
  /** Override the configured coverage mode. */
  readonly mode?: LedgerCoverageMode;
}

/**
 * Compare changed files against Ledger file references. Under the `current`
 * mode a required path must be listed by a change entry that is itself part
 * of the change set (added or modified in the working tree, staged diff, or
 * revision range); a path listed only by older records is `historical` and
 * counts as missing. Under `any`, every record counts.
 */
export async function checkCoverage(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CheckCoverageOptions = {},
): Promise<LedgerCoverageResult> {
  const mode = options.mode ?? workspace.config.git.coverage;
  const { mode: _mode, ...changeOptions } = options;
  const changedDetails = await getChangedFileDetails(workspace.projectRoot, changeOptions);
  const changedFiles = changedDetails.map((file) => normalizePath(file.path));
  const changedSet = new Set(
    changedDetails.filter((file) => file.status !== "deleted").map((file) => normalizePath(file.path)),
  );
  const coveragePatterns = collectCoveragePatterns(documents);
  const currentEntries = documents
    .filter((document) => document.kind === "change" && changedSet.has(normalizePath(document.relativePath)))
    .map((document) => {
      const normalized = normalizeDocument(document);
      return { id: normalized.id, files: normalized.files.map(normalizePath) };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const files = changedFiles.map((filePath) =>
    explainCoverageForPath(workspace, filePath, coveragePatterns, currentEntries, mode),
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
  const historicalFiles = files
    .filter((file) => file.status === "historical")
    .map((file) => file.path);

  return {
    mode,
    changedFiles,
    requiredFiles,
    coveredFiles,
    missingFiles,
    historicalFiles,
    currentEntries: currentEntries.map((entry) => entry.id),
    files,
  };
}

interface CurrentEntry {
  readonly id: string;
  readonly files: readonly string[];
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

function explainCoverageForPath(
  workspace: LedgerWorkspace,
  filePath: string,
  coveragePatterns: readonly string[],
  currentEntries: readonly CurrentEntry[],
  mode: LedgerCoverageMode,
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
      currentEntries: [],
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
      currentEntries: [],
    };
  }

  const coveredBy = coveragePatterns.filter((pattern) =>
    coveragePatternMatches(normalized, pattern),
  );
  const current = currentEntries
    .filter((entry) => entry.files.some((pattern) => coveragePatternMatches(normalized, pattern)))
    .map((entry) => entry.id);
  // Under any, an earlier receipt counts only when it names the file. A pattern such as src/** counts
  // only from a receipt in the change set, so one old receipt never exempts a directory for good.
  const covered = current.length > 0 || (mode === "any" && coveredBy.some((pattern) => !isCoveragePattern(pattern)));
  const status = covered
    ? "covered"
    : coveredBy.length > 0
      ? "historical"
      : "missing";
  return {
    path: normalized,
    required: true,
    covered,
    status,
    requiredBy,
    coveredBy,
    currentEntries: current,
  };
}

/**
 * File references from every change entry. Only receipts count: session
 * records expire and are pruned, and backlog items and decisions describe
 * intent, so none of them can stand in for a receipt, and docs impact reads
 * the same set.
 */
function collectCoveragePatterns(documents: readonly ParsedLedgerDocument[]): readonly string[] {
  const paths = new Set<string>();
  for (const document of documents) {
    if (document.kind !== "change") continue;
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
