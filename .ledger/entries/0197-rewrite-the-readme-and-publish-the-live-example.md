---
id: "0197"
kind: "change"
title: "Rewrite the README and publish the live example"
date: "2026-09-28"
updated: "2026-09-28"
status: "draft"
staleRefs:
  - "files:assets/readme/hero.png"
areas:
  - "readme"
  - "release"
files:
  - ".ledger/sessions/S0008-claude-code-session-2026-09-28.md"
  - ".ledger/entries/0191-prepare-v0-9-3.md"
  - ".ledger/entries/0186-prepare-v0-9-2.md"
  - ".ledger/entries/0168-adopt-dossier-s-visual-system-in-the-reader.md"
  - ".ledger/entries/0146-render-inline-code-in-the-reader.md"
  - ".github/workflows/pages.yml"
  - "README.md"
  - "assets/readme/adopt.svg"
  - "assets/readme/agent-draft-notice.svg"
  - "assets/readme/agent-session-start.svg"
  - "assets/readme/changelog.png"
  - "assets/readme/ci.svg"
  - "assets/readme/hero.png"
  - "assets/readme/loop.svg"
  - "assets/readme/overview-light.png"
  - "assets/readme/overview.png"
  - "assets/readme/packet.svg"
  - "assets/readme/palette.png"
  - "assets/readme/ready.svg"
  - "assets/readme/receipt.png"
  - "assets/readme/records.png"
  - "assets/readme/timeline.png"
  - "docs/HANDOFF.md"
  - "docs/PUBLISHING.md"
  - "scripts/readme-assets.mjs"
  - "scripts/readme-screenshots.mjs"
symbols:
  - "frameLine"
  - "scrollToLibrary"
  - "COLORS"
docs:
  - "README.md"
  - "docs/HANDOFF.md"
  - "docs/PUBLISHING.md"
docsImpact:
  status: "updated"
  reason: "The README is rewritten, PUBLISHING describes the Pages workflow, and the handoff records the state."
  docs:
    - "README.md"
    - "docs/PUBLISHING.md"
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D009"
related:
  - "0196"
---

# 0197: Rewrite the README and publish the live example

## Summary

Rewrites the README around the rebuilt reader and publishes a live example.
The README leads with the reader's overview of this repository, links the
live reader and public changelog on GitHub Pages, pins 0.9.4, and gains a
section on the reader's three views, the record panel, the palette, the
keyboard, and the light theme. The screenshot script is rewritten for the new
reader and captures seven images: overview, overview in light, records with
a record open, timeline, palette, changelog, and the receipt in the demo
workspace. The card generator moves to the reader's dark tokens and sets its
titles upright. A Pages workflow renders both profiles on every push to
master and deploys them.

## Why

The README is the first thing an adopter sees, and it showed the old reader
with 0.9.3 pins. A rebuilt presentation needs current captures, copy that
describes what the reader does now, and a link anyone can open without
installing anything. Publishing this repository's own reader also keeps the
example honest: it is rendered from the receipts under `.ledger/` by the
same command adopters run.

## Changed Files

### README

- Files: `README.md`
- Changed: rewritten copy with the live example links, 0.9.4 pins, the
  overview as the lead image, a reader section with the new captures, and the
  Pages workflow in Development. No em dashes and no italics.
- Anchor: `## The reader`
- On conflict: Keep the live links pointing at the Pages site, keep the pins
  on the latest published version, and keep the copy free of em dashes.

### Screenshots and cards

- Files: `assets/readme/overview.png`, `assets/readme/overview-light.png`, `assets/readme/records.png`, `assets/readme/timeline.png`, `assets/readme/palette.png`, `assets/readme/changelog.png`, `assets/readme/receipt.png`, `assets/readme/hero.png`, `assets/readme/adopt.svg`, `assets/readme/agent-draft-notice.svg`, `assets/readme/agent-session-start.svg`, `assets/readme/ci.svg`, `assets/readme/loop.svg`, `assets/readme/packet.svg`, `assets/readme/ready.svg`, `scripts/readme-screenshots.mjs`, `scripts/readme-assets.mjs`
- Changed: the screenshot script captures the new reader's views, waits for
  the panel and the timeline headings, frames each capture in the reader's
  line color for its theme, and drops the old hero; the card generator uses
  the reader's dark tokens and no italic titles; every card and capture is
  regenerated.
- Anchor: `frameLine`, `scrollToLibrary`, `COLORS`
- On conflict: Regenerate cards with `node scripts/readme-assets.mjs` and
  captures with `node scripts/readme-screenshots.mjs`; never hand-edit the
  SVGs, and keep `npm run readme:check` green.

### Live example

- Files: `.github/workflows/pages.yml`, `docs/PUBLISHING.md`
- Changed: a workflow that builds the package, renders the internal reader
  and the public changelog with the site URL, and deploys them to GitHub
  Pages on every push to master; a branch guard also limits manual deploys
  to master. The publishing doc describes it. No truncated shell pipeline
  runs after staging the artifact, avoiding a possible pipefail exit.
- Anchor: `## The live example`
- On conflict: The workflow pins its actions by commit SHA; move the pins on
  purpose and keep the deploy job scoped to master.

### Handoff

- Files: `docs/HANDOFF.md`
- Changed: the reader redesign in review, the design rules, the enabled Pages
  site, and the next slices.
- Anchor: `Where the product stands`
- On conflict: Keep the handoff as the resume point; retire sections that
  stop being true rather than appending history.

## Behavior And UX Impact

No runtime behavior changes. Readers of the repository get a current README
and a live reader at https://kylebegeman.github.io/ledger/ with the changelog
at https://kylebegeman.github.io/ledger/changelog/ once this lands on master.

## Invariants

- Every README image exists under `assets/readme/` and is generated by a
  script in `scripts/`.
- The README pins the latest published version in every install command and
  in the action reference.
- The Pages workflow deploys only from master and renders with the site URL,
  so feed and permalink URLs are absolute.

## Verification

- Resumed verification on 2026-09-28: `npm run ci` exited 0 with 501 tests;
  `node dist/cli.js ready 0197` passed after acknowledging the retired hero
  image. `npm run readme:check` exited 0 after staging the intended asset
  updates. GitHub's Pages settings confirm the Actions build type.
- The workflow's artifact staging commands passed under Bash with `-e -o
  pipefail`; both profile indexes, search data, and the changelog feed were
  present, with absolute feed URLs and no duplicate public directory.
- `npm run readme:check`
- `node scripts/readme-screenshots.mjs` with Playwright installed with
  `npm install --no-save playwright`, then a visual review of all seven
  captures.
- `npm run ci`
- GitHub Pages is enabled for the repository with the workflow source; the
  first deploy runs when this merges.

## Notes

Playwright stays out of the package's dependencies. The screenshot script
imports it from a temporary install.

The retired `assets/readme/hero.png` path remains in historical file lists; `staleRefs`
acknowledges its deliberate removal without erasing those lists.
