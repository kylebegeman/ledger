---
id: "0137"
kind: "change"
title: "Rebuild the README around real output and refresh the mark"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "docs"
  - "reader"
files:
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/API.md"
  - "assets/ledger.svg"
  - "assets/readme/**"
  - "scripts/readme-assets.mjs"
  - "package.json"
  - "src/reader/styles.css"
  - "src/operations/definitions/server.ts"
symbols:
  - "renderCard"
  - "renderLoop"
  - "cardSpecs"
  - "buildBillingDemo"
  - "buildGoDemo"
docs:
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/API.md"
docsImpact:
  status: "updated"
  reason: "The README is the change. CONTRIBUTING explains how to regenerate its images, and the API doc's client typing claim was corrected while fact-checking the README."
  docs:
    - "README.md"
    - "CONTRIBUTING.md"
    - "docs/API.md"
commits: []
related:
  - "0136"
  - "0138"
  - "0139"
  - "0140"
  - "S0002"
release: "v0.8.0"
---

# 0137: Rebuild The README Around Real Output And Refresh The Mark

## Summary

The README is rewritten to show what Ledger looks like and how it is used: a
reader screenshot up front, a capture loop diagram, the context an agent
receives at session start, the drafted receipt notice, `ledger ready`,
`ledger packet`, `ledger adopt` in a Go repository, and `ledger ci --github`,
all as images of real output from two demo repositories, plus a receipt shown
in the reader beside its Markdown. The long reference sections move to
collapsed command tables and links into `docs/`. The mark is redrawn as an
emerald ruled L with no background shape, and the reader's accent tokens
follow it. `scripts/readme-assets.mjs` regenerates the cards and diagram, and
the npm package leaves the README images out.

## Why

Kyle asked for a complete README overhaul that shows the product and its use
instead of pages of text, a new icon without a background tile, and then a
different color and a cleaner drawing of the chosen mark. Terminal output is
rendered from real commands rather than typed by hand, so the images cannot
drift from behavior without a visible regeneration diff. Kyle chose one image
set over light and dark variants: screenshots carry their own background,
variants double every asset, and npm shows only one. GIF recordings were
rejected as heavy and hard to regenerate.

## Changed Files

### README

- Files: `README.md`
- Changed: a centered hero with the mark, badges, and navigation; Why Ledger
  in three columns; the loop diagram; What your agent sees with four cards; a
  receipt screenshot with its Markdown collapsed; quick starts for a Node
  project and any repository with pinned npx; the reader and public
  changelog; the CI workflow pinned to a CLI version; records, commands,
  library, configuration, and docs tables. A fact-check pass corrected the
  `--json` and MCP scope, `ready` enforcement, `file:` search fallback, page
  reload under `serve --api`, coverage `any` versus docs impact, session
  pruning, config writers, and the release command.
- Anchor: `What your agent sees`, `Quick start`
- On conflict: Keep every command, flag, and default verified against the
  code, and keep one image per visual.

### README images and their generator

- Files: `assets/readme/**`, `scripts/readme-assets.mjs`, `CONTRIBUTING.md`,
  `package.json`
- Changed: six terminal cards and the loop diagram are SVG rendered by the
  script from two throwaway demo repositories built with this checkout's
  `dist/cli.js`; four reader screenshots are dark, captured at 2x, and
  framed with rounded corners and a hairline border; CONTRIBUTING documents
  the script and the screenshot settings; `files` excludes `assets/readme`.
- Anchor: `renderCard`, `README Images`
- On conflict: Regenerate cards with the script instead of editing the SVGs,
  and keep `!assets/readme` in the package files.

### Mark and reader accent

- Files: `assets/ledger.svg`, `src/reader/styles.css`
- Changed: the mark is one filleted L path with three rules in two emerald
  gradients and no background; the reader inlines it. Accent, soft, strong,
  on-accent, canvas glow, positive, and alternate accent tokens move from
  orange to emerald, leaf green, and violet.
- Anchor: `ledger-mark-letter`, `--accent`
- On conflict: Keep the mark free of a background shape and accent text at
  4.5:1 contrast or better against the canvas.

### Docs accuracy

- Files: `docs/API.md`, `src/operations/definitions/server.ts`
- Changed: the API doc says a misspelled operation or wrongly typed input
  fails to compile and that the engine still rejects unknown keys and
  operations it does not serve; `ledger help mcp` lists `ready` and
  `release notes`.
- Anchor: `Typed API Client`, `ledger mcp`
- On conflict: The MCP help list matches the operations that carry MCP
  metadata.

## Behavior And UX Impact

Visitors on GitHub and npm see the reader, the agent context, and the checks
before reading any reference text. The reader and its favicon use the emerald
mark and accent. `ledger help mcp` names every MCP tool. Contributors can
regenerate the README cards with one command.

## Invariants

- Every image the README shows is committed under assets/readme or is the
  mark, and each visual is a single image with no theme variants.
- The npm package contains the mark and nothing under assets/readme.
- Card lines are captured command output or marked annotations, and omitted
  lines are counted in an annotation.
- The mark has no background shape, and the reader inlines the same file.
- Accent text colors keep at least 4.5:1 contrast on the canvas in light and
  dark themes.
- README, CONTRIBUTING, and API copy contain no em dashes.

## Verification

- `npm run ci`
- `node dist/cli.js validate`
- With LEDGER_README_VERSION=0.8.0 the script regenerated all seven SVGs, and
  a row by row comparison with the Python prototype matched text, position,
  and color in every card and the diagram.
- The package dry run lists assets/ledger.svg and no assets/readme file.
- GitHub's Markdown API rendered the README in repository mode; the page was
  reviewed at 1100px in light and dark themes with every image loaded and
  every in-page link resolved.
- tsc on a scratch module: an unknown operation and a wrongly typed input fail
  to compile, and an unknown input key compiles, matching the new API text.
- Contrast: accent on canvas 4.93 light and 9.71 dark, accent on white 5.48,
  positive on its soft fill 5.29, alternate accent 4.98 and 6.61.

## Notes

The reader screenshots are captured by hand with the settings in
CONTRIBUTING. Product note 0136 records that the reader prints backticks
literally, which the screenshots show; recapture them when inline code
renders. The fact-check also produced product notes 0138 (coverage `any`
does not relax `ledger ci`), 0139 (the action comments on every run), and
0140 (the verification allowlist ignores `agents.command`). Session names in
the cards carry the day the script runs, so a later regeneration differs by
date.
