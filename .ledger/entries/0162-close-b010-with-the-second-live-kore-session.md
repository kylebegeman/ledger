---
id: "0162"
kind: "change"
title: "Close B010 with the second live Kore session"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "capture"
  - "adoption"
files:
  - ".ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md"
  - ".ledger/entries/0160-hook-drafts-anchor-a-changed-file-s-first-symbols-not-the-changed-ones.md"
  - ".ledger/entries/0161-ledger-ci-fails-mid-turn-until-the-hook-drafts-the-receipt.md"
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The handoff and roadmap record B010 as landed, and the handoff's next slice is the draft fixes the Kore session exposed."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
backlog:
  - "B010"
related:
  - "0130"
  - "0133"
  - "0151"
  - "0160"
  - "0161"
---

# 0162: Close B010 With The Second Live Kore Session

## Summary

Backlog item B010 is landed. Its last acceptance check, a second live Claude
Code session in Kore, passed on 2026-09-17 with Ledger 0.8.1. The session was
given an ordinary rename across four files and edited them in one message.
Session S0002 recorded all four paths, and the Stop hook drafted Kore receipt
0005. On the next prompt the agent finished that draft to `ledger ready`
without being told it existed and without running `ledger new`. Product notes
0160 and 0161 record what the session exposed, and the handoff and roadmap
name those draft fixes as the next slice.

## Why

B010 exists because the first live Kore session (0130) never learned about
its draft. The fixes shipped in 0.8.0 and 0.8.1, and Kore runs 0.8.1, so only
the live check was left. It needed a real host session rather than a piped
payload: the notice reaches the agent through Claude Code's UserPromptSubmit
context, and only a real agent shows whether the instructions lead it to the
draft instead of a second receipt.

## Changed Files

### Backlog

- Files: `.ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md`
- Changed: the status is `landed`, and the Promotion Notes record the live
  session and point to 0160, 0161, and this receipt.
- Anchor: `Promotion Notes`
- On conflict: Keep B010 landed; new draft work belongs to 0160 and 0161.

### Product notes

- Files: `.ledger/entries/0160-hook-drafts-anchor-a-changed-file-s-first-symbols-not-the-changed-ones.md`,
  `.ledger/entries/0161-ledger-ci-fails-mid-turn-until-the-hook-drafts-the-receipt.md`
- Changed: new notes. Drafted symbols ignore the diff, and `ledger ci` fails
  mid-turn with no hint that the hook will draft the receipt.
- Anchor: `Finding`, `Recommendation`
- On conflict: Keep the evidence from Kore receipt 0005 and session S0002.

### Handoff and roadmap

- Files: `docs/HANDOFF.md`, `docs/ROADMAP.md`
- Changed: Kore's state names the approved Codex hooks, the passed check,
  and kylebegeman/forge#27. The next slices are the draft fixes, then B009.
  The symbols debt cites 0160, and the desktop app's missing SessionEnd moved
  to the host notes. The merge note covers the later pull requests and tags,
  and the roadmap says B010 is closed.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Open threads and small debts`
- On conflict: Keep the draft fixes ahead of B009 unless Kyle reorders them.

## Behavior And UX Impact

None; records only.

## Invariants

- B010 is landed, and its Promotion Notes name the live session's evidence.
- Every finding from the second live Kore session is in product note 0160 or
  0161.
- The handoff's next slices list no finished work.

## Verification

- In Kore, `ready 0005` and `ci --base origin/main --head HEAD` passed with
  Ledger 0.8.1. The session transcript showed the four edits in one message,
  the UserPromptSubmit notice for 0005, `ready 0005`, and no `ledger new`
  call.
- `node dist/cli.js validate`
- `node dist/cli.js ready 0162`
- `npm run ci`

## Notes

The Kore session record was closed with `session close --id S0002` before the
commit, because the desktop app does not fire SessionEnd on `/exit`. Kyle
re-approved Kore's Codex hooks with `/hooks` before the session; no live Codex
session has run yet. The session also found two cleanup checks in Kore's
`internal/releasepack/oci_test.go` that still look for `.forge-oci-layer-*`
staging directories and so can never fail. Kore's S0002 records that under
Next for a separate Kore change.
