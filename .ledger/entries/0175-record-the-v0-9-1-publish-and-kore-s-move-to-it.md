---
id: "0175"
kind: "change"
title: "Record the v0.9.1 publish and Kore's move to it"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
  - "adoption"
files:
  - "docs/HANDOFF.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the 0.9.1 publish from #29 and Kore's move to it in forge#31, retires the Kore plan follow-up, and leaves new features as the next slice."
  docs:
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D008"
related:
  - "0158"
  - "0171"
  - "0174"
---

# 0175: Record The V0.9.1 Publish And Kore's Move To It

## Summary

Records that 0.9.1 published from kylebegeman/ledger#29 and that Kore moved to
it in kylebegeman/forge#31 (Kore receipt 0009). That Kore change also names
the Codex app's Hooks page in Kore's `docs/PLAN.md`, so the handoff drops that
follow-up. The next slice is new features, when Kyle chooses them.

## Why

The handoff has to describe the published state, as 0158 and 0171 did for
earlier releases.

## Changed Files

### Handoff

- Files: `docs/HANDOFF.md`
- Changed: the product state names 0.9.1 and #29 and says this receipt is
  unreleased. The Kore paragraph names forge#31 and receipt 0009, the open
  threads note that Kore's plan names both places to trust hooks, and the
  next slices start with new features.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Open threads and small debts`
- On conflict: Keep the handoff describing the current state.

## Behavior And UX Impact

None; the change is documentation.

## Invariants

- The handoff names the published version and Kore's current pin.

## Verification

- `node dist/cli.js ready 0175`
- `node dist/cli.js validate`
- `npm run ci`

## Notes

This receipt stays unreleased until the next patch. The npm package does not
ship the handoff.
