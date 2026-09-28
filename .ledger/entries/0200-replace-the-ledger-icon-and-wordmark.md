---
id: "0200"
kind: "change"
title: "Replace the Ledger icon and wordmark"
date: "2026-09-28"
updated: "2026-09-28"
status: "draft"
areas:
  - "design"
  - "branding"
files:
  - ".ledger/entries/0001-ledger-project-bootstrap.md"
  - "assets/brand/Manrope-OFL.txt"
  - "assets/ledger-logo-dark.svg"
  - "assets/ledger-logo.svg"
  - "assets/ledger.svg"
  - "assets/readme/changelog.png"
  - "assets/readme/overview-light.png"
  - "assets/readme/overview.png"
  - "assets/readme/records.png"
  - "assets/readme/timeline.png"
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "README.md"
  - "scripts/brand-assets.mjs"
  - "src/reader/styles.css"
symbols:
  - "Brand Assets"
  - "Next slices, in order"
  - "Notes"
  - "Render And Export Adapters"
  - "Where the product stands"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The README uses theme-specific logo lockups and refreshed reader captures; contributor guidance, architecture, and handoff describe the mark, outlined wordmark, and reproducible assets."
  docs:
    - "README.md"
    - "CONTRIBUTING.md"
    - "docs/ARCHITECTURE.md"
    - "docs/HANDOFF.md"
commits: []
related:
  - "0199"
decisions:
  - "D009"
---

# 0200: Replace the Ledger icon and wordmark

## Summary

Replaces the gradient L and text strokes with a punched-receipt silhouette:
a square opening in a solid sheet with a clipped corner. Light and dark logo
lockups pair it with an outlined lowercase wordmark. The reader, favicon,
and README use the new identity without external fonts or new dependencies.

## Why

Kyle requested a completely new icon and logo after the compact reader
redesign. The new mark uses substantial negative space and a flat silhouette
that remains legible at small sizes. Its receipt motif reflects Ledger's
repo-native change records; emerald connects it with the existing interface.

## Changed Files

### Vector identity and deterministic generator

- Files: `assets/ledger.svg`, `assets/ledger-logo.svg`,
  `assets/ledger-logo-dark.svg`, `assets/brand/Manrope-OFL.txt`,
  `scripts/brand-assets.mjs`
- Changed: a single-path icon on a 24-unit grid and paired light/dark lockups.
  Manrope 600 lettering is converted to paths with adjusted spacing. The
  generator commits outline geometry, needs only Node, and makes no requests.
  Upstream copyright and OFL terms are included with the assets.
- Anchor: `markPath`, `wordmarkPath`
- On conflict: preserve the punched counter and square edges, canonical icon
  path, accessible SVG titles, and font attribution. Never add gradients or
  external resources to the mark.
- Docs impact: CONTRIBUTING documents regeneration and size checks.

### Reader and README integration

- Files: `src/reader/styles.css`, `README.md`
- Changed: the reader uses the theme accent for the mark without clipping
  its corners. Its existing icon loader also supplies the new favicon.
  The README uses a picture element for light and dark wordmarks inside an
  accessible level-one heading.
- Anchor: `.brand-mark`, `.brand-mark svg`
- On conflict: keep system-font UI typography, project names in the reader,
  offline rendering, and relative README asset paths.
- Docs impact: README presents the replacement identity directly.

### README reader captures

- Files: `assets/readme/overview.png`, `assets/readme/overview-light.png`,
  `assets/readme/records.png`, `assets/readme/timeline.png`,
  `assets/readme/changelog.png`
- Changed: regenerated the five browser captures that show the header mark
  using the existing Playwright script after Kyle authorized that browser.
  The palette and receipt crops do not show the mark and remain unchanged.
- On conflict: regenerate screenshots from the actual reader; preserve their
  2x capture resolution and the script's framing.
- Docs impact: the README's product images show the new identity.

### Durable guidance and history

- Files: `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `.ledger/entries/0001-ledger-project-bootstrap.md`
- Changed: explains asset ownership, outlined lettering, and regeneration;
  acknowledges the intentionally retired text-only README heading anchor.
- Anchor: `Brand Assets`, `Render And Export Adapters`, `Where the product stands`
- On conflict: retain the canonical icon path and the distinction between logo
  lettering and the reader's system fonts. Do not rewrite the historical receipt.
- Docs impact: the listed guidance is updated directly.

## Behavior And UX Impact

The reader and browser tab have a new crisp silhouette. The README presents
a complete logo that follows the viewer's color scheme. Its lettering renders
consistently without font loading or substitution.

## Invariants

- `assets/ledger.svg` remains the canonical bundled icon.
- All identity assets are self-contained SVG with accessible titles and no fonts or external resources.
- Light and dark logo files share the same geometry.
- The reader retains its system fonts and independent theme preference.
- Brand generation uses only built-in Node modules and committed geometry.
- The Manrope attribution and OFL text remain included with the outlined logo assets.

## Verification

- `node scripts/brand-assets.mjs` regenerates all three SVGs.
- Repeated generation produces identical asset hashes; XML checks confirm accessible titles and no text, images, scripts, or external references.
- Native SVG rasterization and independent design review cover both schemes and the mark at 16, 24, 32, and 64px.
- Shared-browser DOM checks confirm the new one-path icon, theme accent, unclipped corners, updated SVG favicon, and loaded logo variants.
- Both reader profiles build and render within budget.
- `npm run ci` passed with exit status 0: typecheck, 515 tests across 62 files, build, Ledger checks, and package dry run. Both logo variants and the font license are included in the package.
- `node dist/cli.js ready 0200` and `git diff --check` passed.
- `node scripts/readme-screenshots.mjs overview overview-light records timeline changelog` passed and regenerated the five affected captures at 2x resolution.
- Visual inspection of all five captures, including independent review of records, timeline, and public changelog, found no clipping, stray overlays, or framing defects.
- `npm run readme:check` and final `node dist/cli.js ci` passed.

## Notes

Manrope source: https://github.com/google/fonts/tree/main/ofl/manrope.
The font was used to generate outlines once; it is not a runtime dependency.
The shared preview could load the new reader but screenshot capture failed.
Kyle explicitly authorized the existing Playwright capture script to finish
the README refresh. Playwright was installed without saving dependencies or
changing the lockfile.
