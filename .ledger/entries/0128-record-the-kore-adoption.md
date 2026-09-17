---
id: "0128"
kind: "change"
title: "Record the Kore adoption"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "adoption"
  - "capture"
files:
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B007-capture-hooks-skills-and-authoring.md"
  - ".ledger/entries/0125-adopting-ledger-in-a-go-repository-needs-hand-tuned-configuration.md"
  - ".ledger/entries/0126-docs-reconcile-overwrites-curated-routing-docs-under-partial-adoption.md"
  - ".ledger/entries/0127-agent-instructions-name-a-ledger-binary-the-project-may-not-have.md"
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff now says v0.7.0 is published, records Kore as the first adopter with the open live session check, and orders the adoption and capture fixes ahead of the Dossier visual system."
  docs:
    - "docs/HANDOFF.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D007"
related:
  - "0122"
  - "0125"
  - "0126"
  - "0127"
release: "v0.8.0"
---

# 0128: Record The Kore Adoption

## Summary

Kore, the first outside adopter named by D007, installed Ledger 0.7.0 through
npx with Claude Code and Codex hooks, the skill, and the agents block
(kylebegeman/forge#23, Kore receipt 0001). This entry records that state on
Ledger's side. Product notes 0125, 0126, and 0127 capture the install
friction: TypeScript-shaped `adopt` defaults and drafting noise, a
`docs reconcile` that overwrites curated routing docs, and agent instructions
that name a `ledger` binary the project may not have. B007's promotion notes
point at the adoption, and the handoff retires the v0.7.0 publish step, sets
the live Kore session as the next check, and puts the resulting fixes ahead of
B009.

## Why

B007's last acceptance check is an outside repository using capture with no
friction. The install itself produced findings worth fixing before more
adopters arrive, one of them a data-safety issue. Recording them now keeps the
next slice grounded in what actually happened in Kore rather than in memory.

## Changed Files

### Handoff and backlog

- Files: `docs/HANDOFF.md`,
  `.ledger/backlog/B007-capture-hooks-skills-and-authoring.md`
- Changed: published 0.7.0 state; the first adopter; next slices reordered
  (Kore live check, adoption and capture fixes, B009, deferred MCP); B007
  promotion notes.
- Anchor: `Kore live session check`, `Adoption and capture fixes`
- On conflict: Keep the handoff as the resume point; close the Kore check in
  B007 only after a live session leaves a session record and a draft receipt.

### Product notes

- Files:
  `.ledger/entries/0125-adopting-ledger-in-a-go-repository-needs-hand-tuned-configuration.md`,
  `.ledger/entries/0126-docs-reconcile-overwrites-curated-routing-docs-under-partial-adoption.md`,
  `.ledger/entries/0127-agent-instructions-name-a-ledger-binary-the-project-may-not-have.md`
- Changed: three captured dogfood notes with context, findings, impact,
  recommendations, and follow-ups.
- Anchor: `docs.routing`, `hooks install`, `requireEntryFor`
- On conflict: Product notes stay `captured` until a change entry or backlog
  item promotes their follow-ups.

## Behavior And UX Impact

No runtime behavior changes. Readers of the handoff see Kore as an adopter
and the fixes it motivated as the next slice.

## Invariants

- The handoff names the live Kore session as the open B007 check until it
  passes.
- Each adoption finding lives in exactly one product note.

## Verification

- `node dist/cli.js validate`
- `node dist/cli.js ready 0128`
- `node dist/cli.js ci`
- `npm run ci`

## Notes

The Kore side is two stacked pull requests: kylebegeman/forge#22 finishes the
engine step of Corbelo milestone 19 (`data.sync` 0.1.2), and #23 adopts Ledger.
