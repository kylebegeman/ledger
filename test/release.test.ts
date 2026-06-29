import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  buildReleaseDocument,
  formatReleaseMarkdown,
  getReleaseChanges,
  getUnreleasedChanges,
  validateReleaseVersion,
} from "../src/release.js";
import type { ParsedLedgerDocument } from "../src/types.js";

describe("getUnreleasedChanges", () => {
  it("selects landed or shipped change entries without a release", () => {
    const documents = [
      document("0002", "landed"),
      document("0001", "draft"),
      document("0003", "shipped", "v0.1.0"),
    ];

    expect(getUnreleasedChanges(documents).map((entry) => entry.id)).toEqual(["0002"]);
  });
});

describe("getReleaseChanges", () => {
  it("selects entries assigned to a release version", () => {
    const documents = [
      document("0002", "landed"),
      document("0001", "shipped", "v0.1.0"),
      document("0003", "landed", "v0.2.0"),
    ];

    expect(getReleaseChanges(documents, "v0.1.0").map((entry) => entry.id)).toEqual(["0001"]);
  });
});

describe("buildReleaseDocument", () => {
  it("renders valid release Markdown from unreleased entries", () => {
    const release = buildReleaseDocument([document("0001", "landed")], "v0.1.0", {
      includeUnreleased: true,
      date: "2026-06-29",
      status: "released",
    });

    expect(release.status).toBe("released");
    expect(release.entries.map((entry) => entry.id)).toEqual(["0001"]);
    expect(release.markdown).toContain('kind: "release"');
    expect(release.markdown).toContain('status: "released"');
    expect(release.markdown).toContain("## Public Notes");
    expect(release.markdown).toContain("- Change 0001");
    expect(release.markdown).toContain('- "0001"');
    expect(release.markdown).toContain("- 0001: Change 0001 [cli]");
  });
});

describe("formatReleaseMarkdown", () => {
  it("renders an empty release with required sections", () => {
    expect(formatReleaseMarkdown("v0.1.0", [], { date: "2026-06-29" })).toContain(
      "- No matching Ledger entries.",
    );
  });
});

describe("validateReleaseVersion", () => {
  it("accepts semver release names", () => {
    expect(() => validateReleaseVersion("v0.1.0")).not.toThrow();
    expect(() => validateReleaseVersion("0.1.0-beta.1")).not.toThrow();
  });

  it("rejects invalid release names", () => {
    expect(() => validateReleaseVersion("../bad")).toThrow(
      "Invalid release version: ../bad",
    );
  });
});

function document(id: string, status: string, release?: string): ParsedLedgerDocument {
  const releaseLine = release ? `release: "${release}"` : "release: null";
  const raw = `---
id: "${id}"
kind: "change"
title: "Change ${id}"
date: "2026-06-29"
status: "${status}"
areas: ["cli"]
files: ["src/cli.ts"]
symbols: []
commits: []
${releaseLine}
---

# ${id}: Change ${id}

## Summary

Summary.

## Why

Why.

## Changed Files

### src/cli.ts

- What changed: Test.
- On conflict: Keep behavior.

## Behavior And UX Impact

Impact.

## Invariants

- Keep this true.

## Verification

- npm test
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
    kind: "change",
  };
}
