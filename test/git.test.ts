import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getChangedFileDetails,
  inspectGit,
  parseNameStatusLine,
  parseStatusLine,
} from "../src/git.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("git status parsing", () => {
  it("parses short status lines", () => {
    expect(parseStatusLine(" M src/cli.ts")).toEqual({
      path: "src/cli.ts",
      status: "modified",
    });
    expect(parseStatusLine("?? docs/new.md")).toEqual({
      path: "docs/new.md",
      status: "untracked",
    });
    expect(parseStatusLine("R  old.ts -> src/new.ts")).toEqual({
      path: "src/new.ts",
      status: "renamed",
    });
  });

  it("parses staged name-status lines", () => {
    expect(parseNameStatusLine("A\tsrc/cli.ts")).toEqual({
      path: "src/cli.ts",
      status: "added",
    });
    expect(parseNameStatusLine("R100\told.ts\tsrc/new.ts")).toEqual({
      path: "src/new.ts",
      status: "renamed",
    });
  });

  it("reports untracked files inside directories", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-test-"));
    await git("init");
    await mkdir(path.join(tempDir, "src", "nested"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "nested", "new.ts"), "export {};\n");

    await expect(getChangedFileDetails(tempDir)).resolves.toEqual([
      {
        path: "src/nested/new.ts",
        status: "untracked",
      },
    ]);
  });

  it("inspects Git availability", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-test-"));
    await git("init");

    await expect(inspectGit(tempDir)).resolves.toMatchObject({
      available: true,
      insideWorkTree: true,
    });
  });
});

async function git(...args: readonly string[]): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd: tempDir }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
