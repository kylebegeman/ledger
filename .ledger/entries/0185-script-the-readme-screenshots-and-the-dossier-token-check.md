---
id: "0185"
kind: "change"
title: "Script the README screenshots and the Dossier token check"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "scripts"
  - "reader"
  - "docs"
files:
  - "CONTRIBUTING.md"
  - "scripts/check-dossier-tokens.mjs"
  - "scripts/readme-assets.mjs"
  - "scripts/readme-screenshots.mjs"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "test/readerRuntime.test.ts"
symbols:
  - "openPalette"
docs:
  - "CONTRIBUTING.md"
docsImpact:
  status: "updated"
  reason: "CONTRIBUTING.md now documents the screenshot script and the Dossier token check."
  docs:
    - "CONTRIBUTING.md"
commits: []
decisions:
  - "D003"
related:
  - "0180"
  - "B009"
---

# 0185: Script the README screenshots and the Dossier token check

## Summary

Two maintenance scripts, and a palette fix they surfaced.

- **`scripts/readme-screenshots.mjs`** captures the README's four reader
  screenshots. It uses Playwright, installed with `npm install --no-save`,
  and frames each image the way CONTRIBUTING describes. It serves this
  repository's readers itself, and `readme-assets.mjs --demos-only` builds
  the billing demo.
- **`scripts/check-dossier-tokens.mjs`** compares the reader's design tokens
  with a Dossier checkout. Only Ledger's accent may differ. It also says
  whether `tokens.css` changed since the Dossier commit the stylesheet names.
- **Palette fix.** The command palette now focuses and selects its input
  before the search index loads. Text typed while the index loaded used to
  end up selected, so the next keystroke replaced it.

## Why

The screenshots were captured by hand, so every reader change risked stale or
inconsistently framed README images. The token block said to diff Dossier by
hand. The first scripted capture showed the palette selecting a typed query.

Rejected:

- **Playwright as a dev dependency.** It would add a large download to every
  install for a task run only when the reader's look changes.
- **Running the token check in CI.** CI has no Dossier checkout.

## Changed Files

### Scripts

- Files: `scripts/readme-screenshots.mjs`, `scripts/check-dossier-tokens.mjs`,
  `scripts/readme-assets.mjs`
- Changed:
  - The screenshot script:
    - serves this repository's internal and public readers on free ports
    - builds and renders the billing demo
    - captures each view in a fresh dark context at a device scale factor
      of 2, clipped to whole pixels
    - frames each image at the capture's scale
    - stops only its own servers and deletes its own demo
  - The token check compares light and dark values and reports differences
    and the Dossier history.
  - `readme-assets.mjs --demos-only` builds and keeps the demos without
    writing the cards.
- Anchor: `readme-screenshots.mjs`, `check-dossier-tokens.mjs`, `--demos-only`
- On conflict: Keep Playwright out of `package.json`.

### Palette

- Files: `src/reader/runtime.ts`, `test/readerRuntime.test.ts`,
  `src/reader/styles.css`
- Changed:
  - `openPalette` focuses and selects before it awaits the results.
  - A browser test holds the index back while typing and checks the input
    kept focus and its caret. The test fails with the old order.
  - The stylesheet header points to the token check.
- Anchor: `openPalette`
- On conflict: Keep the focus ahead of the await.

### Docs

- Files: `CONTRIBUTING.md`
- Changed: The screenshot section now gives the script, the install steps,
  and each image's radius. The token check is documented beside it.
- Anchor: `readme-screenshots.mjs`
- On conflict: Keep the table in step with the script's shots.

## Behavior And UX Impact

- Typing right after opening the palette keeps every character.
- Maintainers regenerate the README screenshots with one command.

## Invariants

- The screenshot script never adds Playwright to `package.json` or the
  lockfile.
- The token check allows only Ledger's accent tokens to differ from Dossier.

## Verification

- `npx vitest run test/readerRuntime.test.ts`, including the new palette
  test, which fails when the old order is restored.
- `node scripts/readme-screenshots.mjs` wrote four images at 2880 by 1800,
  1616 by 1312, 2360 by 1640, and 1200 by 1844, and each looked right.
- `node scripts/check-dossier-tokens.mjs` found 25 matching tokens at
  b48ea15. A copy with two changed tokens was reported with exit status 1,
  and a missing checkout exited with status 2.
- `npm run ci`

## Notes

The screenshots are recaptured with the release so they show 0.9.2. Running
`npx playwright install chromium` also removed browser builds that no
installed Playwright referenced.
