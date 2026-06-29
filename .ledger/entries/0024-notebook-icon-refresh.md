---
id: "0024"
kind: "change"
title: "Refresh notebook icon asset"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["branding", "readme", "render"]
files:
  - "README.md"
  - "assets/ledger.svg"
  - ".ledger/entries/0024-notebook-icon-refresh.md"
symbols:
  - "ledger.svg"
  - "readBundledIcon"
docs:
  - "docs/PRODUCT.md"
release: "v0.1.2"
commits: ["c007784"]
---

# 0024: Refresh Notebook Icon Asset

## Summary

Replaces the bundled Ledger icon with the provided notebook SVG and updates the
README image alt text to describe the notebook icon.

## Why

The new notebook artwork better communicates Ledger as a durable work record
and gives the README and generated static reader a more distinctive brand
signal.

## Changed Files

### assets/ledger.svg

- What changed: Replaced the previous bundled icon with the provided notebook
  SVG asset.
- Anchor: `ledger.svg`
- On conflict: Keep `assets/ledger.svg` as the canonical bundled icon path so
  README and renderer references remain stable.

### README.md

- What changed: Updates the icon alt text to `Ledger notebook icon`.
- Anchor: README header image
- On conflict: Keep the README pointing at `./assets/ledger.svg`.

## Behavior And UX Impact

The README and static reader continue to load the same bundled asset path, but
the visible branding now uses the notebook icon.

## Invariants

- `assets/ledger.svg` remains the canonical project icon asset.
- README references stay relative for GitHub and package tarball rendering.
- The renderer continues to inline the bundled SVG from `assets/ledger.svg`.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js render`
- `test -s .ledger/dist/index.html`
- `npm pack --dry-run`

## Notes

No package version bump is included in this development-branch branding update.
