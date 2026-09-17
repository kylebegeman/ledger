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
      ["status", "--short", "-z", "--untracked-files=all"],
      { cwd },
    );
    return parseNullDelimitedShortStatus(stdout).sort(compareChangedFiles);
  } catch (error) {
    throw changedFilesError(error, options);
  }
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
