import { describe, expect, it } from "vitest";
import {
  buildConflictTargets,
  extractChangedFileBlocks,
  extractConflictRules,
  formatConflictReport,
} from "../src/conflict.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import type { ParsedLedgerDocument } from "../src/types.js";

describe("extractConflictRules", () => {
  it("extracts wrapped On conflict rules", () => {
    expect(
      extractConflictRules(`### src/cli.ts

- What changed: Test.
- On conflict: Keep the command
  behavior and preserve exit codes.
- Anchor: run`),
    ).toEqual(["Keep the command behavior and preserve exit codes."]);
  });

  it("stops a rule before the next bullet", () => {
    expect(
      extractConflictRules(`- On conflict: Keep the command behavior.
- Anchor: run`),
    ).toEqual(["Keep the command behavior."]);
  });
});

describe("extractChangedFileBlocks", () => {
  it("extracts changed-file subsections", () => {
    expect(
      extractChangedFileBlocks(`### src/cli.ts

- On conflict: Keep CLI behavior.

### README.md

- On conflict: Keep examples current.`),
    ).toEqual([
      {
        title: "src/cli.ts",
        body: "- On conflict: Keep CLI behavior.",
      },
      {
        title: "README.md",
        body: "- On conflict: Keep examples current.",
      },
    ]);
  });
});

describe("buildConflictTargets", () => {
  it("collects matching entries with rules, invariants, and verification", () => {
    const [target] = buildConflictTargets([document()], ["src/cli.ts"]);

    expect(target?.entries).toHaveLength(1);
    expect(target?.entries[0]?.id).toBe("0001");
    expect(target?.entries[0]?.conflictRules).toEqual([
      "Keep CLI behavior and preserve exit codes.",
    ]);
    expect(target?.entries[0]?.invariants).toEqual(["Exit codes stay stable."]);
    expect(target?.entries[0]?.verification).toEqual(["npm test"]);
  });
});

describe("formatConflictReport", () => {
  it("renders conflict guidance as Markdown", () => {
    const targets = buildConflictTargets([document()], ["src/cli.ts", "src/missing.ts"]);
    const report = formatConflictReport(targets);

    expect(report).toContain("# Ledger Conflict Report");
    expect(report).toContain("## src/cli.ts");
    expect(report).toContain("### 0001: CLI");
    expect(report).toContain("- Entry: `.ledger/entries/0001.md`");
    expect(report).toContain("- Matched files: `src/cli.ts`");
    expect(report).toContain("#### Conflict Rules");
    expect(report).toContain("- Keep CLI behavior and preserve exit codes.");
    expect(report).toContain("## src/missing.ts");
    expect(report).toContain("No Ledger records mention this path.");
  });
});

function document(): ParsedLedgerDocument {
  const raw = `---
id: "0001"
kind: "change"
title: "CLI"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
  - "README.md"
symbols: []
commits: []
---

# 0001: CLI

## Changed Files

### src/cli.ts

- What changed: Test.
- On conflict: Keep CLI behavior and preserve exit codes.

### README.md

- What changed: Test.
- On conflict: Keep README examples current.

## Invariants

- Exit codes stay stable.

## Verification

- npm test
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: "/tmp/0001.md",
    relativePath: ".ledger/entries/0001.md",
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}
