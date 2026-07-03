---
id: "0069"
kind: "change"
title: "Static reader graph and search polish"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "search"
  - "graph"
  - "docs"
files:
  - ".ledger/entries/0069-static-reader-graph-search-polish.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "test/render.test.ts"
symbols:
  - "renderStaticReaderHtml"
  - "graphSummary"
  - "staticReaderRuntime"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Documented graph summary and ranked search UI polish in the static reader."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
backlog:
  - "B006"
commits: []
---

# 0069: Static Reader Graph And Search Polish

## Summary

Surfaced graph summary data in the static reader sidebar and added ranked search
score badges for active browser searches.

## Why

The reader already generated `graph.json` and weighted search data, but users
had to inspect the sidecars directly to understand graph coverage or ranking.
The UI now exposes compact graph counts and search scores while preserving the
single-file static reader model.

## Changed Files

### src/renderHtml.ts

- What changed: Added graph summary markup with node, edge, record, node-type,
  and edge-type counts.
- Anchor: `graphSummary`
- On conflict: Keep graph UI derived from the existing render model rather than
  introducing a new generated artifact.

### src/renderAssets.ts

- What changed: Added graph summary styles and runtime logic for search score
  badges and ranked match counts.
- Anchor: `staticReaderRuntime`
- On conflict: Preserve the inline fallback search path for direct file opens.

### test/render.test.ts

- What changed: Pinned graph summary and ranked search UI output.
- Anchor: `renderStaticReaderHtml`
- On conflict: Update expectations intentionally when reader markup changes.

### README.md and docs/ARCHITECTURE.md

- What changed: Documented graph summary and ranked search UI behavior.
- Anchor: static reader
- On conflict: Keep docs aligned with generated reader capabilities.

## Behavior And UX Impact

The generated reader now shows graph coverage at a glance and displays score
badges when search results are ranked by the lazy-loaded index.

## Invariants

- The reader remains hostable as static files.
- Search still falls back to inline compact terms if sidecar fetches fail.
- `graph.json` remains the canonical relationship sidecar.

## Verification

- `npm test -- --run test/render.test.ts test/generatedArtifacts.test.ts`
- `npm run typecheck`

## Notes

This is a UI-only enhancement over existing render model data.
