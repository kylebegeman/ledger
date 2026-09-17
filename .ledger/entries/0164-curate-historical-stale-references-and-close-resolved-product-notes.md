---
id: "0164"
kind: "change"
title: "Curate historical stale references and close resolved product notes"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "records"
  - "docs"
files:
  - "README.md"
  - ".ledger/entries/**"
symbols: []
docs:
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The README records the measured hook latency through npx, the installed alternative, and what ledger ci reports mid-turn."
  docs:
    - "README.md"
commits: []
related:
  - "0121"
  - "0127"
  - "0163"
release: "v0.8.2"
---

# 0164: Curate Historical Stale References And Close Resolved Product Notes

## Summary

`ledger stale` reported 66 signals in historical records, and now reports
none. Receipts from 0003 to 0072, plus 0103 and 0116, name commands, exports,
and helpers that later refactors renamed or moved. The 0.4 operation
registry replaced every `*Command` function in `src/cli.ts`, for example.
Each record now lists those names in `staleRefs` as `anchors:<name>` or
`symbols:<name>`, which also clears the one invariant signal they caused.

Each of the eleven product notes gains a final `Resolved:` follow-up that
names the receipts that fixed it. The README gets two additions. The first is
the hook latency 0127 asked to measure: 0.47 seconds through npx and 0.17
seconds from an installed copy on an Apple silicon Mac. The second explains
what `ledger ci` reports before a turn ends.

## Why

The handoff listed the stale signals as a debt since 0121 tightened anchor
checks. While they stayed, a new stale signal was lost among 66 old ones, and
`ledger doctor` could never pass its stale-knowledge check. The product notes
stayed `captured` with no pointer to their fixes, so the only way to tell
whether one was open was to search the receipts for its id. 0127's follow-up
to measure hook latency and document a faster install was the one item from
the Kore rollout still undone.

Rewriting old receipts to current names was rejected. They describe the code
as it was, and `staleRefs` is the documented way to keep that history
without false signals.

## Changed Files

### Historical receipts

- Files: `.ledger/entries/**`, which covers 0003 to 0072 except the records
  without signals, plus 0103 and 0116
- Changed: `staleRefs` gained the names `ledger stale` reported, such as
  `anchors:coverageCommand`, `anchors:export * from "./ci.js"`,
  `symbols:helpTopicForCommand`, and `anchors:release --assign --write`.
  Existing entries were kept.
- Anchor: `staleRefs`
- On conflict: Keep every acknowledged name; drop one only when the code
  gains that name again.

### Product notes

- Files: `.ledger/entries/**`, covering notes 0122, 0125, 0126, 0127, 0129,
  0136, 0138, 0139, 0140, 0160, and 0161
- Changed: each Follow-ups section ends with `Resolved:`, naming the fixing
  receipts. For example, 0129 names 0133, 0134, and 0162, and 0160 names
  0163.
- Anchor: `Resolved:`
- On conflict: Keep the original follow-ups; the Resolved line records how
  they were met.

### README

- Files: `README.md`
- Changed: `In any other repository` gives the npx hook cost and the
  installed alternative with its trade-off. `What your agent sees` says
  drafts take symbols from changed lines and explains what `ledger ci` shows
  mid-turn.
- Anchor: `Starting the pinned package through npx costs about 0.3 seconds per hook`,
  `The draft's symbols and anchors come from the lines the diff changed`
- On conflict: Remeasure before changing the numbers, and keep the npx pin
  as the portable default.

## Behavior And UX Impact

`ledger stale` and `ledger doctor` report no stale knowledge in this
repository, so a new signal stands out. A reader of any product note can see
what fixed it. Adopters learn what the npx hook pin costs and how to avoid
the cost on one machine.

## Invariants

- `ledger stale --check` passes in this repository.
- Every product note whose follow-ups shipped ends with a `Resolved:` line
  naming receipts.
- The README's latency numbers come from a measurement, not an estimate.

## Verification

- `node dist/cli.js stale --check`
- `node dist/cli.js validate`
- `node dist/cli.js doctor`
- In Kore, five PostToolUse hook runs with a payload that has no session id
  (so nothing is recorded) took 0.46 to 0.49 seconds through
  `npx --yes @kylebegeman/ledger@0.8.1` after a first 1.22 second run, and
  0.16 to 0.18 seconds with `node` on the cached 0.8.1 package.

## Notes

During the measurement, a first direct run used a cached 0.7.0 package,
which predates the session id guard, and started an untracked session record
in Kore. That file was deleted, and Kore's tree was clean before the 0.8.1
runs.
