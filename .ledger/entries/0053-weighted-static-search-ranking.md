---
id: "0053"
kind: "change"
title: "Weighted static search ranking"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "search"
  - "agents"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "test/render.test.ts"
symbols:
  - "buildSearchIndex"
  - "searchFields"
  - "scoreSearchDocument"
  - "searchWeights"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
backlog:
  - "B006"
commits: []
---

# 0053: Weighted Static Search Ranking

## Summary

Changed the static reader search index from one flat term string into weighted
search fields and updated the browser runtime to rank and reorder visible cards
by score.

## Why

Fuzzy search is more useful when exact ID, title, path, symbol, and file matches
rank above incidental summary or context matches. This improves the hosted
static reader without adding a hosted search service or changing Markdown source
records.

## Changed Files

### src/render.ts

- What changed: Added weighted `fields` to `search-index.json`, field-specific
  browser weights, scored result maps, and search-result reordering.
- Anchor: `buildSearchIndex`, `searchFields`, `scoreSearchDocument`
- On conflict: Keep weighted fields compact and derived from normalized records.

### test/render.test.ts

- What changed: Covered weighted search fields and runtime markers.
- Anchor: `buildStaticReaderModel`, `renderStaticReaderHtml`
- On conflict: Preserve tests that confirm search remains a generated static
  sidecar.

### README.md and docs/ARCHITECTURE.md

- What changed: Documented weighted static search behavior and file-open
  fallback search.
- Anchor: `ledger render`
- On conflict: Keep docs clear that static search remains dependency-free.

## Behavior And UX Impact

Search results in the static reader now prioritize records whose IDs, titles,
paths, symbols, or files match the query. When the lazy search sidecar loads,
visible cards are reordered by score. Direct file-open fallback search still
works from inline compact search text.

## Invariants

- Search data remains generated from Ledger Markdown.
- The reader remains hostable as static files.
- Search must still work without a hosted service.
- Inline fallback search should remain available when sidecar fetches are
  blocked.

## Verification

- `npm run typecheck`
- `npx vitest run test/render.test.ts`

## Notes

This improves static search ranking. More advanced weighting controls can be
added later if projects need configurable search weights.
