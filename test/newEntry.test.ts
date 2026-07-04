import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, readLedgerConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { createChangeEntry, inferAreas, nextEntryId } from "../src/newEntry.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";
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
    await writeFile(
      path.join(tempDir, "src", "feature.ts"),
      "export const value = 2;\nexport function runFeature() {}\n",
    );
    await writeFile(
      path.join(tempDir, "docs", "architecture", "runtime.md"),
      "# Runtime\n\n## Configuration\n\nUpdated.\n",
    );

    const workspace = await readWorkspace();
    const createdPath = await createChangeEntry(workspace, [], {
      title: 'Draft "quoted" diff',
      fromDiff: true,
      staged: false,
      areas: [],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");

    expect(entry).toContain('id: "0001"');
    expect(entry).toContain('title: "Draft \\"quoted\\" diff"');
    expect(entry).toContain('# 0001: Draft "quoted" diff');
    expect(entry).toContain("areas:");
    expect(entry).toContain('  - "docs"');
    expect(entry).toContain('  - "feature"');
    expect(entry).toContain('  - "docs/architecture/runtime.md"');
    expect(entry).toContain("symbols:");
    expect(entry).toContain('  - "Configuration"');
    expect(entry).toContain('  - "Runtime"');
    expect(entry).toContain('  - "runFeature"');
    expect(entry).toContain('  - "value"');
    expect(entry).toContain("docs:");
    expect(entry).toContain("### docs/architecture/runtime.md");
    expect(entry).toContain("- Status: modified");
    expect(entry).toContain("summarize the documentation update");
    expect(entry).toContain("summarize the implementation change");
    expect(entry).toContain("- Anchor: Configuration, Runtime");
    expect(entry).toContain("- Anchor: runFeature, value");
    expect(entry).toContain("- Docs impact: This file is direct docs impact.");
    expect(entry).toContain("- Docs impact: TODO: name updated docs");
  });

  it("infers areas from changed paths", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    const workspace = await readWorkspace();

    expect(
      inferAreas(workspace, [
        { path: "src/runtime/session.ts", status: "modified" },
        { path: "test/runtime/session.test.ts", status: "modified" },
        { path: "docs/architecture/runtime.md", status: "modified" },
      ]),
    ).toEqual(["docs", "runtime", "tests"]);
  });

  it("allocates IDs across all entry-like records", () => {
    expect(
      nextEntryId(workspaceWithConfig(), [
        document("0001", "change"),
        document("0002", "product-note"),
      ]),
    ).toBe("0003");
  });

  it("only strips configured ID prefixes from the start of IDs", () => {
    expect(
      nextEntryId(workspaceWithConfig({
        ...defaultConfig,
        ids: { ...defaultConfig.ids, entryPrefix: "C" },
      }), [
        document("AC002", "change"),
        document("C001", "change"),
      ]),
    ).toBe("C0002");
  });
});

function workspaceWithConfig(config = defaultConfig): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger",
    ledgerRoot: "/tmp/ledger/.ledger",
    configPath: "/tmp/ledger/.ledger/config.yaml",
    config,
  };
}

function document(id: string, kind: "change" | "product-note"): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "Entry ${id}"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas: ["test"]
files: []
symbols: []
commits: []
---

# ${id}: Entry ${id}
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger/.ledger/entries/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}

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
