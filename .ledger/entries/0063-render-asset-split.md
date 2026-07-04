---
id: "0063"
kind: "change"
title: "Render asset split"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "architecture"
files:
  - ".ledger/entries/0063-render-asset-split.md"
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "src/renderAssets.ts"
symbols:
  - "staticReaderStyles"
  - "staticReaderRuntime"
  - "renderStaticReaderHtml"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Documented renderer boundaries after extracting embedded styles and browser runtime."
  docs:
    - "docs/ARCHITECTURE.md"
backlog:
  - "B005"
  - "B006"
commits: []
release: "v0.1.13"
---

# 0063: Render Asset Split

## Summary

Moved the static reader's embedded CSS and browser runtime out of `src/render.ts`
and into `src/renderAssets.ts`.

## Why

B005 calls for splitting renderer model, HTML shell, styles, and browser runtime.
The renderer had grown past 1,000 lines, mixing data-model construction, HTML
composition, CSS, and browser behavior in one file. This first split removes the
largest embedded assets without changing generated behavior.

## Changed Files

### src/renderAssets.ts

- What changed: Added `staticReaderStyles` and `staticReaderRuntime` constants
  for the generated reader's CSS and browser JavaScript.
- Anchor: `staticReaderStyles`, `staticReaderRuntime`
- On conflict: Keep these assets deterministic and free of source catalog
  dependencies.

### src/render.ts

- What changed: Replaced inline style and script blocks with imported assets,
  leaving static reader model and HTML composition in place.
- Anchor: `renderStaticReaderHtml`
- On conflict: Generated HTML should preserve the same visible behavior and
  sidecar loading contract.

### docs/ARCHITECTURE.md

- What changed: Documented the renderer boundary between HTML/model composition
  and embedded assets.
- Anchor: `Renderer internals`
- On conflict: Keep this as an internal architecture note, not a public theming
  API promise.

## Behavior And UX Impact

Users should see no reader behavior changes. Maintainers get a thinner render
module and a clearer place to evolve static reader styles and browser behavior.

## Invariants

- Static reader HTML still embeds CSS and browser runtime for offline hosting.
- `search-index.json` and `graph.json` loading behavior remains unchanged.
- Render artifact contract tests continue to pass.

## Verification

- `npm test -- --run test/render.test.ts test/generatedArtifacts.test.ts`
- `npm run typecheck`

## Notes

This does not yet split every HTML component into separate modules. It removes
the largest asset blocks first so future renderer work can proceed with less
file churn.
