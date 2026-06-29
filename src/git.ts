import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getChangedFiles(cwd: string): Promise<readonly string[]> {
  try {
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
