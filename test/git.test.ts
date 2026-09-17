import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getChangedFileDetails,
  inspectGit,
  listTrackedFiles,
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

  it("reports committed changes from a clean merge-base range", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-range-test-"));
    await git("init");
    await git("config", "user.email", "ledger@example.com");
    await git("config", "user.name", "Ledger Test");
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "existing.ts"), "export {};\n");
    await git("add", ".");
    await git("commit", "-m", "base");
    const base = await gitOutput("rev-parse", "HEAD");
    await writeFile(path.join(tempDir, "src", "range.ts"), "export const range = true;\n");
    await git("add", ".");
    await git("commit", "-m", "head");
    const head = await gitOutput("rev-parse", "HEAD");

    await expect(getChangedFileDetails(tempDir)).resolves.toEqual([]);
    await expect(getChangedFileDetails(tempDir, { base, head })).resolves.toEqual([
      { path: "src/range.ts", status: "added" },
    ]);
  });

  it("reports both sides of renames", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-rename-test-"));
    await git("init");
    await git("config", "user.email", "ledger@example.com");
    await git("config", "user.name", "Ledger Test");
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "original.ts"), "export const value = true;\n");
    await git("add", ".");
    await git("commit", "-m", "base");
    const base = await gitOutput("rev-parse", "HEAD");
    await mkdir(path.join(tempDir, "archive"), { recursive: true });
    await git("mv", "src/original.ts", "archive/moved.ts");

    const expected = [
      { path: "archive/moved.ts", status: "renamed" },
      { path: "src/original.ts", status: "deleted" },
    ];
    await expect(getChangedFileDetails(tempDir)).resolves.toEqual(expected);
    await expect(getChangedFileDetails(tempDir, { staged: true })).resolves.toEqual(expected);

    await git("commit", "-m", "move out of source scope");
    const head = await gitOutput("rev-parse", "HEAD");
    await expect(getChangedFileDetails(tempDir, { base, head })).resolves.toEqual(expected);
  });

  it("rejects incomplete ranges and reports Git failures", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-error-test-"));

    await expect(getChangedFileDetails(tempDir, { base: "HEAD" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(getChangedFileDetails(tempDir, { base: "", head: "" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      getChangedFileDetails(
        tempDir,
        { base: null, head: null } as unknown as Parameters<typeof getChangedFileDetails>[1],
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(getChangedFileDetails(tempDir)).rejects.toMatchObject({
      code: "operational-error",
      details: {
        operation: "git-changed-files",
        mode: "working-tree",
      },
    });
  });

  it("lists tracked files sorted and relative to cwd", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-git-tracked-test-")));
    await git("init");
    await git("config", "user.email", "ledger@example.com");
    await git("config", "user.name", "Ledger Test");
    await mkdir(path.join(tempDir, "src", "nested"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "nested", "deep.ts"), "export {};\n");
    await writeFile(path.join(tempDir, "Makefile"), "check:\n");
    await writeFile(path.join(tempDir, "src", "a.ts"), "export {};\n");
    await git("add", ".");
    await git("commit", "-m", "base");
    await writeFile(path.join(tempDir, "src", "untracked.ts"), "export {};\n");

    await expect(listTrackedFiles(tempDir)).resolves.toEqual(["Makefile", "src/a.ts", "src/nested/deep.ts"]);
    await expect(listTrackedFiles(path.join(tempDir, "src"))).resolves.toEqual(["a.ts", "nested/deep.ts"]);
  }, 30_000);

  it("lists no tracked files outside a work tree", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-git-tracked-test-")));
    await writeFile(path.join(tempDir, "file.ts"), "export {};\n");

    await expect(listTrackedFiles(tempDir)).resolves.toEqual([]);
  });

  it("inspects Git availability", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-test-"));
    await git("init");

    await expect(inspectGit(tempDir)).resolves.toMatchObject({
      available: true,
      insideWorkTree: true,
    });
  });

  it("distinguishes Git availability from worktree membership", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-git-test-"));

    await expect(inspectGit(tempDir)).resolves.toMatchObject({
      available: true,
      insideWorkTree: false,
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

async function gitOutput(...args: readonly string[]): Promise<string> {
  if (!tempDir) throw new Error("missing tempDir");
  return await new Promise<string>((resolve, reject) => {
    execFile("git", [...args], { cwd: tempDir }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}
