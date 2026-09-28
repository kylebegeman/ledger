---
id: "0202"
kind: change
title: Rebuild the README around a recorded tour and refine both themes
date: 2026-09-28
updated: 2026-09-28
status: draft
areas: [readme, design]
files:
  - .ledger/decisions/D009-the-reader-owns-its-visual-system.md
  - README.md
  - CONTRIBUTING.md
  - docs/ARCHITECTURE.md
  - docs/HANDOFF.md
  - src/reader/styles.css
  - scripts/brand-assets.mjs
  - scripts/readme-assets.mjs
  - scripts/readme-screenshots.mjs
  - scripts/readme-recordings.mjs
  - assets/ledger.svg
  - assets/ledger-logo.svg
  - assets/ledger-logo-dark.svg
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
  - assets/readme/reader-tour.gif
  - assets/readme/reader-tour.mp4
  - assets/readme/ready.svg
  - assets/readme/receipt.png
  - assets/readme/records.png
  - assets/readme/timeline.png
symbols: []
docs:
  - README.md
  - CONTRIBUTING.md
  - docs/ARCHITECTURE.md
  - docs/HANDOFF.md
docsImpact:
  status: updated
  reason: The README, capture instructions, architecture, design decision, and handoff describe the revised visual identity and recorded tour.
  docs:
    - README.md
    - CONTRIBUTING.md
    - docs/ARCHITECTURE.md
    - docs/HANDOFF.md
related: ["0200", "0201"]
decisions: [D009]
commits: []
---

# 0202: Rebuild the README around a recorded tour and refine both themes

## Summary

Rebuilds the README around Ledger's identity, a real scrolling reader tour,
a shorter setup path, and direct links into the live example. Refines the
reader to near-white light surfaces and charcoal/slate dark surfaces with
blue accents, and gives record highlights rounded corners with tighter padding.

## Why

Kyle requested a substantial README revamp with the new logo and screen
recordings. During that work he rejected the orange cast of dark mode,
requested bluish-gray tones informed by Dossier's examples, and then asked
for the same blue direction in light mode. He also requested tighter, rounded
hover highlights. The approved navigation and overview composition remain.

## Changed Files

### README and recorded tour

- Files: `README.md`, `scripts/readme-recordings.mjs`, `assets/readme/reader-tour.gif`, `assets/readme/reader-tour.mp4`
- Changed: an animated product tour and full-quality recording lead the README;
  live links reach Overview, Records, Timeline, and the public changelog.
  Setup moves earlier; host alternatives, raw receipts, and extra stills live
  behind folds. The CLI reference moves to its existing dedicated guide.
  A repeatable browser script captures real controls and scrolling.
- On conflict: preserve accurate command examples, the Cursor notice timing,
  the distinction between ready/ci/verify, and still alternatives to motion.
- Docs impact: README and CONTRIBUTING explain the product and capture workflow.

### Reader, brand, and supporting visuals

- Files: `src/reader/styles.css`, `scripts/brand-assets.mjs`, `assets/ledger.svg`,
  `assets/ledger-logo.svg`, `assets/ledger-logo-dark.svg`,
  `scripts/readme-assets.mjs`, `scripts/readme-screenshots.mjs`, `assets/readme/`
- Changed: blue accents, cool dark surfaces, and compact rounded record
  highlights replace the warm dark treatment and square hover rows. Brand,
  terminal output artwork, diagrams, and reader captures use the final palette.
  Fixes the overview area-bar spans so their proportional widths render.
  Corrects the billing demo's unsupported four-minute outage guarantee to the
  actual five-attempt retry limit, in both source and README sample.
- Anchor: `:root`, `.entry`, `COLORS`, `LOOP`, `frameLine`
- On conflict: use the theme tokens, preserve readable text contrast and row
  interactions, and regenerate artwork rather than editing generated files.
- Docs impact: architecture and D009 record the current independent visual system.

### Contributor and handoff guidance

- Files: `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `.ledger/decisions/D009-the-reader-owns-its-visual-system.md`
- Changed: documents the revised themes, media regeneration, npm exclusions,
  and the master-only deployment that will activate the example links.
- On conflict: preserve historical decision context while keeping current
  design and capture instructions accurate.
- Docs impact: these are direct documentation updates.

## Behavior And UX Impact

Visitors can watch the real UI, reach the live reader, and install Ledger
without reading the command catalog first. Both themes share a restrained blue
identity. Hovering or selecting a record gives it a compact, rounded highlight.

## Invariants

- Markdown under .ledger remains the source of truth; media is derived.
- Both themes retain the binary toggle and operating-system default.
- Near-white light surfaces remain; dark mode has no orange background cast.
- Dossier informs the design without owning or supplying Ledger's tokens.
- Videos show real reader interactions and keep media out of the npm package.
- Playwright and FFmpeg remain capture tools, not package dependencies.
- The existing Pages workflow deploys only from master; this work does not merge or release.

## Verification

- The revised dark palette passed contrast checks: regular text at least 4.52:1,
  control borders at least 3.05:1, and the mark at least 7.73:1 on the canvas.
- `npm run ci` exited 0: 530 tests across 63 files, typecheck, build, Ledger CI,
  and package dry run. No README media appears in the package.
- Final blue palette text contrast checks pass in both themes: at least 4.51:1
  across the tested reading and control surfaces.
- Records and Timeline highlights were checked in both themes and at 320/390px;
  row padding is tighter and the page has no horizontal overflow.
- README command examples were checked against current CLI help and source;
  a second review verified onboarding, local links, and heading anchors.
- GitHub's Markdown renderer preserves the reduced-motion picture sources.

- `node scripts/readme-screenshots.mjs` regenerated all seven captures; final
  overview captures were repeated after fixing the area-bar display. Independent
  review confirmed the complete charts, blue palette, rounded rows, and no clipping.
- `node scripts/readme-recordings.mjs --keep` exited 0. Both exports are exactly
  24 seconds at 1200 by 800: 12 fps GIF (2,897,697 bytes) and 25 fps H.264 MP4
  (1,826,629 bytes). Actual exported frames show complete scenes and no startup
  blanks, loading gaps, or browser errors; ffprobe metadata checks pass.
- README browser inspection checked all 19 images, the five navigation anchors,
  theme-aware logo sources, GIF/still reduced-motion selection, and 390px layout.
  No failed requests or horizontal overflow remained after images loaded.
- The final area-bar CSS change passed a new build and browser visual checks.
- `node dist/cli.js ready 0202`, `node dist/cli.js ci`, and `git diff --check`
  passed. Stale reports only the existing expired S0007 session.

- `npm run readme:check` exited 0 with the intended assets staged.

## Notes

Continues PR #39. On 2026-09-28 the public reader and changelog returned HTTP
404 because the first master-only Pages deployment has not run. The branch
prepares those links; their availability must be checked after merge.
