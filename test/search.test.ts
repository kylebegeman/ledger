import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel } from "../src/render.js";
import { searchLedgerIndex } from "../src/search.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("searchLedgerIndex", () => {
  it("ranks weighted fields ahead of broad term matches", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "Unrelated change", {
        files: ["src/render.ts"],
        symbols: [],
        summary: "Mentions metrics in prose.",
      }),
      document("0002", "Metrics CLI", {
        files: ["src/other.ts"],
        symbols: [],
        summary: "Adds a command.",
      }),
    ]);

    const matches = searchLedgerIndex(model.searchIndex, "metrics");

    expect(matches[0]?.id).toBe("0002");
    expect(matches[0]?.matchedFields).toContain("title");
  });

  it("supports fuzzy multi-token matches", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "Static reader graph", {
        files: ["src/render.ts"],
        symbols: [],
        summary: "Builds relationship graph data.",
      }),
      document("0002", "Release note", {
        files: ["src/release.ts"],
        symbols: [],
        summary: "Builds release data.",
      }),
    ]);

    const matches = searchLedgerIndex(model.searchIndex, "stat graph", { limit: 1 });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("0001");
    expect(matches[0]?.matchedFields.length).toBeGreaterThan(0);
  });
});

function workspace(projectRoot = "/tmp/ledger"): LedgerWorkspace {
  return {
    projectRoot,
    ledgerRoot: `${projectRoot}/.ledger`,
    configPath: `${projectRoot}/.ledger/config.yaml`,
    config: defaultConfig,
  };
}

function document(
  id: string,
  title: string,
  options: {
    readonly files: readonly string[];
    readonly symbols: readonly string[];
    readonly summary: string;
  },
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "change"
title: "${title}"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
${options.files.map((file) => `  - "${file}"`).join("\n")}
symbols:${yamlArray(options.symbols)}
commits: []
---

# ${id}: ${title}

## Summary

${options.summary}
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

function yamlArray(values: readonly string[]): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `  - "${value}"`).join("\n")}`;
}
