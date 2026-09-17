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

  it("accepts source changes with a reviewed not-needed declaration", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([], {
        status: "not-needed",
        reason: "Internal CLI plumbing only.",
      })],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(impact.declarations).toEqual([
      {
        entry: ".ledger/entries/0001-docs.md",
        status: "not-needed",
        reason: "Internal CLI plumbing only.",
        docs: [],
      },
    ]);
    expect(impact.missingDocsImpact).toEqual([]);
  });

  it("ignores TODO not-needed declarations", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([], {
        status: "not-needed",
        reason: "TODO: explain why docs are not needed.",
      })],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(impact.declarations).toEqual([]);
    expect(impact.missingDocsImpact).toEqual(["src/cli.ts"]);
  });

  it("does not let a docs edit alone satisfy a source file", () => {
    const impact = buildDocsImpact(workspace(), [document([])], [
      "src/cli.ts",
      "docs/architecture/runtime.md",
    ]);

    expect(impact.docsFiles).toEqual(["docs/architecture/runtime.md"]);
    expect(impact.files).toEqual([{ path: "src/cli.ts", satisfied: false, entries: [], evidence: [] }]);
    expect(impact.missingDocsImpact).toEqual(["src/cli.ts"]);
  });

  it("attributes evidence per file through the entries that list each file", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([], { status: "not-needed", reason: "CLI plumbing." })],
      ["src/cli.ts", "src/other.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(impact.files.map((file) => [file.path, file.satisfied])).toEqual([
      ["src/cli.ts", true],
      ["src/other.ts", false],
    ]);
    expect(impact.files[0]?.evidence).toEqual([
      { entry: ".ledger/entries/0001-docs.md", kind: "declaration", status: "not-needed", reason: "CLI plumbing.", docs: [] },
    ]);
    expect(impact.missingDocsImpact).toEqual(["src/other.ts"]);
    const report = formatDocsImpactReport(impact);
    expect(report).toContain("- satisfied: `src/cli.ts`");
    expect(report).toContain("- missing: `src/other.ts` (no changed entry lists it)");
  });

  it("lets an earlier receipt satisfy a file only under git.coverage any", () => {
    const earlier = [document([], { status: "not-needed", reason: "Internal plumbing." })];
    const strict = buildDocsImpact(workspace(), earlier, ["src/cli.ts"]);
    expect(strict.mode).toBe("current");
    expect(strict.missingDocsImpact).toEqual(["src/cli.ts"]);
    expect(strict.earlierEvidenceFiles).toEqual([]);

    const relaxed = buildDocsImpact(workspace(), earlier, ["src/cli.ts", "src/other.ts"], { mode: "any" });
    expect(relaxed.files.map((file) => [file.path, file.satisfied, file.earlierEvidence ?? false])).toEqual([
      ["src/cli.ts", true, true],
      ["src/other.ts", false, false],
    ]);
    expect(relaxed.files[0]?.entries).toEqual([".ledger/entries/0001-docs.md"]);
    expect(relaxed.missingDocsImpact).toEqual(["src/other.ts"]);
    expect(relaxed.earlierEvidenceFiles).toEqual(["src/cli.ts"]);
    const report = formatDocsImpactReport(relaxed);
    expect(report).toContain("- satisfied by earlier receipts: `src/cli.ts`");
    expect(report).toContain("- Satisfied by earlier receipts (git.coverage any): 1");

    const unreviewed = [document([], { status: "none", reason: "TODO: decide." })];
    expect(buildDocsImpact(workspace(), unreviewed, ["src/cli.ts"], { mode: "any" }).missingDocsImpact).toEqual(["src/cli.ts"]);
    // An updated status with a placeholder reason is just as unreviewed.
    const placeholder = [document([], { status: "updated", reason: "TODO: explain why durable docs were updated or not needed." })];
    expect(buildDocsImpact(workspace(), placeholder, ["src/cli.ts"], { mode: "any" }).missingDocsImpact).toEqual(["src/cli.ts"]);
    const changedFirst = buildDocsImpact(workspace(), earlier, ["src/cli.ts", ".ledger/entries/0001-docs.md"], { mode: "any" });
    expect(changedFirst.files[0]).toEqual(expect.not.objectContaining({ earlierEvidence: true }));
    expect(changedFirst.earlierEvidenceFiles).toEqual([]);
  });

  it("marks a listed file without a reviewed declaration as missing", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([], { status: "none", reason: "TODO: decide." })],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );
    expect(impact.files[0]).toMatchObject({ satisfied: false, entries: [".ledger/entries/0001-docs.md"], evidence: [] });
    expect(formatDocsImpactReport(impact)).toContain("without a reviewed docs impact");
  });
});

describe("formatDocsImpactReport", () => {
  it("renders missing docs impact", () => {
    const impact = buildDocsImpact(workspace(), [document([])], ["src/cli.ts"]);
    expect(formatDocsImpactReport(impact)).toContain("- `src/cli.ts`");
  });

  it("renders explicit docs impact declarations", () => {
    const impact = buildDocsImpact(
      workspace(),
      [document([], { status: "none", reason: "No durable docs affected." })],
      ["src/cli.ts", ".ledger/entries/0001-docs.md"],
    );

    expect(formatDocsImpactReport(impact)).toContain(
      ".ledger/entries/0001-docs.md`: none: No durable docs affected.",
    );
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
  docs: readonly string[],
  docsImpact?: { readonly status: string; readonly reason?: string; readonly docs?: readonly string[] },
): ParsedLedgerDocument {
  const docsLines =
    docs.length > 0 ? docs.map((filePath) => `  - "${filePath}"`).join("\n") : "  []";
  const docsImpactLines = docsImpact
    ? [
        "docsImpact:",
        `  status: "${docsImpact.status}"`,
        ...(docsImpact.reason ? [`  reason: "${docsImpact.reason}"`] : []),
        ...(docsImpact.docs
          ? [
              "  docs:",
              ...docsImpact.docs.map((filePath) => `    - "${filePath}"`),
            ]
          : []),
      ].join("\n")
    : "";
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
${docsImpactLines}
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
