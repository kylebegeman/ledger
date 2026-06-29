import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  buildIntegrityReport,
  formatIntegrityReport,
  writeIntegrityArtifacts,
} from "../src/integrity.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("integrity reports", () => {
  it("hashes records and catalog deterministically", () => {
    const report = buildIntegrityReport(workspace("/tmp/ledger"), [
      document("0002"),
      document("0001"),
    ]);

    expect(report.algorithm).toBe("sha256");
    expect(report.catalogHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.documents.map((entry) => entry.path)).toEqual([
      ".ledger/entries/0001.md",
      ".ledger/entries/0002.md",
    ]);
    expect(report.documents[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("formats a readable report", () => {
    const report = buildIntegrityReport(workspace("/tmp/ledger"), [document("0001")]);
    const markdown = formatIntegrityReport(report);

    expect(markdown).toContain("# Ledger Integrity Report");
    expect(markdown).toContain("Catalog hash");
    expect(markdown).toContain(".ledger/entries/0001.md");
  });

  it("writes integrity artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-integrity-test-"));
    const report = buildIntegrityReport(workspace(tempDir), [document("0001")]);
    const written = await writeIntegrityArtifacts(workspace(tempDir), report);
    const index = JSON.parse(
      await readFile(path.join(tempDir, written.indexPath), "utf8"),
    ) as { readonly catalogHash: string };
    const markdown = await readFile(path.join(tempDir, written.reportPath), "utf8");

    expect(written.indexPath).toBe(".ledger/indexes/integrity.json");
    expect(written.reportPath).toBe(".ledger/reports/integrity.md");
    expect(index.catalogHash).toBe(report.catalogHash);
    expect(markdown).toContain(report.catalogHash);
  });
});

function workspace(projectRoot: string): LedgerWorkspace {
  return {
    projectRoot,
    ledgerRoot: path.join(projectRoot, ".ledger"),
    configPath: path.join(projectRoot, ".ledger", "config.yaml"),
    config: defaultConfig,
  };
}

function document(id: string): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "change"
title: "Integrity ${id}"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["integrity"]
files:
  - "src/integrity.ts"
symbols: []
commits: []
---

# ${id}: Integrity ${id}

## Summary

Test record.
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
    kind: "change",
  };
}
