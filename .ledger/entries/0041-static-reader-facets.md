---
id: "0041"
kind: "change"
title: "Polish static reader facets"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["render", "html", "ux", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/render.ts"
  - "test/render.test.ts"
  - ".ledger/entries/0041-static-reader-facets.md"
symbols:
  - "LedgerStaticReaderModel"
  - "LedgerFacet"
  - "facetButtons"
  - "relationships"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
---

# 0041: Polish Static Reader Facets

## Summary

Adds faceted reader metadata and improves the generated static reader with quick
browse controls for kinds, releases, and areas plus relationship sections on
record cards.

## Why

The static reader should be more useful as a standalone local artifact. Facets
and relationship context make it easier to scan releases, areas, decisions, and
backlog links without requiring a hosted search service.

## Changed Files

### src/render.ts

- What changed: Adds reader facets, browse buttons, relationship display, and
  expanded search text.
- Anchor: `LedgerStaticReaderModel`
- On conflict: Keep the reader single-file and generated from normalized Ledger
  records.

### test/render.test.ts

- What changed: Adds coverage for facets, browse controls, and relationship
  rendering.
- Anchor: `buildStaticReaderModel`
- On conflict: Preserve assertions that the generated HTML remains self
  contained.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents the richer static reader behavior and roadmap status.
- Anchor: `Static Reader`
- On conflict: Keep docs clear that the reader is local, static, and independent
  from hosted renderers.

## Behavior And UX Impact

The generated reader is easier to browse by kind, release, and area, and record
cards show decisions, backlog, related, and superseded links when present.

## Invariants

- `.ledger/dist/index.html` remains generated output.
- The reader remains a single offline HTML file.
- Source Markdown remains embedded and inspectable.
- No hosted service is required.

## Verification

- `npm run typecheck`
- `npx vitest run test/render.test.ts`
- `npm run build`
- `node dist/cli.js render`

## Notes

Future reader work can add richer release timelines, printable views, or
multi-page output.
