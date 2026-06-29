import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildAgentPacket, formatAgentPacket } from "../src/packet.js";
import type { ParsedLedgerDocument } from "../src/types.js";

describe("agent packets", () => {
  it("combines metadata, conflict rules, invariants, and verification", () => {
    const packet = buildAgentPacket([document()], "src/cli.ts");

    expect(packet.entries).toHaveLength(1);
    expect(packet.entries[0]).toMatchObject({
      id: "0001",
      title: "CLI",
      areas: ["cli"],
      symbols: ["run"],
      docs: ["docs/ARCHITECTURE.md"],
      matchedFiles: ["src/cli.ts"],
      conflictRules: ["Keep CLI behavior."],
      invariants: ["Exit codes stay stable."],
      verification: ["npm test"],
    });
  });

  it("formats a Markdown packet", () => {
    const markdown = formatAgentPacket(buildAgentPacket([document()], "src/cli.ts"));

    expect(markdown).toContain("# Ledger Agent Packet");
    expect(markdown).toContain("Target: `src/cli.ts`");
    expect(markdown).toContain("## 0001: CLI");
    expect(markdown).toContain("- Symbols: `run`");
    expect(markdown).toContain("### Conflict Rules");
    expect(markdown).toContain("- Keep CLI behavior.");
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
symbols:
  - "run"
docs:
  - "docs/ARCHITECTURE.md"
commits: []
---

# 0001: CLI

## Changed Files

### src/cli.ts

- What changed: Test.
- On conflict: Keep CLI behavior.

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
