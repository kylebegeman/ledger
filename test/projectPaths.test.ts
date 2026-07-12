import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoEscapingSymlink,
  assertSafeProjectRelativePath,
  resolveProjectPath,
} from "../src/projectPaths.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("project path safety", () => {
  it("accepts normalized project-relative paths", () => {
    expect(assertSafeProjectRelativePath("./.ledger\\entries", "source.entries"))
      .toBe(".ledger/entries");
    expect(resolveProjectPath("/repo", "docs/README.md")).toBe("/repo/docs/README.md");
  });

  it("rejects traversal, absolute paths, and null bytes", () => {
    expect(() => assertSafeProjectRelativePath("")).toThrow("path is required");
    expect(() => assertSafeProjectRelativePath(".")).toThrow("path is required");
    expect(() => assertSafeProjectRelativePath("../outside")).toThrow("parent traversal");
    expect(() => assertSafeProjectRelativePath("/tmp/outside")).toThrow("absolute paths");
    expect(() => assertSafeProjectRelativePath("C:\\outside")).toThrow("absolute paths");
    expect(() => assertSafeProjectRelativePath("C:outside")).toThrow("absolute paths");
    expect(() => assertSafeProjectRelativePath("docs/\0secret")).toThrow("null bytes");
  });

  it("rejects deterministic traversal variants", () => {
    const separators = ["/", "\\"];
    const prefixes = ["", ".", "safe", "safe/nested"];
    const suffixes = ["outside", "outside/file.md", ".."];
    for (const separator of separators) {
      for (const prefix of prefixes) {
        for (const suffix of suffixes) {
          const segments = [prefix, "..", suffix].filter(Boolean);
          expect(
            () => assertSafeProjectRelativePath(segments.join(separator)),
            segments.join(separator),
          ).toThrow("parent traversal");
        }
      }
    }
  });

  it("rejects configured paths whose existing ancestor is an escaping symlink", async () => {
    const project = await temporaryDirectory("ledger-path-project-");
    const outside = await temporaryDirectory("ledger-path-outside-");
    await mkdir(path.join(project, ".ledger"), { recursive: true });
    await symlink(outside, path.join(project, ".ledger", "entries"));

    await expect(
      assertNoEscapingSymlink(project, path.join(project, ".ledger", "entries"), "source.entries"),
    ).rejects.toThrow("a symlink resolves outside the project");
  });
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}
