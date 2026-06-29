import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("CLI end-to-end", () => {
  it("runs a complete project workflow in a temp workspace", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));
    const oldCwd = process.cwd();
    process.chdir(tempDir);

    try {
      expect((await captureRun(["init", "--with-docs"])).exitCode).toBe(0);
      expect(await exists(path.join(tempDir, ".ledger", "config.yaml"))).toBe(true);
      expect(await exists(path.join(tempDir, "docs", "llm", "START_HERE.md"))).toBe(true);

      const created = await captureRun([
        "new",
        "Fixture change",
        "--area",
        "cli",
        "--status",
        "landed",
      ]);
      expect(created.exitCode).toBe(0);
      expect(created.stdout).toContain(".ledger/entries/0001-fixture-change.md");

      expect((await captureRun(["validate"])).exitCode).toBe(0);
      expect((await captureRun(["index"])).exitCode).toBe(0);
      expect(await exists(path.join(tempDir, ".ledger", "indexes", "manifest.json"))).toBe(
        true,
      );

      expect((await captureRun(["render"])).exitCode).toBe(0);
      expect(await exists(path.join(tempDir, ".ledger", "dist", "index.html"))).toBe(true);

      const query = await captureRun(["query", "--kind", "change", "--area", "cli"]);
      expect(query.exitCode).toBe(0);
      expect(query.stdout).toContain("Fixture change");

      const classify = await captureRun(["docs", "classify", "docs/llm/START_HERE.md"]);
      expect(classify.exitCode).toBe(0);
      expect(classify.stdout).toContain("routing: docs/llm/START_HERE.md");

      expect((await captureRun(["ci"])).exitCode).toBe(0);
    } finally {
      process.chdir(oldCwd);
    }
  });
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function captureRun(argv: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };

  try {
    const exitCode = await run([...argv]);
    return {
      exitCode,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
