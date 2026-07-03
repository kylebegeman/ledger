---
id: "0067"
kind: "change"
title: "Render HTML component split"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "architecture"
  - "docs"
files:
  - ".ledger/entries/0067-render-html-component-split.md"
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "src/renderHtml.ts"
symbols:
  - "renderStaticReaderHtml"
  - "RenderStaticReaderHtmlOptions"
  - "buildStaticReaderModel"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Updated the renderer architecture note to describe the model, HTML, and asset split."
  docs:
    - "docs/ARCHITECTURE.md"
backlog:
  - "B005"
commits: []
---

# 0067: Render HTML Component Split

## Summary

Moved static reader HTML composition into `src/renderHtml.ts` while preserving
the existing public exports from `src/render.ts`.

## Why

`src/render.ts` had accumulated model construction, search sidecar generation,
graph sidecar generation, artifact budgets, file writes, and HTML markup. The
new split keeps generated output stable while making the renderer easier to
transport, test, and evolve.

## Changed Files

### src/renderHtml.ts

- What changed: Added the static reader HTML renderer and private component
  helpers for entries, facets, relationship lists, context blocks, and agent
  packet digests.
- Anchor: `renderStaticReaderHtml`
- On conflict: Keep browser markup concerns in this module and avoid pulling
  workspace IO into it.

### src/render.ts

- What changed: Removed private markup helpers and re-exported
  `renderStaticReaderHtml` from the new HTML module for compatibility.
- Anchor: `buildStaticReaderModel`
- On conflict: Preserve existing `src/render.ts` imports for callers.

### docs/ARCHITECTURE.md

- What changed: Documented the renderer split across model, HTML, and assets.
- Anchor: static HTML renderer
- On conflict: Keep architecture docs aligned with source module ownership.

## Behavior And UX Impact

Generated reader output remains unchanged. Internally, the renderer has a
cleaner boundary for future hosted or multi-page static readers.

## Invariants

- `renderStaticReaderHtml` remains available from `src/render.ts`.
- `src/renderHtml.ts` stays free of filesystem and workspace write behavior.
- Search and graph sidecar generation stay owned by the render model layer.

## Verification

- `npm test -- --run test/render.test.ts test/generatedArtifacts.test.ts`
- `npm run typecheck`

## Notes

This is an architectural extraction with no intended output changes.
