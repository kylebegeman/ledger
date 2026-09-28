---
id: "0201"
kind: change
title: Refine reader navigation and adopt a warm copper palette
date: 2026-09-28
updated: 2026-09-28
status: draft
areas:
  - reader
  - design
files:
  - .ledger/entries/0196-rebuild-the-reader-s-web-presentation.md
  - .ledger/decisions/D009-the-reader-owns-its-visual-system.md
  - CONTRIBUTING.md
  - assets/ledger-logo-dark.svg
  - assets/ledger-logo.svg
  - assets/ledger.svg
  - assets/readme/adopt.svg
  - assets/readme/agent-draft-notice.svg
  - assets/readme/agent-session-start.svg
  - assets/readme/changelog.png
  - assets/readme/ci.svg
  - assets/readme/loop.svg
  - assets/readme/overview-light.png
  - assets/readme/overview.png
  - assets/readme/packet.svg
  - assets/readme/palette.png
  - assets/readme/ready.svg
  - assets/readme/receipt.png
  - assets/readme/records.png
  - assets/readme/timeline.png
  - docs/ARCHITECTURE.md
  - docs/HANDOFF.md
  - scripts/brand-assets.mjs
  - scripts/readme-assets.mjs
  - scripts/readme-screenshots.mjs
  - src/reader/runtime.ts
  - src/reader/selectMenus.ts
  - src/reader/styles.css
  - src/renderHtml.ts
  - test/readerSelectMenus.test.ts
  - test/readerViews.test.ts
symbols:
  - enhanceSelectMenus
  - internalRail
  - filterBar
  - selectControl
  - syncFilterPlacement
  - syncRowDates
  - updateFilterPills
docs: &a1
  - CONTRIBUTING.md
  - docs/ARCHITECTURE.md
  - docs/HANDOFF.md
docsImpact:
  status: updated
  reason: D009, architecture, contributor guidance, and the handoff describe the
    warm palette, shared custom menus, responsive filter placement, and updated
    artwork.
  docs: *a1
commits: []
related:
  - "0199"
  - "0200"
decisions:
  - D009
---

# 0201: Refine reader navigation and adopt a warm copper palette

## Summary

Makes Records and Timeline easier to browse with pill controls, custom dropdown
menus, and a compact left navigation. Area, Release, and Tag filters live in
the desktop rail and move into the toolbar on smaller screens. Near-white light
surfaces and warm charcoal dark surfaces with copper and apricot accents replace the cool grayscale
and emerald palette throughout the reader, brand assets, and README artwork.

## Why

Kyle approved the overview but found the record and timeline controls clunky,
with a long wall of duplicated facet links. He requested rounded pills, custom
menus, clearer navigation, and a warmer color system with an accent other than
green or blue. He then refined light mode toward white, removing the beige
cast. The overview's composition and existing navigation stay intact.

## Changed Files

### Menus and browsing

- Files: `src/reader/selectMenus.ts`, `src/reader/runtime.ts`, `src/renderHtml.ts`
- Changed: one shared custom listbox enhances every native select, including
  sort, page size, and quality filters. Native select values and events remain
  canonical for filters and URL history. Record types have icon rows and quiet
  count pills; complete area, release, and tag menus replace repeated facet
  lists. The same controls move across the 960px breakpoint without duplication.
  Quality filters show an active count and dismiss on outside click or Escape.
  Timeline dates omit the repeated year under month headings while retaining
  full accessible labels and date values.
- Anchor: `enhanceSelectMenus`, `syncFilterPlacement`, `syncRowDates`
- On conflict: preserve keyboard navigation, typeahead, focus restoration,
  single-menu dismissal, viewport bounds, native values/events, and URL state.
- Docs impact: architecture and D009 explain the new controls and placement.

### Warm visual system

- Files: `src/reader/styles.css`, `scripts/brand-assets.mjs`,
  `assets/ledger.svg`, `assets/ledger-logo.svg`, `assets/ledger-logo-dark.svg`
- Changed: paired warm surfaces, copper/apricot accents, plum/amber/red status
  tones, pill controls and pagination, rounded menu surfaces, and a quieter
  compact rail. The receipt mark and wordmark geometry stay unchanged.
- Anchor: `:root`, `.select-trigger`, `.select-menu`, `.rail-filters`
- On conflict: use the shared tokens in both themes; preserve written labels,
  system fonts, the approved overview composition, and no colored edge stripes.
- Docs impact: contributor guidance and D009 define the revised palette.

### README artwork and durable guidance

- Files: `scripts/readme-assets.mjs`, `scripts/readme-screenshots.mjs`,
  `assets/readme/`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`,
  `docs/HANDOFF.md`, `.ledger/decisions/D009-the-reader-owns-its-visual-system.md`
- Changed: terminal artwork and capture borders share the warm palette; reader
  captures are regenerated from the actual UI. Guidance records the new
  interaction model and color direction without rewriting prior decisions.
  Receipt 0196 acknowledges the retired `syncRailDrawer` symbol; responsive
  control placement replaces the redundant mobile drawer.
- Anchor: `COLORS`, `frameLine`, `Render And Export Adapters`
- On conflict: regenerate derived artwork from the scripts and preserve source
  record history. Native browser verification is preferred; Kyle authorized
  Playwright captures after the shared browser's screenshot operation failed.
- Docs impact: the listed documents are updated directly.

### Regression coverage

- Files: `test/readerSelectMenus.test.ts`, `test/readerViews.test.ts`
- Changed: covers keyboard/pointer selection, native events, disabled options,
  menu bounds and dismissal, history/reset synchronization, reader shortcut
  isolation, and moving canonical controls across the responsive breakpoint.
- On conflict: test behavior and state synchronization rather than fixed markup
  counts or presentation text.
- Docs impact: this receipt records the checked contracts.

## Behavior And UX Impact

Desktop browsing has a short, stable sidebar and fewer competing toolbar
controls. Every dropdown uses the reader's own visual and keyboard behavior.
Mobile retains all filtering in the toolbar. Both schemes use warmer surfaces
and a copper accent, including the logo and generated documentation artwork.

## Invariants

- The overview composition and binary OS-default theme behavior remain intact.
- Every filter retains its native select value and existing URL representation.
- Exactly one set of area, release, and tag controls moves between layouts.
- Custom menu navigation never accidentally invokes reader row/view shortcuts.
- Full dates remain available to assistive technology and in datetime values.
- The reader stays offline-capable and adds no production dependencies.
- Headings stay upright and selections never use colored edge bars.
- Logos remain self-contained outlined SVGs with the existing license.

## Verification

- The focused reader views suite passed all 13 tests, including five new integration cases.
- Brand regeneration is deterministic; standalone and themed marks meet 3:1 contrast against their intended backgrounds.
- `npm run ci` passed with exit status 0: 530 tests across 63 files, typecheck, build, Ledger checks, and package dry run.
- `npm run readme:check` passed with the regenerated assets staged.
- All 10 select-menu unit tests pass, including accessible names, keyboard/typeahead, disabled options, native events, outside/Tab dismissal, Escape, and the palette shortcut.
- Real-browser checks pass at 320, 390, 768, 1000, and 1440px: filters and URL state, sort, quality badges, Escape and Ctrl+K, menu bounds, responsive placement, and full accessible dates. No page errors or horizontal overflow.
- Text token contrast is at least 4.52:1 across the tested reading/control surfaces in both schemes; semantic text passes against its paired soft backgrounds.
- Both render profiles remain within budget: approximately 4.0 MB internal and 370 KB public.
- Independent visual review passed the redesigned views and generated reader captures. Review identified a cropped overview chart; full-page overview capture fixes that framing.
- `impeccable detect src/reader/styles.css src/reader/selectMenus.ts src/renderHtml.ts` exited 0 with no findings. Final Ledger readiness, docs/coverage checks, and diff checks pass; stale reports only the existing expired S0007 session.

## Notes

No release, merge, or publication is included. This continues PR #39.
