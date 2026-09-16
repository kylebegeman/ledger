---
id: "0105"
kind: "change"
title: "Record the September 2026 handoff"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "docs"
  - "product"
files:
  - "AGENTS.md"
  - "docs/HANDOFF.md"
  - "package.json"
  - ".ledger/decisions/D007-single-runtime-typescript.md"
  - ".ledger/backlog/B007-capture-hooks-skills-and-authoring.md"
  - ".ledger/backlog/B008-trust-provenance-and-typescript-hardening.md"
  - ".ledger/backlog/B009-adopt-dossier-visual-system.md"
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "A durable handoff document and a repository AGENTS.md now route a new session to the current state, decisions, and next slices."
  docs:
    - "docs/HANDOFF.md"
decisions:
  - "D007"
backlog:
  - "B007"
  - "B008"
  - "B009"
commits: []
related:
  - "0093"
  - "0104"
---

# 0105: Record The September 2026 Handoff

## Summary

Added `docs/HANDOFF.md`, a durable resume point describing the published
state, the releases and receipts from this cycle, every decision taken in
conversation, the next slices in order, the conventions in force, and open
threads. Added a repository `AGENTS.md` that routes a new session to the
handoff, the generated `docs/llm/START_HERE.md`, the roadmap, and the
decisions. Recorded D007 (single-runtime TypeScript; Kore as adopter, not
platform) and backlog items B007 (0.6 capture), B008 (0.7 trust and
TypeScript hardening), and B009 (adopt Dossier's visual system). The handoff
is excluded from the npm package.

## Why

The session that shipped 0.3.2 through 0.5.0 is ending. Kyle asked for a
handoff a new agent can enter and resume from quickly, covering everything
discussed, including the Kore discussion and the request to adopt Dossier's
visual design. Ledger's own mechanism for that is durable docs plus decision
and backlog records, so the handoff lives in both.

## Changed Files

### Handoff and entry point

- Files: `docs/HANDOFF.md`, `AGENTS.md`, `package.json`
- Changed: new durable handoff routed by `ledger docs reconcile`; repository
  agent guide with resume steps and working rules; `!docs/HANDOFF.md` in the
  package `files` list.
- Anchor: `## Resume here`
- On conflict: Keep `AGENTS.md` short and pointing at `docs/HANDOFF.md`;
  update the handoff when milestones land instead of growing this guide.

### Records

- Files: `.ledger/decisions/D007-single-runtime-typescript.md`,
  `.ledger/backlog/B007-capture-hooks-skills-and-authoring.md`,
  `.ledger/backlog/B008-trust-provenance-and-typescript-hardening.md`,
  `.ledger/backlog/B009-adopt-dossier-visual-system.md`
- Changed: decision and backlog records for the discussion outcomes.
- On conflict: Supersede D007 with a new decision rather than editing its
  stance; promote backlog items through change entries.

## Behavior And UX Impact

No runtime change. Agents and maintainers have one place to resume from.

## Invariants

- `docs/HANDOFF.md` describes the current state or is updated in the same
  change that makes it stale.
- The handoff is never shipped in the npm package.

## Verification

- `node dist/cli.js validate`
- `node dist/cli.js docs reconcile` (generated routing lists the handoff)
- `npm run ci`

## Notes

Written at the end of the 2026-09-16 session.
