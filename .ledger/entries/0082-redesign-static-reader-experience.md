---
id: "0082"
kind: "change"
title: "Redesign static reader experience"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "design"
  - "ux"
files:
  - "assets/ledger.svg"
  - "docs/ARCHITECTURE.md"
  - "README.md"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "test/render.test.ts"
symbols:
  - "renderStaticReaderHtml"
  - "staticReaderStyles"
  - "staticReaderRuntime"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The README and architecture guide now document the reader's new visual system, interaction model, and payload behavior."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
commits: []
release: "v0.2.0"
---

# 0082: Redesign Static Reader Experience

## Summary

Rebuilt the generated Ledger website from first principles. The old bordered
dashboard and dense always-expanded cards were replaced with a borderless,
responsive reader built around strong typography, filled surfaces, restrained
depth, compact record summaries, and a dedicated public release feed.

The new visual system includes a simplified logo, light and dark themes,
responsive filter composition, a focused search palette, and motion that honors
reduced-motion preferences. Raw Markdown is no longer embedded into the initial
HTML, reducing the real 103-record page from 1.09 MB to approximately 727 KB.

## Why

The previous reader exposed useful data but presented it as a collection of
generic bordered panels, pills, edge strokes, and code-heavy cards. The result
looked dated, made hierarchy difficult to scan, and treated every piece of
metadata as equally important. A visual overhaul required replacing the layout
and component language rather than recoloring the existing interface.

The static architecture remains intentional. HTMX was evaluated but not added
because this artifact has no HTML-fragment server and must remain portable as a
generated bundle. Native browser capabilities provide the appropriate motion,
dialog, keyboard, and URL-state behavior without adding a runtime dependency.

## Changed Files

### Reader composition and visual system

- Files: `src/renderHtml.ts`, `src/renderAssets.ts`
- Changed: Replaced the page shell, record composition, public release feed,
  filters, empty state, search palette, theme system, responsive layout, and
  motion behavior.
- Anchor: `renderStaticReaderHtml`, `staticReaderStyles`,
  `staticReaderRuntime`.
- On conflict: Preserve the borderless filled-surface language, visual hierarchy,
  keyboard access, URL-backed filters, reduced-motion behavior, and offline
  operation. Do not restore raw Markdown to the initial HTML payload.

### Brand mark

- File: `assets/ledger.svg`
- Changed: Replaced the detailed notebook illustration with a compact filled
  monogram that remains legible in the navigation shell and README.
- On conflict: Keep the production mark simple, filled, scalable, and free of
  decorative outline strokes.

### Contracts and documentation

- Files: `test/render.test.ts`, `README.md`, `docs/ARCHITECTURE.md`
- Changed: Updated renderer contracts for the new semantic structure, public
  isolation, borderless CSS, keyboard search, URL state, View Transitions, and
  payload behavior.
- On conflict: Tests should protect user-visible behavior and safety boundaries,
  not freeze incidental copy or the old component structure.

## Behavior And UX Impact

- The page opens with an editorial project overview instead of a report header.
- Records are compact and scannable until their supporting context is requested.
- Search is available inline and in a focused keyboard palette using `/` or
  `Cmd/Ctrl+K`.
- Filters are shareable through the URL and become a mobile bottom sheet on
  narrow screens.
- Light and dark themes use the same hierarchy and remember the selected mode.
- Public releases use a changelog-specific composition rather than internal
  record cards.
- Initial HTML no longer duplicates every raw source document.

## Invariants

- The generated reader remains static, dependency-free, and usable without an
  application server.
- No decorative leading strokes or one-pixel card outlines define the layout.
- Internal and public render profiles remain isolated.
- Search and filter controls remain keyboard operable with visible focus.
- Motion is progressive and disabled when reduced motion is requested.
- The internal HTML, public HTML, search index, graph, and total output remain
  within configured render budgets.

## Verification

- `npm run check`
- `npm run ci`
- Internal and public real-data renders
- Inline runtime syntax parsing
- Public artifact leak scan
- Reader served at `http://127.0.0.1:4173/`

## Notes

The design research used current documentation and search products only as a
visual quality benchmark. The resulting interface is Ledger-specific and does
not copy another product's information architecture.
