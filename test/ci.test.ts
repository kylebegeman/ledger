import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.js";
import { runCiChecks } from "../src/ci.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

describe("runCiChecks", () => {
  it("passes when validation, docs, coverage, and docs impact pass", async () => {
    const result = await runCiChecks(workspace(), [document({ title: "Valid" })]);

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => [check.name, check.ok])).toEqual([
      ["validate", true],
      ["docs", true],
      ["coverage", true],
      ["docs-impact", true],
    ]);
  });

  it("fails when validation fails", async () => {
    const result = await runCiChecks(workspace(), [document({ title: "" })]);

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "validate")?.ok).toBe(false);
  });
});

function workspace(): LedgerWorkspace {
  const projectRoot = os.tmpdir();
  return {
    projectRoot,
    ledgerRoot: path.join(projectRoot, ".ledger"),
    configPath: path.join(projectRoot, ".ledger", "config.yaml"),
    config: {
      ...defaultConfig,
      docs: { ...defaultConfig.docs, root: "ledger-ci-test-docs-not-present" },
    },
  };
}

function document(options: { readonly title: string }): ParsedLedgerDocument {
  const titleLine = options.title ? `title: "${options.title}"` : "title: null";
  const raw = `---
id: "0001"
kind: "change"
${titleLine}
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols: []
commits: []
---

# 0001: ${options.title}

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
    absolutePath: "/tmp/ledger/.ledger/entries/0001.md",
    relativePath: ".ledger/entries/0001.md",
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}
