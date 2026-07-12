---
id: "0084"
kind: "change"
title: "Add filter pills, right rail, pagination, and density modes"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "design"
  - "ux"
files:
  - "README.md"
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
  reason: "The README and architecture guide now describe the search-first layout, filter pills, right rail, pagination, and density modes."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0083"
release: "v0.2.0"
---

# 0084: Add Filter Pills, Right Rail, Pagination, And Density Modes

## Summary

Restructured the reader around a search-first layout. The search field now
spans the full content width above dropdown filter pills, the browse rail
moved to the right side of the results, and generous spacing separates the
search region from the library. Results paginate with a configurable page
size and windowed page controls, and a density toggle switches between the
expanded record composition and a compact scanning list of title, metadata
chips, and a one-line summary.

The filter pills are native select elements styled as outlined chips, so the
existing filter engine, URL state, facet buttons, and hero metric filters
work unchanged. Moving filters inline removed the entire mobile filter
drawer: the sheet, scrim, focus containment, and toggle button are gone, and
the rail simply stacks below the results on small screens.

## Why

Filters ergonomically belong next to the search input that they refine, not
in a separate left panel. Direct project feedback asked for dropdown pills
below the search bar, the rail on the right, a full-width search field, and
clear breathing room before the results, plus pagination and a compact mode
for faster scanning of large ledgers.

Pagination also bounds initial rendering work on large ledgers: instead of
showing every record at once, the default view renders one page of
twenty-five and lets readers choose ten through one hundred or all.

## Changed Files

### Layout, controls, and runtime

- Files: `src/renderHtml.ts`, `src/renderAssets.ts`
- Changed: Added the search region with a filter pill bar and quality-signal
  disclosure; replaced the left sidebar with a right rail holding facet quick
  views and the graph summary; added toolbar view controls (density toggle,
  results-per-page select), a windowed pagination nav, compact density
  styles, pill active states, page and per-page URL parameters, page-aware
  palette navigation, and page resets on filter changes. Removed the mobile
  filter sheet, scrim, inert containment, and active-filter chip row.
- Anchor: `renderStaticReaderHtml`, `staticReaderStyles`,
  `staticReaderRuntime`.
- On conflict: Keep filters as native selects styled as pills so the shared
  filter runtime and URL contract stay unchanged. Keep pagination state in
  the URL. Keep the compact density as a pure CSS mode over the same markup.

### Contracts and documentation

- Files: `test/render.test.ts`, `README.md`, `docs/ARCHITECTURE.md`
- Changed: Contract tests assert the search region, filter bar, rail,
  per-page control, pagination nav, density toggle, and runtime literals, and
  assert the drawer and chip row are gone. Docs describe the new layout.
- On conflict: Tests protect behavior and safety boundaries, not incidental
  markup.

## Behavior And UX Impact

- Search spans the full content width with filter pills directly below and
  clear space before the results.
- Active pills highlight with the accent tone and stay synchronized with
  facet chips, hero metrics, and the URL.
- Results show twenty-five records per page by default; readers can pick ten
  through one hundred or all, and move through windowed page controls that
  scroll back to the top of the results.
- Compact density lists title, metadata chips, and a one-line summary for
  fast scanning; expanded density keeps the full record composition. The
  choice persists locally, and opening a record from the palette switches to
  expanded on the correct page.
- Screen readers hear result totals, page position, and active filter counts
  from one polite status region.

## Invariants

- The generated reader remains static, dependency-free, and usable without an
  application server.
- Filter controls are native selects; filtering, pagination, and search state
  remain shareable through the URL.
- Pagination, density, filters, and search remain keyboard operable with
  visible focus.
- The flat editorial hierarchy, hairline dividers, and sparse outlined
  surfaces from 0083 continue to define the layout.
- Internal and public render profiles remain isolated; the public profile has
  pagination but no filter pills or density toggle.
- All artifacts stay within configured render budgets.

## Verification

- `npm run check`
- `npm run ci`
- Internal and public real-data renders within budget
- Browser pass: pill filtering with URL sync, page navigation and per-page
  changes, compact and expanded densities, palette navigation to a record on
  a later page with automatic density switch, right rail stickiness on
  desktop and stacking on mobile, wrapped pills on narrow screens

## Notes

The results-per-page control defaults to twenty-five and omits default
values from the URL so shared links stay short. The pagination window shows
first, last, and neighbors of the current page with ellipses beyond seven
pages.
