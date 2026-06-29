import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { extractBullets, getSectionBody, queryDocuments } from "../src/query.js";
import type { ParsedLedgerDocument } from "../src/types.js";

describe("queryDocuments", () => {
  const documents = [
    document("0001", "change", "landed", ["cli"], {
      release: "v0.1.1",
      decisions: ["D001"],
      backlog: ["B001"],
      symbols: ["run"],
      files: ["src/cli.ts"],
      docs: ["docs/ARCHITECTURE.md"],
    }),
    document("B001", "backlog", "accepted", ["docs"], {
      symbols: ["docs"],
      files: ["docs/PRODUCT.md"],
      docs: ["docs/PRODUCT.md"],
    }),
  ] satisfies readonly ParsedLedgerDocument[];

  it("filters by kind, status, and area", () => {
    expect(queryDocuments(documents, { kind: "change" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { status: "accepted" }).map((entry) => entry.id)).toEqual([
      "B001",
    ]);
    expect(queryDocuments(documents, { area: "docs" }).map((entry) => entry.id)).toEqual([
      "B001",
    ]);
  });

  it("filters by release, relationships, symbols, paths, docs, and id", () => {
    expect(queryDocuments(documents, { release: "v0.1.1" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { decision: "D001" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { backlog: "B001" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { symbol: "run" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { file: "cli.ts" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { doc: "docs/PRODUCT.md" }).map((entry) => entry.id)).toEqual([
      "B001",
    ]);
    expect(queryDocuments(documents, { id: "B001" }).map((entry) => entry.id)).toEqual([
      "B001",
    ]);
  });

  it("filters by text across normalized metadata", () => {
    expect(queryDocuments(documents, { text: "architecture" }).map((entry) => entry.id)).toEqual([
      "0001",
    ]);
    expect(queryDocuments(documents, { text: "PRODUCT" }).map((entry) => entry.id)).toEqual([
      "B001",
    ]);
  });
});

describe("section helpers", () => {
  it("extracts section bodies and bullets", () => {
    const parsed = document("0001", "change", "landed", ["cli"]);
    expect(getSectionBody(parsed, "Invariants")).toContain("Keep this true");
    expect(extractBullets(getSectionBody(parsed, "Invariants"))).toEqual([
      "Keep this true across wrapped lines.",
    ]);
  });
});

function document(
  id: string,
  kind: "change" | "backlog" | "decision" | "release",
  status: string,
  areas: readonly string[],
  options: {
    readonly release?: string;
    readonly decisions?: readonly string[];
    readonly backlog?: readonly string[];
    readonly symbols?: readonly string[];
    readonly files?: readonly string[];
    readonly docs?: readonly string[];
  } = {},
): ParsedLedgerDocument {
  const files = options.files ?? ["src/cli.ts"];
  const symbols = options.symbols ?? [];
  const docs = options.docs ?? [];
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "Title ${id}"
date: "2026-06-29"
status: "${status}"
areas: [${areas.map((area) => `"${area}"`).join(", ")}]
files: [${files.map((filePath) => `"${filePath}"`).join(", ")}]
symbols: [${symbols.map((symbol) => `"${symbol}"`).join(", ")}]
decisions: [${(options.decisions ?? []).map((decision) => `"${decision}"`).join(", ")}]
backlog: [${(options.backlog ?? []).map((backlog) => `"${backlog}"`).join(", ")}]
docs: [${docs.map((docPath) => `"${docPath}"`).join(", ")}]
commits: []
${options.release ? `release: "${options.release}"` : ""}
---

# ${id}: Title

## Summary

Summary.

## Invariants

- Keep this true across
  wrapped lines.
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}
