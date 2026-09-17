---
id: "0130"
kind: "change"
title: "Record the live Kore capture session"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "capture"
  - "adoption"
files:
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B007-capture-hooks-skills-and-authoring.md"
  - ".ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md"
  - ".ledger/entries/0129-a-live-kore-session-never-learned-about-its-drafted-receipt.md"
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the live Kore session result, the Kore follow-through, and B010 as the next slice ahead of B009."
  docs:
    - "docs/HANDOFF.md"
commits: []
backlog:
  - "B007"
  - "B010"
decisions:
  - "D005"
  - "D007"
related:
  - "0128"
  - "0129"
release: "v0.8.0"
---

# 0130: Record The Live Kore Capture Session

## Summary

B007's live acceptance check ran in Kore on 2026-09-16. A fresh Claude Code
session given an ordinary task received Ledger context on start, recorded its
edit on session S0001, and left draft receipt 0002 on stop, which the agent
finished to pass `ledger ready` when asked. Product note 0129 records what did
not work: the agent was never told the draft existed, Ledger's instructions
steer it toward a duplicate `ledger new`, and landing a linked draft
mid-session re-drafts. B007 is landed with that unmet no-friction check moved
to the new backlog item B010, which gathers every fix from 0122, 0125, 0126,
0127, and 0129 in priority order. The handoff lists the Kore follow-through
first and B010 ahead of B009.

## Why

The capture feature set shipped in 0.6 and now works in an outside repository,
so B007's scope is done. The remaining problems are a different kind of work,
adoption and agent guidance, and they need their own acceptance checks,
including a second live session that finishes its draft unprompted.

## Changed Files

### Backlog

- Files: `.ledger/backlog/B007-capture-hooks-skills-and-authoring.md`,
  `.ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md`
- Changed: B007 landed with the acceptance record; B010 created with scope,
  acceptance checks, and risks.
- Anchor: `no-friction check`, `finishes its hook-drafted receipt`
- On conflict: B010 owns the unmet no-friction check; do not reopen B007 for
  it.

### Handoff and product note

- Files: `docs/HANDOFF.md`,
  `.ledger/entries/0129-a-live-kore-session-never-learned-about-its-drafted-receipt.md`
- Changed: the adopter status, the Kore follow-through, and B010 as the next
  slice; the live session findings.
- Anchor: `Kore follow-through`, `systemMessage`
- On conflict: Keep the Kore sequencing: exit the session before landing
  receipt 0002.

## Behavior And UX Impact

No runtime behavior changes. The handoff now starts with finishing Kore's
uncommitted rename safely and then B010.

## Invariants

- Every friction finding from the Kore rollout is in one product note and
  referenced from B010.
- B010's acceptance checks include a second live Kore session.

## Verification

- `node dist/cli.js validate`
- `node dist/cli.js ready 0130`
- `node dist/cli.js ci`
- `npm run ci`

## Notes

Evidence came from the live session's report and a direct read of Kore's
working tree: session S0001 active with `CONTRIBUTING.md`, receipt 0002
finished and passing `ready`, and Kore's `ledger ci` passing. The session ran
in the Claude desktop app, whose `/exit` left the process running without
firing SessionEnd; S0001 was closed by hand, 0002 was landed, and both were
committed with the rename in Kore commit `c9b3ad5` on forge#23.
