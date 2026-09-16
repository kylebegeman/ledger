import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildAgentPacket } from "../src/packet.js";
import { buildConflictTargets } from "../src/conflict.js";
import { explainFile } from "../src/indexer.js";
import { matchFilePath, retrieveByPath, supersededByIndex } from "../src/retrieval.js";
import type { LedgerDocumentKind, ParsedLedgerDocument } from "../src/types.js";

describe("matchFilePath", () => {
  it("ranks exact, pattern, and suffix matches", () => {
    expect(matchFilePath("src/cli.ts", "src/cli.ts")).toBe("exact");
    expect(matchFilePath("src/features/auth/login.ts", "src/features/**")).toBe("pattern");
    expect(matchFilePath("src/cli.ts", "prefix:src/")).toBe("pattern");
    expect(matchFilePath("cli.ts", "src/cli.ts")).toBe("suffix");
    expect(matchFilePath("src/cli.ts", "cli.ts")).toBe("suffix");
    expect(matchFilePath("src/cli.ts", "src/other.ts")).toBeUndefined();
    expect(matchFilePath("src/cli.ts", "src/cli.tsx")).toBeUndefined();
  });
});

describe("retrieveByPath", () => {
  it("returns the shared retrieval contract with one hop of relationships", () => {
    const result = retrieveByPath(catalog(), "src/features/auth/login.ts");

    expect(result).toEqual({
      target: "src/features/auth/login.ts",
      records: [
        {
          id: "0001",
          kind: "change",
          title: "Original auth",
          status: "superseded",
          date: "2026-06-01",
          updated: undefined,
          release: "v0.1.0",
          path: ".ledger/entries/0001.md",
          areas: ["auth"],
          tags: [],
          files: ["src/features/auth/login.ts"],
          symbols: ["login"],
          docs: ["docs/auth.md"],
          decisions: ["D001"],
          backlog: [],
          related: [],
          supersedes: [],
          supersededBy: ["0002"],
          matchedFiles: ["src/features/auth/login.ts"],
          matches: [{ file: "src/features/auth/login.ts", kind: "exact" }],
          conflictRules: ["Keep the login contract."],
          invariants: ["Login stays idempotent."],
          verification: ["npm test"],
        },
        {
          id: "0002",
          kind: "change",
          title: "Grouped auth rewrite",
          status: "landed",
          date: "2026-07-01",
          updated: "2026-07-02",
          release: undefined,
          path: ".ledger/entries/0002.md",
          areas: ["auth"],
          tags: ["rewrite"],
          files: ["src/features/**"],
          symbols: [],
          docs: [],
          decisions: ["D001", "D404"],
          backlog: ["B001"],
          related: ["0001"],
          supersedes: ["0001"],
          supersededBy: [],
          matchedFiles: ["src/features/**"],
          matches: [{ file: "src/features/**", kind: "pattern" }],
          conflictRules: ["Preserve the grouped rewrite."],
          invariants: [],
          verification: ["npm run check"],
        },
      ],
      related: [
        {
          id: "B001",
          kind: "backlog",
          title: "Auth backlog",
          status: "shipped",
          path: ".ledger/backlog/B001.md",
          via: ["backlog"],
          from: ["0002"],
        },
        {
          id: "D001",
          kind: "decision",
          title: "Auth decision",
          status: "accepted",
          path: ".ledger/decisions/D001.md",
          via: ["decision"],
          from: ["0001", "0002"],
        },
      ],
      missing: [{ id: "D404", via: "decision", from: "0002" }],
    });
  });

  it("does not list matched records as related to themselves", () => {
    const result = retrieveByPath(catalog(), "src/features/auth/login.ts");
    expect(result.related.map((record) => record.id)).not.toContain("0001");
    expect(result.related.map((record) => record.id)).not.toContain("0002");
  });

  it("returns an empty contract for unknown paths", () => {
    expect(retrieveByPath(catalog(), "src/nothing.ts")).toEqual({
      target: "src/nothing.ts",
      records: [],
      related: [],
      missing: [],
    });
  });

  it("indexes reverse supersession", () => {
    const index = supersededByIndex([
      { id: "a", supersedes: ["z"] },
      { id: "b", supersedes: ["z", "y"] },
    ]);
    expect(index.get("z")).toEqual(["a", "b"]);
    expect(index.get("y")).toEqual(["b"]);
    expect(index.get("a")).toBeUndefined();
  });
});

describe("retrieval consumers agree", () => {
  it("explain, conflict, and packet share matches and guidance", () => {
    const documents = catalog();
    const target = "src/features/auth/login.ts";
    const retrieval = retrieveByPath(documents, target);
    const ids = retrieval.records.map((record) => record.id);

    expect(explainFile(documents, target).map((document) => document.id)).toEqual(ids);

    const [conflict] = buildConflictTargets(documents, [target]);
    expect(conflict?.entries.map((entry) => entry.id)).toEqual(ids);
    expect(conflict?.entries.map((entry) => entry.conflictRules)).toEqual(
      retrieval.records.map((record) => record.conflictRules),
    );

    const packet = buildAgentPacket(documents, target);
    expect(packet.entries.map((entry) => entry.id)).toEqual(ids);
    expect(packet.related.map((record) => record.id)).toEqual(["B001", "D001"]);
    expect(packet.estimatedTokens).toBeGreaterThan(
      buildAgentPacket(documents, "src/features/other.ts").estimatedTokens,
    );
  });

  it("keeps related records inside the packet budget and scoped to selected entries", () => {
    const documents = catalog();
    const packet = buildAgentPacket(documents, "src/features/auth/login.ts", {
      budgetTokens: 120,
      maxEntries: 1,
    });
    expect(packet.entries.map((entry) => entry.id)).toEqual(["0001"]);
    expect(packet.related.map((record) => record.id)).toEqual(["D001"]);
    expect(packet.estimatedTokens).toBeLessThanOrEqual(120);
  });
});

function catalog(): readonly ParsedLedgerDocument[] {
  return [
    record("0001", "change", ".ledger/entries/0001.md", `
title: "Original auth"
date: "2026-06-01"
status: "superseded"
release: "v0.1.0"
areas: ["auth"]
files: ["src/features/auth/login.ts"]
symbols: ["login"]
docs: ["docs/auth.md"]
decisions: ["D001"]
`, `
## Changed Files

### src/features/auth/login.ts

- What changed: Added login.
- On conflict: Keep the login contract.

## Invariants

- Login stays idempotent.

## Verification

- npm test
`),
    record("0002", "change", ".ledger/entries/0002.md", `
title: "Grouped auth rewrite"
date: "2026-07-01"
updated: "2026-07-02"
status: "landed"
areas: ["auth"]
tags: ["rewrite"]
files: ["src/features/**"]
decisions: ["D001", "D404"]
backlog: ["B001"]
related: ["0001"]
supersedes: ["0001"]
`, `
## Changed Files

### Pattern: src/features/**

- What changed: Rewrote auth.
- On conflict: Preserve the grouped rewrite.

## Verification

- npm run check
`),
    record("D001", "decision", ".ledger/decisions/D001.md", `
title: "Auth decision"
date: "2026-05-01"
status: "accepted"
`, ""),
    record("B001", "backlog", ".ledger/backlog/B001.md", `
title: "Auth backlog"
date: "2026-05-01"
status: "shipped"
`, ""),
  ];
}

function record(
  id: string,
  kind: LedgerDocumentKind,
  relativePath: string,
  frontmatter: string,
  body: string,
): ParsedLedgerDocument {
  const raw = `---\nid: "${id}"\nkind: "${kind}"${frontmatter}---\n\n# ${id}\n${body}`;
  const parsed = parseMarkdownWithFrontmatter(raw, relativePath);
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
