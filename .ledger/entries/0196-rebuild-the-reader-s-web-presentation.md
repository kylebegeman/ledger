---
id: "0196"
kind: "change"
title: "Rebuild the reader's web presentation"
date: "2026-09-28"
updated: "2026-09-28"
status: "draft"
staleRefs:
  - "files:scripts/check-dossier-tokens.mjs"
  - "symbols:syncRailDrawer"
areas:
  - "reader"
  - "design"
files:
  - ".ledger/sessions/S0008-claude-code-session-2026-09-28.md"
  - ".ledger/sessions/S0005-claude-code-session-2026-09-17.md"
  - ".ledger/entries/0185-script-the-readme-screenshots-and-the-dossier-token-check.md"
  - ".ledger/decisions/D009-the-reader-owns-its-visual-system.md"
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
  - "scripts/check-dossier-tokens.mjs"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/readerViewParams.ts"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
  - "test/readerViews.test.ts"
  - "test/render.test.ts"
symbols:
  - "syncRailDrawer"
  - "addRecordMap"
  - "closePalette"
  - "minAxisLabelSpacing"
  - "recordsViewParams"
docs:
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes the rebuilt reader and CONTRIBUTING records the screenshot set and the design rules."
  docs:
    - "docs/ARCHITECTURE.md"
    - "CONTRIBUTING.md"
commits: []
decisions:
  - "D009"
related:
  - "0168"
---

# 0196: Rebuild the reader's web presentation

## Summary

Rebuilds the reader's web presentation from the ground up. The reader now
owns its visual system (D009): its own color, type, and spacing tokens with
`light-dark()` themes, a validated categorical palette for record kinds, and
no dependency on the retired Dossier tokens. The internal reader gains three
views. Overview opens with a stat tile per kind, an activity chart of records
per week or month, the newest releases, records per area, the open backlog,
doctor health signals, and graph metrics, and every tile and bar filters the
list. Records keeps search, filters, a rail drawer of quick views and facets,
sort orders, density, page size, and a chip for every active filter. Timeline
groups the same records under month headings with the date first. The record
panel adds previous and next stepping, a context grid, and a relationship map
of the records a record links and the records that link back. The public
profile renders a version index that follows the reader, year headings, and
permalinks. Keyboard coverage is complete: `/`, `⌘K`, `j`/`k`, `o`, `]`/`[`,
`g o`/`g r`/`g t`, `?`, and Escape, which now closes the palette explicitly
because Chrome clears a search input on Escape before the page sees the key.

## Why

The reader is the face of every record Ledger keeps, and the old presentation
was a functional list with borrowed tokens. A project's history deserves an
overview a maintainer can read in a glance, a timeline that reads in order,
and a record view that shows what a change touches and what it relates to.
Kyle asked for a full design sweep with no limits, and separately for two
standing rules that the redesign now follows: no italic titles or headings,
and never a colored accent line or edge bar to mark active, selected, or
focused state. Active states use a background tint, text weight, or a full
focus ring instead.

## Changed Files

### Stylesheet

- Files: `src/reader/styles.css`
- Changed: rewritten around the reader's own tokens; layouts for the
  overview, records, timeline, panel, rail drawer, chips, chart, version
  index, palette, and shortcuts sheet; light and dark themes through
  `light-dark()`; responsive rules down to phone widths. Every page embeds
  it, so it stays under the 64 KB budget the runtime test pins.
- Anchor: `--bg`, `.version-link[aria-current="true"]`
- On conflict: Keep the token layer as the only place colors are defined,
  keep headings upright, and never reintroduce inset edge strokes or
  `border-left` accents for state.

### Runtime

- Files: `src/reader/runtime.ts`
- Changed: view switching with URL inference, the activity chart with
  width-aware axis labels, the rail drawer that closes itself on narrow
  screens, filter chips, panel stepping, the relationship map, palette
  Escape handling, and the public version index tracking.
- Anchor: `syncRailDrawer`, `addRecordMap`, `closePalette`, `minAxisLabelSpacing`
- On conflict: The head script and the runtime must infer the same view from
  the same URL parameters; change `recordsViewParams` rather than either copy.

### Markup and shared view parameters

- Files: `src/renderHtml.ts`, `src/readerViewParams.ts`
- Changed: the three-view shell with view tabs, the overview sections, the
  search dock, the rail drawer, active-filter chips, the record panel with
  prev/next and the map section, the command shell, the public version index
  and feed links. `readerViewParams.ts` holds the parameter list that means
  "records view" for both the head script and the runtime.
- Anchor: `recordsViewParams`, `id="record-panel"`
- On conflict: Keep `src/renderHtml.ts` free of filesystem and workspace
  writes; the reader stays a single offline HTML file with a strict CSP and
  no web fonts.

### Tests

- Files: `test/readerViews.test.ts`, `test/readerRuntime.test.ts`, `test/render.test.ts`
- Changed: a new suite for view switching, sorting, chart selection, panel
  stepping, the relationship map, keyboard focus, and the public version
  index; the runtime and render suites updated for the new markup and the
  raised stylesheet budget.
- Anchor: `readerViews`, `64 * 1024`
- On conflict: Raise the stylesheet budget on purpose, in the test, with a
  reason; do not let it drift.

### Decision and docs

- Files: `.ledger/decisions/D009-the-reader-owns-its-visual-system.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `scripts/check-dossier-tokens.mjs`
- Changed: D009 records that the reader owns its visual system and the two
  standing design rules; the architecture doc describes the views, URL
  inference, drawer, chips, panel, keyboard, and version index; contributing
  describes the screenshot set and the design rules; the Dossier token check
  is deleted with the tokens it checked.
- Anchor: `The reader owns its visual system`
- On conflict: Retire guidance that stops being true rather than layering
  exceptions onto it.

## Behavior And UX Impact

`ledger render` produces a reader with an overview, a records view, and a
timeline, selected by view tabs, `g` shortcuts, or `?view=`. Links that carry
a filter parameter open the records view directly. A record opens beside the
list and steps to its neighbors without closing. The public changelog gains a
version index, year headings, and permalinks. Both themes follow the system
and a toggle overrides it. Nothing in the record format, the CLI, the JSON
API, or the MCP tools changes.

## Invariants

- The reader remains a single offline HTML file with a strict CSP and no
  fonts or scripts loaded from anywhere else.
- Headings and titles are set upright; no italic display type.
- Active, selected, and focused states never use colored accent lines, inset
  edge strokes, or `border-left` accents.
- The head script and the runtime infer the view from the same parameter
  list in `src/readerViewParams.ts`.
- The public profile stays fail-closed: released versions and their Public
  Notes only, no paths, files, symbols, invariants, or internal links.
- The internal index stays under its render budgets, and the embedded
  stylesheet stays under 64 KB.

## Verification

- Resumed verification on 2026-09-28: `npm run ci` exited 0 with 501 tests
  across 62 files. `node dist/cli.js ready 0196` passed after recording the
  deliberate removal of the old token checker. The internal render fits the
  4.5 MB budget. Desktop browser checks covered overview, records, and loading
  this receipt's detail panel. The shared preview disconnected during mobile
  checks, so those could not be completed in the resumed session.
- `npm run typecheck`
- `npm test`
- `npm run ci`
- `node dist/cli.js render && node dist/cli.js render --profile public`
- Playwright screenshots of the overview, records, panel, timeline, palette,
  and changelog at desktop and phone widths in both themes, and interaction
  checks for view switching, sorting, chart selection, panel stepping, the
  map, the palette, and Escape.

## Notes

The design rules came from Kyle during the sweep: "remove all part italics
titles and headers" and, of the version index's green left bar, "Remove these
accent lines and NEVER use them ever." They are recorded in D009 and in
CONTRIBUTING so the next redesign keeps them.

The retired `scripts/check-dossier-tokens.mjs` path remains in historical file lists; `staleRefs`
acknowledges its deliberate removal without erasing those lists.

Receipt 0201 replaces `syncRailDrawer` with responsive filter placement;
its stale-symbol reference is acknowledged while this history remains intact.
