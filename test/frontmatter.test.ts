import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";

describe("parseMarkdownWithFrontmatter", () => {
  it("parses YAML frontmatter and second-level sections", () => {
    const parsed = parseMarkdownWithFrontmatter(`---
id: "0001"
kind: "change"
title: "Test"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
---

# 0001: Test

## Summary

One.

## Verification

- npm test
`);

    expect(parsed.frontmatter.id).toBe("0001");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "Summary",
      "Verification",
    ]);
    expect(parsed.sections[0]?.body).toBe("One.");
  });

  it("fails without frontmatter", () => {
    expect(() => parseMarkdownWithFrontmatter("# Missing")).toThrow(
      /missing YAML frontmatter/,
    );
  });

  it("supports CRLF frontmatter fences", () => {
    const parsed = parseMarkdownWithFrontmatter(
      "---\r\nid: \"0001\"\r\nkind: \"change\"\r\ntitle: \"Test\"\r\ndate: \"2026-06-29\"\r\nstatus: \"landed\"\r\n---\r\n\r\n## Summary\r\n\r\nOne.\r\n",
    );

    expect(parsed.frontmatter.id).toBe("0001");
    expect(parsed.sections[0]?.body).toBe("One.");
  });

  it("requires the closing frontmatter fence to be its own line", () => {
    expect(() =>
      parseMarkdownWithFrontmatter(`---
id: "0001"
---not-a-fence
`),
    ).toThrow(/missing closing YAML frontmatter fence/);
  });

  it("prefixes YAML parse errors with the document path", () => {
    expect(() =>
      parseMarkdownWithFrontmatter(
        `---
id: [broken
---
`,
        ".ledger/entries/bad.md",
      ),
    ).toThrow(".ledger/entries/bad.md: invalid YAML frontmatter:");
  });
});
