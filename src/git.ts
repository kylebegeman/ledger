import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GetChangedFilesOptions {
  readonly staged?: boolean;
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
    const [{ stdout: insideStdout }, { stdout: rootStdout }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd }),
      execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd }),
    ]);
    return {
      available: true,
      insideWorkTree: insideStdout.trim() === "true",
      root: rootStdout.trim() || undefined,
    };
  } catch (error) {
    return {
      available: false,
      insideWorkTree: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
  try {
    if (options.staged) {
      const { stdout } = await execFileAsync("git", ["diff", "--name-status", "--cached"], {
        cwd,
      });
      return stdout
        .split(/\r?\n/)
        .map((line) => parseNameStatusLine(line))
        .filter((file): file is GitChangedFile => Boolean(file))
        .sort(compareChangedFiles);
    }

    const { stdout } = await execFileAsync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      { cwd },
    );
    return stdout
      .split(/\r?\n/)
      .map((line) => parseStatusLine(line))
      .filter((file): file is GitChangedFile => Boolean(file))
      .sort(compareChangedFiles);
  } catch {
    return [];
  }
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
