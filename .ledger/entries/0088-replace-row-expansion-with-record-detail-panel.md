---
id: "0088"
kind: "change"
title: "Replace row expansion with record detail panel"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "design"
  - "ux"
files:
  - "docs/ARCHITECTURE.md"
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
  reason: "The architecture guide now describes thin list rows, the slide-out record panel, its URL addressing, and the reinterpreted density modes."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0084"
---

# 0088: Replace Row Expansion With Record Detail Panel

## Summary

Removed the inline details expansion and rebuilt records as thin list rows
that open a slide-out detail panel. Each row is a single line of kind, id,
title, status, and date, with a clamped summary and tag chips in comfortable
density. The full record content ships in an inert template per row and is
cloned into a fixed right-edge panel on selection. The list stays visible
and interactive behind the panel, so selecting another row swaps the panel
in place.

The open record is addressable with a record URL parameter: opening pushes
history so the browser back button closes the panel, deep links restore it,
Escape and the close button dismiss it with focus returned to the
originating row, and the panel renders full-screen on small viewports. The
command palette now opens the panel directly without clearing filters, and
the density toggle became Compact and Comfortable, both thin.

## Why

Project direction: the bulky rows and the expansion mechanic were not
working, and compact density had no way to reach record details at all. A
persistent list beside a detail panel keeps scanning context while reading
one record, which inline expansion cannot do. Supporting both a panel and a
separate detail page was considered and rejected: history integration gives
back-button semantics for free and mobile gets the full-screen detail view
automatically, so one mechanic covers both requests without a preference
setting.

## Changed Files

### Row and panel composition

- File: `src/renderHtml.ts`
- Changed: Rows render a single flex line with a stretched title link and a
  per-record detail template containing the full record markup; added the
  record panel shell with header and close control; relabeled the density
  toggle to Comfortable; restored the close icon to the sprite.
- Anchor: `renderStaticReaderHtml`.
- On conflict: Keep detail markup in inert templates so rows stay light, and
  keep the panel internal-profile only.

### Styles and runtime

- File: `src/renderAssets.ts`
- Changed: Thin row styles with slimmer chips and clamped summaries, panel
  slide-in styling with reduced-motion support, open-row highlight, panel
  open and close runtime with record URL parameter, history push on open,
  Escape handling ordered after the palette, focus restoration, and row
  click delegation. Removed expansion styles and the old palette flow that
  cleared filters to reveal a row.
- Anchor: `staticReaderStyles`, `staticReaderRuntime`.
- On conflict: Keep the panel non-modal so the list remains interactive, and
  keep record state flowing through the shared URL writer.

## Behavior And UX Impact

- Records scan as dense single-line rows; comfortable density adds a one
  line summary and tag chips.
- Clicking anywhere on a row opens the detail panel; clicking another row
  swaps it while the list stays in view.
- The browser back button closes the panel; shared links with a record
  parameter open it directly.
- The palette opens records instantly without resetting active filters.
- On small screens the panel is a full-screen detail view.

## Invariants

- Full record detail is available from every density and never requires a
  particular list state.
- The record panel is the only non-overlay surface allowed an opaque
  background besides the palette; the list keeps its flat language.
- Panel state is URL-addressable and closes cleanly via control, Escape, and
  history back with focus restored.
- Internal and public render profiles remain isolated; the public feed keeps
  its inline changelog composition.
- All artifacts stay within configured render budgets.

## Verification

- `npm run check`
- Browser pass: row click opens the panel, row swap while open, Escape and
  close-button dismissal with focus restore, record URL parameter on load,
  comfortable and compact densities, full-width panel on mobile viewport
