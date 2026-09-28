---
id: "0198"
kind: "change"
title: "Elevate the reader design and simplify theme preferences"
date: "2026-09-28"
updated: "2026-09-28"
status: "draft"
areas:
  - "reader"
  - "design"
files:
  - ".ledger/entries/0168-adopt-dossier-s-visual-system-in-the-reader.md"
  - "assets/readme/adopt.svg"
  - "assets/readme/agent-draft-notice.svg"
  - "assets/readme/agent-session-start.svg"
  - "assets/readme/changelog.png"
  - "assets/readme/ci.svg"
  - "assets/readme/loop.svg"
  - "assets/readme/overview-light.png"
  - "assets/readme/overview.png"
  - "assets/readme/packet.svg"
  - "assets/readme/palette.png"
  - "assets/readme/ready.svg"
  - "assets/readme/receipt.png"
  - "assets/readme/records.png"
  - "assets/readme/timeline.png"
  - ".ledger/decisions/D009-the-reader-owns-its-visual-system.md"
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "README.md"
  - "scripts/readme-assets.mjs"
  - "scripts/readme-screenshots.mjs"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
symbols:
  - "Consequences"
  - "Context"
  - "Decision"
  - "Decisions taken in conversation (all recorded)"
  - "Next slices, in order"
  - "README Images"
  - "Render And Export Adapters"
  - "Revisit Criteria"
  - "The reader"
  - "ThemeMode"
  - "Where the product stands"
  - "applyTheme"
  - "graphSummary"
  - "iconForKind"
  - "iconPaths"
  - "overview"
  - "publicMain"
  - "recordBadges"
  - "recordList"
  - "renderActivity"
  - "renderStaticReaderHtml"
  - "systemTheme"
  - "themePreference"
  - "themeToggle"
  - "tile"
  - "topbar"
docs:
  - "CONTRIBUTING.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "Reader architecture, theme behavior, screenshot palette, and the handoff now describe the elevated design."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
    - "CONTRIBUTING.md"
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D009"
related:
  - "0196"
  - "0197"
---


# 0198: Elevate the reader design and simplify theme preferences

## Summary

Elevates the reader and public changelog using Dossier's redesigned reader as a
visual reference. Neutral grayscale surfaces, stronger typography, labeled kind
icons, a latest-change shortcut, and more generous controls improve scanning and
navigation across desktop and mobile. The theme switch offers Light and Dark,
follows the operating system until an explicit choice, and remembers that choice.
The README artwork and design documentation follow the new visual system.

## Why

Kyle approved the existing views and workflows, then asked for a more professional
and ergonomic presentation with substantially more design ambition. The first
pass's warm palette and three-state theme control no longer matched that direction.
Dossier supplies a visual reference without becoming a runtime or build dependency.

## Changed Files

### Reader appearance and structure

- Files: `src/reader/styles.css`, `src/renderHtml.ts`
- Changed: neutral paired tokens, a segmented navigation bar, icon-based theme
  switch, stronger masthead and record hierarchy, latest-change shortcut, semantic
  kind badges, calmer panels, roomier search and filters, readable detail sections,
  and a coordinated public changelog. All three tabs remain visible on phones and
  the quality filters stay inside narrow viewports.
- Anchor: `overview`, `iconForKind`, `recordBadges`, `topbar`
- On conflict: Keep the three views and URL navigation. Preserve upright headings,
  full outlines instead of accent stripes, and both responsive color schemes.
- Docs impact: README and ARCHITECTURE describe the resulting interface.

### Theme behavior and accessibility

- Files: `src/reader/runtime.ts`, `src/renderHtml.ts`, `test/readerRuntime.test.ts`
- Changed: resolves the system preference before paint, restores an explicit
  light/dark choice, follows OS changes only before that choice, and keeps the
  switch usable when storage is unavailable. The activity SVG is an accessible
  group so its interactive bar descendants remain exposed.
- Anchor: `applyTheme`, `renderActivity`, `renderStaticReaderHtml`
- On conflict: Preserve the accessible switch value and the first-paint/runtime
  agreement. Legacy auto/system values mean no explicit preference.
- Docs impact: README and ARCHITECTURE explain the binary preference contract.

### README assets and durable guidance

- Files: `scripts/readme-assets.mjs`, `scripts/readme-screenshots.mjs`, `assets/readme/`,
  `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `.ledger/decisions/D009-the-reader-owns-its-visual-system.md`,
  `.ledger/entries/0168-adopt-dossier-s-visual-system-in-the-reader.md`
- Changed: terminal cards and screenshot frames use the neutral palette, captures
  show the elevated interface, and D009 records the revised reference relationship
  with Dossier. Removes obsolete descriptions of theme cycling and responsive rails,
  and acknowledges the deliberately retired theme symbols in receipt 0168.
- Anchor: `COLORS`, `LOOP`, `frameLine`, `The reader`, `README Images`
- On conflict: Regenerate artwork from real output, keep the screenshot recipes
  reproducible, and retain Ledger's independence from the sibling project.
- Docs impact: The listed documentation is updated directly.

## Behavior And UX Impact

The page initially matches the operating system. One click always switches to the
other theme, and later visits keep that choice. The overview offers a direct route
to the latest change, record kinds have recognizable icons and written labels,
and mobile readers can reach every view from the toolbar.

## Invariants

- Only light and dark are explicit preferences; an unset or legacy preference follows the OS.
- Failed storage reads and writes never prevent theme switching.
- The head script and runtime resolve the same initial theme.
- Every record kind keeps a written label alongside its icon and color.
- The public reader exposes only released versions and Public Notes.
- No external fonts, production dependencies, or imports from Dossier are added.
- Selected states never use colored edge stripes, and headings stay upright.

## Verification

- `npm run ci` exited 0: 509 tests across 62 files, typecheck, build, Ledger CI, and package dry run.
- `npm run readme:check` exited 0 with the refreshed assets staged.
- `node dist/cli.js ready 0198` and `node dist/cli.js ci` passed.
- Both render profiles fit the 4.5 MB budget: 3.97 MB internal, 361 KB public.
- `npm run typecheck` passed.
- `npx vitest run test/readerRuntime.test.ts test/readerViews.test.ts test/render.test.ts` passed: 58 tests.
- Theme regression tests failed against the previous implementation before the change.
- Shared-browser checks cover responsive views, filters, empty results, palette
  search, a full-width mobile record panel, Escape, and both themes.
- Text tokens exceed 4.5:1 against all three reading surfaces in both schemes.

## Notes

The preview host's resize operation times out. Responsive verification uses actual
320 to 1440px iframe viewports inside the shared T3 browser. README captures use
the same viewport and crop recipes as the screenshot script, captured in tiles
and assembled at 2x resolution without resampling the content. A capture-only
compositing hint avoids the host omitting offscreen panel and dialog contents.
All seven captures were visually reviewed. The existing expired S0007 session
remains the only stale/validation warning; no source or theme reference is stale.
