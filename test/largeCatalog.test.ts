import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel } from "../src/render.js";
import { searchLedgerIndex } from "../src/search.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("large catalog regression", () => {
  it("builds and searches 1,500 records within a generous regression budget", () => {
    const documents = Array.from({ length: 1_500 }, (_, index) => document(index));
    const startedAt = performance.now();
    const model = buildStaticReaderModel(workspace(), documents);
    const matches = searchLedgerIndex(model.searchIndex, "catalog target omega", { limit: 1 });
    const elapsedMs = performance.now() - startedAt;

    expect(model.documents).toHaveLength(1_500);
    expect(model.searchIndex).toHaveLength(1_500);
    expect(matches[0]?.id).toBe("1499");
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);
});

function workspace(): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger-large",
    ledgerRoot: "/tmp/ledger-large/.ledger",
    configPath: "/tmp/ledger-large/.ledger/config.yaml",
    config: defaultConfig,
  };
}

function document(index: number): ParsedLedgerDocument {
  const id = String(index).padStart(4, "0");
  const title = index === 1_499 ? "Catalog target omega" : `Catalog entry ${id}`;
  const raw = `---
id: "${id}"
kind: "change"
title: "${title}"
date: "2026-07-12"
status: "landed"
areas: ["catalog"]
files: ["src/catalog/${id}.ts"]
symbols: ["symbol${id}"]
commits: []
---

# ${id}: ${title}

## Summary

Large catalog regression fixture ${id}.

## Invariants

- Catalog lookup remains deterministic.

## Verification

- npm test
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger-large/.ledger/entries/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}
