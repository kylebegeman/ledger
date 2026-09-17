---
id: "0122"
kind: "product-note"
title: "Hook-drafted receipts collide with hand-written receipt ids"
date: "2026-09-16"
updated: "2026-09-16"
status: "captured"
areas:
  - "capture"
  - "hooks"
tags:
  - "dogfood"
---

# 0122: Hook-Drafted Receipts Collide With Hand-Written Receipt Ids

## Context

Dogfooding the 0.6 Claude Code hooks in this repository while building the 0.7
trust slice by hand. The agent wrote milestone receipts as files with explicit
ids, and the installed Stop hook drafted a receipt whenever a turn ended after
edits.

## Finding

Twice the Stop hook drafted `NNNN-claude-code-session-<date>.md` with the next
free id, and the next hand-written receipt used the same id, so `ledger ci`
failed validation with `duplicate id` until the draft was deleted. The drafted
receipts also listed their own session record (`.ledger/sessions/S000N-...md`)
in `files`, because `--from-diff` drafting includes untracked `.ledger/sessions`
paths, and one draft carried 186 symbols from a large diff.

## Impact

Agents that write receipts by hand, which this repository's conventions ask
for on milestone commits, fight the capture hooks instead of being helped by
them: they must remember to delete or finish the draft before committing.
Session paths in `files` add noise to coverage and packets.

## Recommendation

Make the draft the receipt an agent finishes rather than a parallel file:
`ledger session note` and the SessionStart packet should name the drafted
entry path so the agent edits it, and `ledger new` should offer to reuse the
session's draft instead of taking a new id. Exclude the sessions directory from
`--from-diff` drafting, and cap drafted symbols per file.

## Follow-ups

- Exclude `.ledger/sessions/**` from `ledger new --from-diff` and session
  receipt drafts.
- Surface the drafted entry path in the SessionStart context and the Stop
  system message so agents finish it.
- Decide whether hand-written milestone receipts should replace or adopt the
  hook draft; record the convention in `docs/HANDOFF.md`.
- Resolved: 0133 keeps session records out of drafts and names each draft to
  the agent, and 0142 stops a hook from drafting when a receipt in the working
  tree already covers the paths.
