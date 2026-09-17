---
id: "0161"
kind: "product-note"
title: "Ledger ci fails mid-turn until the hook drafts the receipt"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "capture"
  - "ci"
tags:
  - "dogfood"
---

# 0161: Ledger CI Fails Mid-Turn Until The Hook Drafts The Receipt

## Context

The same live Kore session as 0160. After its edits, and before its first turn
ended, the agent ran `ledger ci` as part of its own verification.

## Finding

`ledger ci` failed coverage and docs impact with three errors each, one per
edited test file under `cmd/**` and `internal/**`. No receipt covered those
files yet, because the Stop hook drafts the session's receipt only when the
turn ends. Nothing in the output said so. The agent worked it out from the
skill, recorded the explanation as a session note, did not run `ledger new`,
and told Kyle the gate would pass once the draft was finished. On the next
prompt it finished the draft and `ledger ci` passed.

## Impact

Running the gate before handing work back is what Ledger's instructions ask
for, so every hooked session that does so mid-turn sees a failure. An agent
that reads the failure literally creates a receipt with `ledger new`, which is
the duplicate B010 set out to prevent, or reports a red gate for work that is
fine. The hook's draft notice arrives only on the next prompt, after the
failure has been read.

## Recommendation

When an active hooked session has touched the uncovered paths, have
`coverage` and `docs-impact` say so: name the session and say its hook drafts
a receipt for these paths when the turn ends, or name the linked draft when
one already exists. Keep them failing, because an unfinished receipt must
still block `ledger ci`, but point to the draft instead of `ledger new`.

## Follow-ups

- A `ledger ci` test with an active session record that lists the uncovered
  paths.
- Mention the mid-turn result in the skill's draft lifecycle section.
- Resolved: 0163 lists failing files in `ledger ci` and names the hooked
  session and its draft.
