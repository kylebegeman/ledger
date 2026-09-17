import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LedgerError } from "./machine.js";

const execFileAsync = promisify(execFile);

export interface GetChangedFilesOptions {
  readonly staged?: boolean;
  readonly base?: string;
  readonly head?: string;
}

export type GitChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

export interface GitChangedFile {
  readonly path: string;
  readonly status: GitChangeStatus;
}

export interface GitInspection {
  readonly available: boolean;
  readonly insideWorkTree: boolean;
  readonly root?: string;
  readonly error?: string;
}

export async function inspectGit(cwd: string): Promise<GitInspection> {
  try {
    await execFileAsync("git", ["--version"], { cwd });
  } catch (error) {
    return {
      available: false,
      insideWorkTree: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const { stdout: insideStdout } = await execFileAsync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd },
    );
    const insideWorkTree = insideStdout.trim() === "true";
    const { stdout: rootStdout } = insideWorkTree
      ? await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd })
      : { stdout: "" };
    return {
      available: true,
      insideWorkTree,
      root: rootStdout.trim() || undefined,
    };
  } catch (error) {
    return {
      available: true,
      insideWorkTree: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The HEAD commit hash, or undefined outside a repository or before the first commit. */
export async function getHeadCommit(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
    const hash = stdout.trim();
    return /^[a-f0-9]{7,64}$/.test(hash) ? hash : undefined;
  } catch {
    return undefined;
  }
}

export async function getChangedFiles(
  cwd: string,
  options: GetChangedFilesOptions = {},
): Promise<readonly string[]> {
  return (await getChangedFileDetails(cwd, options)).map((file) => file.path);
}

export async function getChangedFileDetails(
  cwd: string,
  options: GetChangedFilesOptions = {},
): Promise<readonly GitChangedFile[]> {
  validateChangedFilesOptions(options);
  try {
    return await relativeToProject(cwd, await repositoryChangedFiles(cwd, options));
  } catch (error) {
    throw changedFilesError(error, options);
  }
}

/** Changed files as Git reports them, relative to the repository root. */
async function repositoryChangedFiles(
  cwd: string,
  options: GetChangedFilesOptions,
): Promise<readonly GitChangedFile[]> {
  try {
    if (options.base !== undefined && options.head !== undefined) {
      const { stdout } = await execFileAsync(
        "git",
        [
          "diff",
          "--name-status",
          "-z",
          "--find-renames",
          `${options.base}...${options.head}`,
          "--",
        ],
        { cwd },
      );
      return parseNullDelimitedNameStatus(stdout).sort(compareChangedFiles);
    }

    if (options.staged) {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--name-status", "-z", "--find-renames", "--cached", "--"],
        { cwd },
      );
      return parseNullDelimitedNameStatus(stdout).sort(compareChangedFiles);
    }

    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd },
    );
    return parseNullDelimitedShortStatus(stdout).sort(compareChangedFiles);
  } catch (error) {
    throw changedFilesError(error, options);
  }
}

/**
 * Git reports status and diff paths from the repository root, while Ledger
 * works with paths relative to its project root, which may be a directory
 * inside the repository. Paths under the project root are rebased onto it;
 * paths elsewhere in the repository are dropped.
 */
async function relativeToProject(cwd: string, files: readonly GitChangedFile[]): Promise<readonly GitChangedFile[]> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-prefix"], { cwd });
  const prefix = stdout.trim();
  if (prefix.length === 0) return files;
  return files
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
}

function validateChangedFilesOptions(options: GetChangedFilesOptions): void {
  if (options.base !== undefined && typeof options.base !== "string") {
    throw new LedgerError("invalid-argument", "Git base revision must be a string.", {
      field: "base",
    });
  }
  if (options.head !== undefined && typeof options.head !== "string") {
    throw new LedgerError("invalid-argument", "Git head revision must be a string.", {
      field: "head",
    });
  }
  const hasBase = options.base !== undefined;
  const hasHead = options.head !== undefined;
  if (hasBase !== hasHead) {
    throw new LedgerError(
      "invalid-argument",
      "Git change ranges require both base and head revisions.",
    );
  }
  if (options.staged && hasBase) {
    throw new LedgerError(
      "invalid-argument",
      "Git change ranges cannot be combined with staged change inspection.",
    );
  }
  if (options.base !== undefined) validateGitRevision(options.base, "base");
  if (options.head !== undefined) validateGitRevision(options.head, "head");
}

function validateGitRevision(revision: string, name: "base" | "head"): void {
  if (
    revision.length === 0 ||
    revision.length > 1_024 ||
    revision.startsWith("-") ||
    /[\u0000-\u0020\u007f]/.test(revision)
  ) {
    throw new LedgerError("invalid-argument", `Invalid Git ${name} revision.`, { field: name });
  }
}

function parseNullDelimitedNameStatus(output: string): GitChangedFile[] {
  const values = output.split("\0");
  const files: GitChangedFile[] = [];
  let index = 0;
  while (index < values.length) {
    const code = values[index++];
    if (!code) continue;
    if (code.startsWith("R") || code.startsWith("C")) {
      const sourcePath = values[index++];
      const destinationPath = values[index++];
      if (code.startsWith("R") && sourcePath) {
        files.push({ path: sourcePath, status: "deleted" });
      }
      if (destinationPath) {
        files.push({ path: destinationPath, status: statusFromCode(code) });
      }
      continue;
    }
    const filePath = values[index++];
    if (filePath) files.push({ path: filePath, status: statusFromCode(code) });
  }
  return files;
}

function parseNullDelimitedShortStatus(output: string): GitChangedFile[] {
  const values = output.split("\0");
  const files: GitChangedFile[] = [];
  let index = 0;
  while (index < values.length) {
    const value = values[index++];
    if (!value) continue;
    const code = value.slice(0, 2);
    const destinationPath = value.slice(3);
    if (code.includes("R") || code.includes("C")) {
      const sourcePath = values[index++];
      if (code.includes("R") && sourcePath) {
        files.push({ path: sourcePath, status: "deleted" });
      }
    }
    if (destinationPath) {
      files.push({ path: destinationPath, status: statusFromShortCode(code) });
    }
  }
  return files;
}

function changedFilesError(
  error: unknown,
  options: GetChangedFilesOptions,
): LedgerError {
  if (error instanceof LedgerError) return error;
  const mode = options.base !== undefined && options.head !== undefined
    ? "range"
    : options.staged
      ? "staged"
      : "working-tree";
  const reason = error instanceof Error
    ? error.message.replace(/\s+/g, " ").trim().slice(0, 1_000)
    : String(error).replace(/\s+/g, " ").trim().slice(0, 1_000);
  return new LedgerError(
    "operational-error",
    `Unable to inspect Git ${mode} changes${reason ? `: ${reason}` : "."}`,
    {
      operation: "git-changed-files",
      mode,
      base: options.base,
      head: options.head,
    },
    error instanceof Error ? { cause: error } : undefined,
  );
}

export function parseStatusLine(line: string): GitChangedFile | undefined {
  if (line.trim().length === 0) return undefined;
  const code = line.slice(0, 2);
  const value = line.slice(3).trim();
  if (!value) return undefined;
  const renameParts = value.split(" -> ");
  return {
    path: renameParts.at(-1) ?? value,
    status: statusFromShortCode(code),
  };
}

export function parseNameStatusLine(line: string): GitChangedFile | undefined {
  if (line.trim().length === 0) return undefined;
  const parts = line.split(/\t+/).filter((part) => part.length > 0);
  const code = parts[0];
  const filePath = parts.at(-1);
  if (!code || !filePath) return undefined;
  return {
    path: filePath,
    status: statusFromCode(code),
  };
}

function statusFromShortCode(code: string): GitChangeStatus {
  if (code === "??") return "untracked";
  if (code.includes("R")) return "renamed";
  if (code.includes("C")) return "copied";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("M")) return "modified";
  return "unknown";
}

function statusFromCode(code: string): GitChangeStatus {
  const first = code[0];
  if (first === "R") return "renamed";
  if (first === "C") return "copied";
  if (first === "D") return "deleted";
  if (first === "A") return "added";
  if (first === "M") return "modified";
  return "unknown";
}

function compareChangedFiles(left: GitChangedFile, right: GitChangedFile): number {
  return left.path.localeCompare(right.path);
}

/** An inclusive range of 1-based line numbers in the new version of a file. */
export interface GitLineRange {
  readonly start: number;
  readonly end: number;
}

const lineRangesMaxBuffer = 32 * 1024 * 1024;

/**
 * The new-side lines each file's diff touches, keyed by the path relative to
 * `cwd`: working-tree and staged edits against HEAD, or with `staged` only the
 * staged ones. A deletion counts as a change to the line before it. A file the
 * diff adds whole, an untracked file, and a file with no text hunks (binary or
 * mode-only) are left out, because every line of them counts as changed.
 * Returns undefined when Git cannot answer, such as before the first commit.
 */
export async function getChangedLineRanges(
  cwd: string,
  paths: readonly string[],
  options: { readonly staged?: boolean } = {},
): Promise<ReadonlyMap<string, readonly GitLineRange[]> | undefined> {
  if (paths.length === 0) return new Map();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      [
        "--literal-pathspecs",
        "-c",
        "core.quotePath=false",
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-renames",
        "--unified=0",
        "--relative",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        ...(options.staged ? ["--cached"] : ["HEAD"]),
        "--",
        ...paths,
      ],
      { cwd, maxBuffer: lineRangesMaxBuffer },
    ));
  } catch {
    return undefined;
  }
  return parseChangedLineRanges(stdout);
}

/** Hunk ranges from `git diff --unified=0` output with `a/` and `b/` prefixes. */
export function parseChangedLineRanges(diff: string): ReadonlyMap<string, readonly GitLineRange[]> {
  const ranges = new Map<string, GitLineRange[]>();
  let inHeader = false;
  let addedWhole = false;
  let current: GitLineRange[] | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      addedWhole = false;
      current = undefined;
      continue;
    }
    if (inHeader && !line.startsWith("@@")) {
      if (line.startsWith("new file mode") || line === "--- /dev/null") addedWhole = true;
      if (line.startsWith("+++ ")) {
        // Git ends the line with a tab when the path holds a space.
        const target = unquoteGitPath(line.slice(4).replace(/\t$/, ""));
        if (target !== "/dev/null" && !addedWhole) {
          current = [];
          ranges.set(target.replace(/^b\//, ""), current);
        }
      }
      continue;
    }
    inHeader = false;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !current) continue;
    const start = Number.parseInt(hunk[1]!, 10);
    const count = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
    const first = Math.max(start, 1);
    current.push(count === 0 ? { start: first, end: first } : { start: first, end: start + count - 1 });
  }
  return ranges;
}

const gitPathEscapes: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/** Undo Git's C-style quoting of a path that holds quotes, backslashes, or control characters. */
function unquoteGitPath(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  const bytes: Buffer[] = [];
  for (const match of value.slice(1, -1).matchAll(/\\([0-7]{3}|.)|[^\\]+/gs)) {
    const escape = match[1];
    if (escape === undefined) bytes.push(Buffer.from(match[0], "utf8"));
    else if (/^[0-7]{3}$/.test(escape)) bytes.push(Buffer.from([Number.parseInt(escape, 8) & 0xff]));
    else bytes.push(Buffer.from([gitPathEscapes[escape] ?? escape.charCodeAt(0)]));
  }
  return Buffer.concat(bytes).toString("utf8");
}

/** Upper bound on tracked paths returned by listTrackedFiles; larger trees are truncated. */
export const maxTrackedFiles = 200_000;
const trackedFilesMaxBuffer = 64 * 1024 * 1024;

/**
 * Tracked files relative to cwd, sorted, as git ls-files reports them. Returns an empty list
 * when Git is unavailable, cwd is outside a work tree, or the listing fails.
 */
export async function listTrackedFiles(cwd: string): Promise<readonly string[]> {
  const inspection = await inspectGit(cwd);
  if (!inspection.available || !inspection.insideWorkTree) return [];
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z", "--cached"], {
      cwd,
      maxBuffer: trackedFilesMaxBuffer,
    });
    return stdout
      .split("\0")
      .filter((file) => file.length > 0)
      .sort()
      .slice(0, maxTrackedFiles);
  } catch {
    return [];
  }
}
