import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildDocsImpact, formatDocsImpactReport } from "../src/docsImpact.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("buildDocsImpact", () => {
  it("accepts source changes when a changed Ledger entry references docs", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document(["docs/architecture/runtime.md"])],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(impact.sourceFiles).toEqual(["src/cli.ts"]);
    expect(impact.changedEntries).toEqual([".ledger/entries/0001-docs.md"]);
    expect(impact.referencedDocs).toEqual(["docs/architecture/runtime.md"]);
    expect(impact.missingDocsImpact).toEqual([]);
  });

  it("reports source changes without docs impact", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([])],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(impact.missingDocsImpact).toEqual(["src/cli.ts"]);
  });

  it("accepts source changes when docs files changed directly", () => {
    const impact = buildDocsImpact(workspace(), [document([])], [
      "src/cli.ts",
      "docs/architecture/runtime.md",
    ]);

    expect(impact.docsFiles).toEqual(["docs/architecture/runtime.md"]);
    expect(impact.missingDocsImpact).toEqual([]);
  });
});

describe("formatDocsImpactReport", () => {
  it("renders missing docs impact", () => {
    const impact = buildDocsImpact(workspace(), [document([])], ["src/cli.ts"]);
    expect(formatDocsImpactReport(impact)).toContain("- `src/cli.ts`");
  });
});

function workspace(): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger",
    ledgerRoot: "/tmp/ledger/.ledger",
    configPath: "/tmp/ledger/.ledger/config.yaml",
    config: defaultConfig,
  };
}

function document(docs: readonly string[]): ParsedLedgerDocument {
  const docsLines =
    docs.length > 0 ? docs.map((filePath) => `  - "${filePath}"`).join("\n") : "  []";
  const raw = `---
id: "0001"
kind: "change"
title: "Docs"
date: "2026-06-29"
status: "landed"
areas: ["docs"]
files:
  - "src/cli.ts"
docs:
${docsLines}
symbols: []
commits: []
---

# 0001: Docs

## Summary

Summary.
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: "/tmp/ledger/.ledger/entries/0001-docs.md",
    relativePath: ".ledger/entries/0001-docs.md",
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}
