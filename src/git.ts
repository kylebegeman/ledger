import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GetChangedFilesOptions {
  readonly staged?: boolean;
}

export async function getChangedFiles(
  cwd: string,
  options: GetChangedFilesOptions = {},
): Promise<readonly string[]> {
  try {
    if (options.staged) {
      const { stdout } = await execFileAsync("git", ["diff", "--name-only", "--cached"], {
        cwd,
      });
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((filePath) => filePath.length > 0)
        .sort();
    }

    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd });
    return stdout
      .split(/\r?\n/)
      .map((line) => parseStatusLine(line))
      .filter((file): file is string => Boolean(file))
      .sort();
  } catch {
    return [];
  }
}

function parseStatusLine(line: string): string | undefined {
  if (line.trim().length === 0) return undefined;
  const value = line.slice(3).trim();
  if (!value) return undefined;
  const renameParts = value.split(" -> ");
  return renameParts.at(-1);
}
