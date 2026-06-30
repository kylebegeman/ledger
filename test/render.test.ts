import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel, renderStaticReaderHtml } from "../src/render.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("buildStaticReaderModel", () => {
  it("normalizes documents and counts kinds", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Change"),
      document("D001", "decision", "Decision"),
    ]);

    expect(model.project).toBe("ledger-project");
    expect(model.stats.documents).toBe(2);
    expect(model.stats.changes).toBe(1);
    expect(model.stats.decisions).toBe(1);
    expect(model.documents.map((entry) => entry.id)).toEqual(["0001", "D001"]);
    expect(model.documents[0]?.summary).toBe("Summary.");
    expect(model.documents[0]?.invariants).toEqual(["Keep this true."]);
    expect(model.documents[0]?.verification).toEqual(["npm test"]);
    expect(model.facets.kinds).toContainEqual({ value: "change", count: 1 });
    expect(model.facets.areas).toContainEqual({ value: "cli", count: 2 });
    expect(model.facets.releases).toContainEqual({ value: "v1.0.0", count: 2 });
  });
});

describe("renderStaticReaderHtml", () => {
  it("renders escaped source and embedded JSON data", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Escape <script>"),
    ]);
    const html = renderStaticReaderHtml(model, { iconSvg: "<svg><title>Ledger</title></svg>" });

    expect(html).toContain("Escape &lt;script&gt;");
    expect(html).toContain('<script id="ledger-data" type="application/json">');
    expect(html).toContain("\\u003cscript>");
    expect(html).toContain("<svg><title>Ledger</title></svg>");
    expect(html).toContain("Markdown Source");
    expect(html).toContain("Missing refs");
    expect(html).toContain("Coverage");
    expect(html).toContain("Tag");
    expect(html).toContain('href="../entries/0001.md"');
    expect(html).toContain("Invariants");
    expect(html).toContain("Verification");
    expect(html).toContain("Browse");
    expect(html).toContain("facet-button");
    expect(html).toContain("Decisions");
    expect(html).toContain("D001");
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

function document(
  id: string,
  kind: "change" | "backlog" | "decision" | "release",
  title: string,
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "${title}"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols: []
commits: []
release: "v1.0.0"
decisions:
  - "D001"
backlog:
  - "B001"
---

# ${id}: ${title}

## Summary

Summary.

## Invariants

- Keep this true.

## Verification

- npm test
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
