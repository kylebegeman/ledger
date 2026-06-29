---
id: "0031"
kind: "change"
title: "Add query text filter"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["query", "cli", "agents", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/query.ts"
  - "test/query.test.ts"
  - ".ledger/entries/0031-query-text-filter.md"
symbols:
  - "LedgerQueryFilters"
  - "queryDocuments"
  - "documentMatchesText"
  - "queryCommand"
docs:
  - "docs/ROADMAP.md"
commits: []
---

# 0031: Add Query Text Filter

## Summary

Adds `--text` to `ledger query`. Text filtering searches normalized metadata
such as id, title, status, release, path, areas, files, symbols, docs,
relationships, and section names.

## Why

Exact filters are useful when a caller knows the field to query. A lightweight
text filter gives humans and agents a broader retrieval path without adding a
search index or changing source document structure.

## Changed Files

### src/query.ts

- What changed: Extends `LedgerQueryFilters` and `queryDocuments` with
  normalized metadata text matching.
- Anchor: `documentMatchesText`
- On conflict: Keep this as a deterministic metadata search, not full raw
  Markdown search.

### src/cli.ts

- What changed: Wires `--text <text>` through `ledger query` and help output.
- Anchor: `queryCommand`
- On conflict: Preserve existing exact filters and JSON output.

### test/query.test.ts

- What changed: Adds coverage for case-insensitive text filtering across
  metadata and docs paths.
- Anchor: `queryDocuments`
- On conflict: Keep text tests focused on normalized metadata.

### README.md

- What changed: Documents `--text` in the query command map example.
- Anchor: `Command Map`
- On conflict: Keep README command examples aligned with CLI flags.

## Behavior And UX Impact

Users can quickly find records by remembered words from titles, paths, symbols,
docs references, or relationships.

## Invariants

- Empty text filters should behave like no text filter.
- Text search must be case-insensitive.
- Existing exact filters continue to combine with text filtering.

## Verification

- `npm run typecheck`
- `npx vitest run test/query.test.ts test/cliHelp.test.ts`

## Notes

Future search work can add raw body search or a generated search index.
