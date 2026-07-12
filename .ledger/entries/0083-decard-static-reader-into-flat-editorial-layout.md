---
id: "0083"
kind: "change"
title: "De-card static reader into flat editorial layout"
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
  reason: "The README and architecture guide now describe the flat editorial shell, outlined surfaces, light-dark token system, sprite icons, and hardened runtime behavior."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
commits: []
supersedes:
  - "0082"
---

# 0083: De-card Static Reader Into Flat Editorial Layout

## Summary

Replaced the reader's filled-card visual language with a flat editorial
layout directed by project review feedback. Records now read as a
hairline-divided list with visible dates, expanded context renders as plain
content groups, and only a handful of surfaces remain: outlined containers
with a thin stroke and no fill for the search field, graph summary, and empty
state, plus opaque overlay surfaces for the palette and mobile filter sheet.

The same pass consolidated the design system and shrank the payload. All
colors are defined once with CSS light-dark() tokens, icons ship as a single
SVG symbol sprite, inline search fallback text is token-deduplicated, and the
real 104-record page dropped from about 723 KB to about 644 KB while gaining
record dates, hero metric quick filters, a tri-state theme toggle, ranked
match badges, debounced search, per-record view transition morphs, and inert
background containment for the mobile filter sheet.

## Why

Project direction on plan review: card-heavy layouts read as noisy and
dated. Cards should be rare, and when they appear they should be outlined
with a single thin stroke, no background fill, and rounded corners. The
previous filled-surface language wrapped nearly every element in a filled
panel, so the composition had to be replaced rather than recolored.

Two live rendering bugs also forced theme-system work: kind-tone dark
overrides only keyed on the explicit dark attribute, so the default system
theme showed light chip colors on dark canvases, and the hidden relevance
label painted as an empty pill because an author display rule defeated the
hidden attribute. Defining tones once with light-dark() and adding a global
hidden guard removes both bug classes structurally.

## Changed Files

### Visual system and runtime

- Files: `src/renderAssets.ts`, `src/renderHtml.ts`
- Changed: Replaced filled cards with a divided list and outlined surfaces;
  collapsed the duplicated dark token blocks into light-dark() tokens; added
  line, on-accent, info, and accent-alt tokens plus radius, spacing, and
  standard font-weight scales; moved icons into one symbol sprite; added
  record dates, error tags, metric quick filters, heading semantics, feed and
  status roles, combobox state, tri-state theme, debounced search, rank
  badges, token-based fallback search, per-record view transitions with a
  skip watchdog, and inert drawer containment.
- Anchor: `renderStaticReaderHtml`, `staticReaderStyles`,
  `staticReaderRuntime`.
- On conflict: Preserve the flat editorial hierarchy, hairline dividers, and
  sparse outlined surfaces. Keep fills and shadows for overlays only. Do not
  reintroduce per-element filled cards, decorative leading strokes, raw
  Markdown in the initial payload, or a second dark token block.

### Contracts and documentation

- Files: `test/render.test.ts`, `README.md`, `docs/ARCHITECTURE.md`
- Changed: Retired the one-pixel border prohibition in favor of positive
  assertions on the line tokens, sprite, dates, heading structure, status
  region, feed role, combobox state, and runtime literals. Documentation now
  describes the flat shell and hardened runtime.
- On conflict: Tests protect user-visible behavior and safety boundaries.
  The border-left prohibition remains in force.

## Behavior And UX Impact

- Records scan as an editorial index: kind, id, status, date, title,
  summary, tags, separated by hairlines instead of boxes.
- Every internal record shows when it was created or last updated, in the
  row and in the expanded source reference.
- Hero metrics filter the library on click and reflect pressed state.
- Search waits 140 ms after typing, labels results Top match, #2, #3, and
  announces counts politely to assistive technology.
- The theme toggle cycles system, light, and dark, and only explicit
  overrides persist.
- The mobile filter sheet inerts the background and restores focus on close.
- Direct file opens still search via inline fallback text with multi-word
  token matching.

## Invariants

- The generated reader remains static, dependency-free, and usable without an
  application server.
- Cards are sparse: outlined with a thin stroke, transparent background,
  rounded corners. Fills and shadows are reserved for overlays and small
  label chips.
- No decorative leading strokes define the layout.
- Internal and public render profiles remain isolated.
- Search and filter controls remain keyboard operable with visible focus.
- Motion is progressive, guarded by a view transition skip watchdog, and
  disabled when reduced motion is requested.
- All artifacts stay within configured render budgets.
- Raw Markdown is not embedded into the initial HTML payload.
- The light-dark() color system requires Chrome or Edge 123, Firefox 120, or
  Safari 17.5. Older browsers degrade to legible default colors.

## Verification

- `npm run check`
- `npm run ci`
- Internal and public real-data renders within budget (index.html about
  644 KB of the 1 MB budget)
- Browser pass: theme cycle including system OS flip, ranked search and
  palette, metric quick filters, URL state, expanded records, mobile sheet
  with inert background, public changelog isolation
- Inline fallback search token matching exercised directly

## Notes

Year group markers between release entries were evaluated and rejected: the
filter runtime re-appends every entry during ranking, which would push
non-entry siblings out of position. Release articles carry a data-year
attribute instead so future grouping can be layered on without markup churn.
The generated site was also confirmed against an embedded preview whose
document reports itself hidden; frame-driven behavior cannot be observed
there, which is an environment artifact rather than a reader defect.
