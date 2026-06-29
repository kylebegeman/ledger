---
id: "0021"
kind: "change"
title: "Expand query filters"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "query", "agents", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/query.ts"
  - "test/query.test.ts"
  - ".ledger/entries/0021-expanded-query-filters.md"
symbols:
  - "queryDocuments"
  - "LedgerQueryFilters"
  - "queryCommand"
docs:
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0021: Expand Query Filters

## Summary

Adds richer `ledger query` filtering for releases, decision ids, backlog ids,
symbols, files, docs paths, and exact record ids. CLI output now surfaces
matched release, area, file, symbol, and docs context.

## Why

The roadmap calls for query by file, release, decision, backlog item, and
symbol. These filters give humans and agents targeted retrieval without reading
or rendering the full Ledger catalog.

## Changed Files

### src/query.ts

- What changed: Extends `LedgerQueryFilters` and `queryDocuments` with release,
  decision, backlog, symbol, file, docs path, and id filters.
- Anchor: `queryDocuments`
- On conflict: Preserve exact matching for ids and metadata while allowing path
  suffix matching for file and docs filters.

### src/cli.ts

- What changed: Wires the new query flags through `ledger query`, expands human
  output, and updates help text.
- Anchor: `queryCommand`
- On conflict: Keep `--json` returning the normalized matches model.

### README.md

- What changed: Updates the command map to describe the richer query surface.
- Anchor: `Command Map`
- On conflict: Keep README examples aligned with actual CLI flags.

### test/query.test.ts

- What changed: Adds coverage for release, decision, backlog, symbol, file,
  docs, and id filters.
- Anchor: `queryDocuments`
- On conflict: Keep the tests focused on filtering behavior, not output
  formatting.

## Behavior And UX Impact

Users and agents can retrieve records by the relationships that matter during
maintenance, including "what touched this file", "what shipped in this
release", and "what mentions this symbol".

## Invariants

- Unknown query filters must not affect existing kind/status/area behavior.
- File and docs path filters should match exact paths and useful suffixes.
- JSON output should remain stable and include normalized documents.

## Verification

- `npm run typecheck`
- `npx vitest run test/query.test.ts test/cliHelp.test.ts`

## Notes

Future query work can add index-backed loading and text search without changing
this filter contract.
