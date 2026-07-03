import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel } from "../src/render.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("generated artifact contracts", () => {
  it("keeps the search-index artifact projection stable", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Search Model", {
        extraFrontmatter: `
release: "v1.0.0"
tags: ["golden"]
decisions: ["D001"]
backlog: ["B001"]
files: ["src/cli.ts"]
symbols: ["run"]
docs: ["docs/ARCHITECTURE.md"]
`,
        body: `
## Summary

Summary text.

## Why

Why text.

## Invariants

- Keep CLI stable.

## Verification

- npm test
`,
      }),
    ]);

    expect(
      model.searchIndex.map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.path,
        fields: entry.fields,
      })),
    ).toEqual([
      {
        id: "0001",
        title: "Search Model",
        path: ".ledger/entries/0001.md",
        fields: {
          id: "0001",
          title: "Search Model",
          path: ".ledger/entries/0001.md",
          metadata: "change landed v1.0.0 cli golden D001 B001",
          files: "src/cli.ts",
          symbols: "run",
          docs: "docs/ARCHITECTURE.md",
          summary: "Summary text. Why text.",
          context: "Keep CLI stable. npm test",
        },
      },
    ]);
  });

  it("keeps the graph artifact projection stable", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Search Model", {
        extraFrontmatter: `
release: "v1.0.0"
areas: ["cli"]
files: ["src/cli.ts"]
symbols: ["run"]
docs: ["docs/ARCHITECTURE.md"]
decisions: ["D001"]
backlog: ["B001"]
`,
      }),
      document("D001", "decision", "Decision", {
        relativePath: ".ledger/decisions/D001.md",
        extraFrontmatter: 'areas: ["architecture"]',
      }),
    ]);

    expect(model.graph).toEqual({
      nodes: [
        { id: "area:architecture", label: "architecture", type: "area" },
        { id: "area:cli", label: "cli", type: "area" },
        { id: "doc:docs/ARCHITECTURE.md", label: "docs/ARCHITECTURE.md", type: "doc" },
        { id: "file:src/cli.ts", label: "src/cli.ts", type: "file" },
        { id: "record:0001", label: "0001", type: "record" },
        { id: "record:D001", label: "D001", type: "record" },
        { id: "release:v1.0.0", label: "v1.0.0", type: "release" },
        { id: "symbol:run", label: "run", type: "symbol" },
      ],
      edges: [
        { source: "record:0001", target: "area:cli", type: "area" },
        { source: "record:0001", target: "doc:docs/ARCHITECTURE.md", type: "doc" },
        { source: "record:0001", target: "file:src/cli.ts", type: "file" },
        { source: "record:0001", target: "record:B001", type: "backlog" },
        { source: "record:0001", target: "record:D001", type: "decision" },
        { source: "record:0001", target: "release:v1.0.0", type: "release" },
        { source: "record:0001", target: "symbol:run", type: "symbol" },
        { source: "record:D001", target: "area:architecture", type: "area" },
      ],
    });
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
  kind: "change" | "decision",
  title: string,
  options: {
    readonly relativePath?: string;
    readonly extraFrontmatter?: string;
    readonly body?: string;
  } = {},
): ParsedLedgerDocument {
  const relativePath = options.relativePath ?? `.ledger/entries/${id}.md`;
  const defaultAreas = options.extraFrontmatter?.includes("areas:") ? "" : 'areas: ["cli"]';
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "${title}"
date: "2026-07-03"
status: "landed"
${defaultAreas}
${options.extraFrontmatter ?? ""}
---

# ${id}: ${title}
${options.body ?? ""}
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger/${relativePath}`,
    relativePath,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}
