---
id: "0025"
kind: "change"
title: "Add decision and backlog indexes"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["index", "query", "agents", "docs", "tests"]
files:
  - "docs/ARCHITECTURE.md"
  - "src/indexer.ts"
  - "src/types.ts"
  - "test/validate.test.ts"
  - ".ledger/entries/0025-relationship-indexes.md"
symbols:
  - "buildIndexes"
  - "writeIndexes"
  - "LedgerIndexes"
docs:
  - "docs/ARCHITECTURE.md"
commits: []
---

# 0025: Add Decision And Backlog Indexes

## Summary

Adds generated `by-decision.json` and `by-backlog.json` indexes. These group
normalized Ledger documents by relationship ids declared in `decisions:` and
`backlog:` frontmatter.

## Why

The architecture already called out relationship indexes as a planned query
surface. Adding them now makes release, agent packet, and reader workflows more
useful without changing source document structure.

## Changed Files

### src/types.ts

- What changed: Extends `LedgerIndexes` with `byDecision` and `byBacklog`.
- Anchor: `LedgerIndexes`
- On conflict: Keep the public type aligned with files emitted by
  `writeIndexes`.

### src/indexer.ts

- What changed: Builds and writes `.ledger/indexes/by-decision.json` and
  `.ledger/indexes/by-backlog.json`.
- Anchor: `buildIndexes`
- On conflict: Keep generated indexes additive and derived from normalized
  frontmatter.

### test/validate.test.ts

- What changed: Adds fixture relationship frontmatter and assertions for the
  new indexes.
- Anchor: `buildIndexes`
- On conflict: Preserve test coverage for both relationship index groups.

### docs/ARCHITECTURE.md

- What changed: Moves decision and backlog indexes into the active index list.
- Anchor: `Index Builder`
- On conflict: Keep architecture docs aligned with generated output.

## Behavior And UX Impact

Projects get two additional generated lookup files for relationship-aware
tooling and agent context retrieval.

## Invariants

- Markdown frontmatter remains the source of truth.
- Relationship indexes are generated outputs.
- Missing relationship fields produce empty index groups, not validation errors.

## Verification

- `npm run typecheck`
- `npx vitest run test/validate.test.ts`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`

## Notes

Future query work can read these indexes directly instead of reparsing source
documents.
