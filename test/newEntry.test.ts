import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { createChangeEntry } from "../src/newEntry.js";
import type { LedgerWorkspace } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("createChangeEntry", () => {
  it("drafts from git diff with docs references and status-aware sections", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await mkdir(path.join(tempDir, "docs", "architecture"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
    await writeFile(path.join(tempDir, "docs", "architecture", "runtime.md"), "# Runtime\n");
    await git("init");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 2;\n");
    await writeFile(
      path.join(tempDir, "docs", "architecture", "runtime.md"),
      "# Runtime\n\nUpdated.\n",
    );

    const workspace = await readWorkspace();
    const createdPath = await createChangeEntry(workspace, [], {
      title: 'Draft "quoted" diff',
      fromDiff: true,
      staged: false,
      areas: ["docs"],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");

    expect(entry).toContain('id: "0001"');
    expect(entry).toContain('title: "Draft \\"quoted\\" diff"');
    expect(entry).toContain('# 0001: Draft "quoted" diff');
    expect(entry).toContain('  - "docs/architecture/runtime.md"');
    expect(entry).toContain("docs:");
    expect(entry).toContain("### docs/architecture/runtime.md");
    expect(entry).toContain("- Status: modified");
    expect(entry).toContain("- What changed: TODO: summarize the change.");
  });
});

async function readWorkspace(): Promise<LedgerWorkspace> {
  if (!tempDir) throw new Error("missing tempDir");
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

async function git(...args: readonly string[]): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd: tempDir }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
