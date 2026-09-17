---
id: "0158"
kind: "change"
title: "Record the v0.8.1 publish and Kore's move to it"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
  - "adoption"
files:
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records 0.8.1 as published and Kore on it, and its next slice is the live Kore session."
  docs:
    - "docs/HANDOFF.md"
commits: []
backlog:
  - "B010"
related:
  - "0155"
  - "0130"
---

# 0158: Record The v0.8.1 Publish And Kore's Move To It

## Summary

Records that `@kylebegeman/ledger` 0.8.1 was published on 2026-09-17 from
kylebegeman/ledger#22, with GitHub Release notes produced by
`ledger release notes` for the first time and identical to the release
record's Public Notes, and that Kore moved to 0.8.1 in
kylebegeman/forge#26 with Kore receipt 0004. The handoff's state, release
table, and next slices say so, and B010's promotion notes record both Kore
pin moves.

## Why

The handoff is the resume point, and it still called 0.8.1 prepared. The
Kore move showed that a pin bump is now only the three installers: the
diff was 36 version strings and nothing else, because the allowlist uses
plain `ledger` patterns since 0.8.0. That leaves the live Kore session as
B010's only open check.

## Changed Files

### Handoff and backlog

- Files: `docs/HANDOFF.md`,
  `.ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md`
- Changed: the product state names 0.8.1 and Kore on it; the 0.8.1 row is no
  longer marked prepared; the next slices start with the live Kore session;
  B010's promotion notes name forge#25 and forge#26.
- Anchor: `Where the product stands`, `Next slices, in order`, `Promotion Notes`
- On conflict: Keep the handoff describing the published state.

## Behavior And UX Impact

None; records only.

## Invariants

- The handoff names the published version and Kore's pin.

## Verification

- `npm view @kylebegeman/ledger version` printed 0.8.1, and
  `gh release view v0.8.1` showed the release notes, which matched
  `node dist/cli.js release notes v0.8.1` byte for byte.
- In Kore, `npx --yes @kylebegeman/ledger@0.8.1 ci` and `doctor` passed and
  `verify 0004 --run` recorded evidence.
- `node dist/cli.js ready 0158`
- `npm run ci`

## Notes

The second live Kore session stays with Kyle.
