---
id: "0157"
kind: "change"
title: "Pin the README demo clock and check the cards in CI"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "docs"
  - "ci"
files:
  - "scripts/readme-clock.mjs"
  - "scripts/readme-assets.mjs"
  - "package.json"
  - ".github/workflows/ci.yml"
  - "test/workflows.test.ts"
  - "CONTRIBUTING.md"
symbols:
  - "DemoDate"
docs:
  - "CONTRIBUTING.md"
docsImpact:
  status: "updated"
  reason: "The contributing guide's README Images section documents LEDGER_README_NOW, the pinned default, and the readme:check step CI runs."
  docs:
    - "CONTRIBUTING.md"
commits: []
related:
  - "0137"
  - "0150"
---

# 0157: Pin The README Demo Clock And Check The Cards In CI

## Summary

The README demo now runs its Ledger processes on a pinned day. The asset
script loads `scripts/readme-clock.mjs` with `node --import`, which shifts
`Date` so time starts at `LEDGER_README_NOW` (default
`2026-09-17T12:00:00Z`) and keeps advancing, so the session names and dates
the cards show no longer depend on the day the script runs. A new
`npm run readme:check` regenerates the cards and fails when any differs from
the committed file, and CI runs it once, on the Ubuntu, Node 24 test job.

## Why

The 0.8.0 fact-check found fifteen README errors, and the audit found that
two cards embed the generation date, so a regeneration on another day
produced a diff and no check could tell stale output from a new date. Kyle
left the choice to the assistant. A gate turns "regenerate the cards when
output changes" from a convention into a check, which is where README drift
comes from. The clock is shifted rather than frozen, because a frozen clock
would hang the lock wait and break expiry checks. A shim loaded only by the
script was chosen over a clock variable in Ledger itself, which would put a
test hook into every date the product writes. The check runs on one job
because the cards were captured on Unix and Windows checkouts may rewrite
line endings.

## Changed Files

### Clock and script

- Files: `scripts/readme-clock.mjs`, `scripts/readme-assets.mjs`
- Changed: `DemoDate` replaces `Date` when `LEDGER_README_NOW` parses,
  keeps `Date()` without `new` returning a string, and offsets `Date.now`;
  the script passes `--import` with the shim's file URL and the pinned
  instant to every Ledger process it starts.
- Anchor: `DemoDate`, `LEDGER_README_NOW`, `demoNow`
- On conflict: Keep time advancing from the pinned instant; never freeze it.

### Check and CI

- Files: `package.json`, `.github/workflows/ci.yml`, `test/workflows.test.ts`,
  `CONTRIBUTING.md`
- Changed: the `readme:check` script; the Check README cards step with its
  condition; a workflow test that pins both; the contributing guide's
  README Images section.
- Anchor: `readme:check`, `Check README cards`, `README Images`
- On conflict: Keep the check on one job; the cards are one set.

## Behavior And UX Impact

A pull request that changes hook context or command output the README shows
fails CI until the cards are regenerated. Regenerating on any day produces
the committed cards when nothing they show changed.

## Invariants

- Regenerating the cards without output changes produces the committed
  files on any day.
- CI fails when a committed card differs from a regeneration.
- The clock shim changes nothing unless `LEDGER_README_NOW` is set.

## Verification

- `npm run readme:check` passed; with one card edited and staged it failed.
- `LEDGER_README_NOW=2027-01-05T12:00:00Z node scripts/readme-assets.mjs`
  changed only the dates in two cards, which were then restored.
- `npx vitest run test/workflows.test.ts`
- `npm run ci`

## Notes

Decided in the 0.8.1 audit follow-up, where Kyle delegated the choice. The
four reader screenshots are still captured by hand.
