---
id: "0199"
kind: "change"
title: "Distill the reader into a compact working archive"
date: "2026-09-28"
updated: "2026-09-28"
status: "draft"
areas:
  - "reader"
  - "design"
files:
  - "scripts/readme-screenshots.mjs"
  - "assets/readme/overview.png"
  - "assets/readme/overview-light.png"
  - "assets/readme/records.png"
  - "assets/readme/timeline.png"
  - "assets/readme/palette.png"
  - "assets/readme/changelog.png"
  - "assets/readme/receipt.png"
  - ".ledger/decisions/D009-the-reader-owns-its-visual-system.md"
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "README.md"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
  - "test/readerViews.test.ts"
  - "test/render.test.ts"
symbols:
  - "A receipt"
  - "Context"
  - "Conventions that were in force"
  - "Decision"
  - "Decisions taken in conversation (all recorded)"
  - "Ledger"
  - "Next slices, in order"
  - "README Images"
  - "Render And Export Adapters"
  - "The reader"
  - "What shipped this cycle"
  - "Where the product stands"
  - "addRecordMap"
  - "isModalPanel"
  - "syncPanelModal"
  - "panelTabStops"
  - "copyText"
  - "agentPacketDigest"
  - "contextBlock"
  - "contextGrid"
  - "graphSummary"
  - "internalMain"
  - "overview"
  - "publicMain"
  - "recentChangesList"
  - "recordDetail"
  - "recordList"
  - "tile"
  - "verificationDescription"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The README, design decision, contributor guidance, architecture, and handoff describe the compact archive and disclosure behavior."
  docs:
    - "README.md"
    - "CONTRIBUTING.md"
    - "docs/ARCHITECTURE.md"
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D009"
related:
  - "0198"
---

# 0199: Distill the reader into a compact working archive

## Summary

Recomposes the reader around recent changes and compact browsing controls.
The overview uses linked counts, a primary history list, and unboxed repository
context. Records and the public changelog are denser; detail panels read as
documents, with a collapsed relationship map after the named references.

## Why

Kyle found the previous pass too card-heavy and loose, and asked to use
Impeccable to remove the generic dashboard feel. Its distill, layout, and
Operate/Read guidance informed this structural revision within Ledger's
existing neutral palette and navigation.

## Changed Files

### Reader structure and density

- Files: `src/renderHtml.ts`, `src/reader/styles.css`
- Changed: removes the marketing hero and boxed overview grid; makes six recent
  changes the primary task path with compact linked counts and a context aside.
  Simplifies navigation, neutralizes kind labels, tightens result rows and the
  palette, and stacks unboxed evidence sections in document-style details.
- Anchor: `overview`, `recentChangesList`, `recordDetail`, `contextGrid`
- On conflict: preserve navigation, complete filter controls, source downloads,
  and readable mobile content. Group by proximity instead of adding cards.
- Docs impact: README, ARCHITECTURE, and D009 describe the final structure.

### Progressive disclosure and regression coverage

- Files: `src/reader/runtime.ts`, `test/readerRuntime.test.ts`,
  `test/readerViews.test.ts`, `test/render.test.ts`
- Changed: the map uses native details after Files and Relationships. Regression
  coverage protects placement, closed initial state, Enter/Space link activation,
  and opening a recent change or its full history from the overview. Narrow
  panels also contain keyboard focus, inert the obscured background, and open
  the visible palette through `/`, while desktop panels remain nonmodal. The
  clipboard fallback keeps its temporary textarea within the focused panel.
- Anchor: `addRecordMap`
- On conflict: retain the map, legend, full reference lists, keyboard routing,
  safe rendered content, and the existing binary theme preference contract.
- Docs impact: ARCHITECTURE and README explain the disclosure behavior.

### Captures and design guidance

- Files: `assets/readme/`, `scripts/readme-screenshots.mjs`, `README.md`,
  `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `.ledger/decisions/D009-the-reader-owns-its-visual-system.md`
- Changed: refreshes the seven real browser captures and documents the flat
  archive layout, neutral kind labels, semantic status color, and map disclosure.
- Anchor: `captureOverview`, `The reader`, `README Images`
- On conflict: retain reproducible screenshot recipes and the offline artifact;
  keep Dossier and Impeccable as references without runtime dependencies.
- Docs impact: the listed documentation is updated directly.

## Behavior And UX Impact

Readers reach recent changes immediately, scan more records at once, and read
invariants and verification without nested boxes. Relationship diagrams remain
available through a labeled native disclosure after the reference lists.

## Invariants

- Overview, Records, Timeline, URL state, search, filters, and keyboard routes remain available.
- Record kinds retain icons and written labels; semantic status is not conveyed by color alone.
- The map starts collapsed, follows named references, and supports keyboard activation.
- Full-screen record panels keep keyboard focus visible and restore the initiating control on close.
- The theme follows the OS until an explicit Light or Dark choice persists.
- Source Markdown remains canonical; the public reader exposes only released Public Notes.
- No external fonts, production dependencies, or shared design runtime are introduced.
- Headings remain upright and selections use full fills or focus outlines, never colored edges.

## Verification

- `npm run ci` exited 0: 515 tests across 62 files, typecheck, build, Ledger checks, and package dry run.
- `npm run readme:check` exited 0 with all seven refreshed captures staged and visually inspected.
- `node dist/cli.js ready 0199` and `node dist/cli.js ci` pass.
- Shared-browser Tab/Shift+Tab, `/`, Escape, and breakpoint changes keep mobile focus visible while preserving nonmodal desktop behavior.
- Impeccable `detect --json` on the three reader source files reports no findings.
- Shared-browser checks at 320, 390, 768, 1000, and 1440px: Overview, Records,
  Timeline, and public changelog show no horizontal page overflow.
- Light/dark desktop and mobile visual inspection; collapsed map is 49px high
  and its SVG stays hidden until disclosure. Both reader profiles render within budget.

## Notes

Impeccable was fetched to a temporary directory and used as design guidance;
its engine and references are not vendored. A clean detector result supplements
rendered inspection and does not certify visual quality. The existing expired
session warning is unrelated to this design revision.
