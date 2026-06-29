import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { extractBullets, getSectionBody, queryDocuments } from "../src/query.js";
import type { ParsedLedgerDocument } from "../src/types.js";

describe("queryDocuments", () => {
  const documents = [
    document("0001", "change", "landed", ["cli"]),
    document("B001", "backlog", "accepted", ["docs"]),
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
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "Title ${id}"
date: "2026-06-29"
status: "${status}"
areas: [${areas.map((area) => `"${area}"`).join(", ")}]
files: ["src/cli.ts"]
symbols: []
commits: []
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
