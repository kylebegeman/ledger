---
id: "0017"
kind: "change"
title: "Polish static reader context"
date: "2026-06-29"
updated: "2026-07-03"
status: "landed"
areas: ["render", "html", "agents", "tests"]
files:
  - "README.md"
  - "assets/ledger.svg"
  - "docs/ARCHITECTURE.md"
  - "package.json"
  - "src/renderHtml.ts"
  - "src/render.ts"
  - "test/render.test.ts"
symbols:
  - "buildStaticReaderModel"
  - "renderStaticReaderHtml"
  - "contextGrid"
docs:
  - "docs/ARCHITECTURE.md"
release: "v0.1.1"
commits: ["63542f9"]
---

# 0017: Polish Static Reader Context

## Summary

Enhances the static reader model and HTML output with extracted summaries,
invariants, verification checks, and the Ledger icon asset. The reader cards now
show the highest-value maintenance context without requiring users to open raw
Markdown first.

## Why

The first reader proved offline rendering, filtering, embedded data, and source
access. For v0.1, the reader should feel useful as a daily inspection tool, not
only as a list of records.

## Changed Files

### src/render.ts

- What changed: Extracts summary, why, invariants, and verification fields into
  the render model, displays invariants plus verification in card context
  blocks, and inlines the bundled Ledger SVG in the reader header when present.
- Anchor: `buildStaticReaderModel`
- On conflict: Keep rendered context derived from source Markdown sections.
  Markdown remains the canonical record.

### assets/ledger.svg

- What changed: Adds the Ledger icon asset copied from the provided source SVG.
- Anchor: `ledger.svg`
- On conflict: Keep this as the canonical project icon asset used by README and
  generated reader output.

### README.md and package.json

- What changed: Displays the Ledger icon in the README and includes `assets/`
  in package contents.
- Anchor: `assets/ledger.svg`
- On conflict: Keep README references relative so they work on GitHub and in the
  package tarball.

### test/render.test.ts

- What changed: Adds assertions for extracted context fields and rendered
  context labels.
- Anchor: `renderStaticReaderHtml`
- On conflict: Keep renderer tests focused on model shape and HTML safety.

### docs/ARCHITECTURE.md

- What changed: Updates the render architecture note to include summaries,
  invariants, and verification checks.
- Anchor: `Render And Export Adapters`
- On conflict: Keep the architecture doc clear that the static reader is
  generated output.

## Behavior And UX Impact

Users can scan a rendered Ledger catalog and immediately see what must remain
true and how each change was verified.

## Invariants

- Reader context is derived from source Markdown sections.
- Markdown source remains accessible for every rendered record.
- The static reader remains a single offline HTML file.
- `assets/ledger.svg` is the canonical project icon asset.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js render`
- `test -s .ledger/dist/index.html`
- `node dist/cli.js ci`
- `node dist/cli.js coverage`

## Notes

Future reader polish can add grouped navigation and release-focused views.
`contextGrid` now lives in `src/renderHtml.ts` after the renderer HTML split.
