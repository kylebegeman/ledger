---
id: "0093"
kind: "change"
title: "Record next-version direction and retired proposals"
date: "2026-09-15"
updated: "2026-09-15"
status: "landed"
areas:
  - "product"
  - "roadmap"
  - "docs"
files:
  - "docs/ROADMAP.md"
  - "docs/scratchpad/next-version-brainstorm-2026-09-15.md"
  - "docs/scratchpad/next-version-brainstorm-2026-09-15.html"
  - ".ledger/decisions/D005-next-version-local-memory-engine.md"
  - ".ledger/decisions/D006-retire-deferred-proposals.md"
  - ".ledger/backlog/B005-architecture-and-token-efficiency-hardening.md"
docs:
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The roadmap's Phase 10 next slices were replaced with a pointer to the re-evaluation, and a new Phase 11 records the accepted local memory engine direction."
  docs:
    - "docs/ROADMAP.md"
decisions:
  - "D005"
  - "D006"
backlog:
  - "B005"
commits: []
release: "v0.3.2"
---

# 0093: Record Next-Version Direction And Retired Proposals

## Summary

Added a from-scratch brainstorm of Ledger's next version to the docs
scratchpad as Markdown plus a styled HTML view, recorded the accepted
direction and Kyle's four supporting decisions as D005, recorded the retired
and reshaped proposals as D006, replaced the roadmap's Phase 10 next slices
with a pointer to that re-evaluation, added Phase 11 describing the local
memory engine pillars, and noted in backlog B005 that the remaining CLI
extraction is absorbed by the planned operation registry.

## Why

The roadmap, backlog, product docs, and the two 2026-08-30 scratchpad reports
carried 68 proposals, 52 of them with no implementing code, and the published
npm package had drifted four releases behind the repository. Kyle asked for a
complete re-brainstorm focused on user-facing features, performance under the
hood, and a local server with its own API, and then asked that the dropped
proposals be recorded formally rather than left as implied future work. Keeping
the brainstorm in the scratchpad and the decisions in `.ledger/decisions` keeps
exploration separate from durable direction, matching the project's docs
lifecycle model.

## Changed Files

### Brainstorm report

- Files: `docs/scratchpad/next-version-brainstorm-2026-09-15.md`,
  `docs/scratchpad/next-version-brainstorm-2026-09-15.html`
- Changed: New exploration document covering live package state, product
  restatement, the September 2026 landscape, the thesis and pillars, verdicts
  on every earlier proposal, sequencing, recorded decisions, quick wins, and
  an evidence snapshot. The HTML view uses the reader's color tokens.
- Anchor: `## 13. Decisions Recorded`
- On conflict: This is a dated scratchpad snapshot. Do not merge later
  planning into it; write a new dated document instead.

### Decisions

- Files: `.ledger/decisions/D005-next-version-local-memory-engine.md`,
  `.ledger/decisions/D006-retire-deferred-proposals.md`
- Changed: D005 accepts the local memory engine direction and records the
  dependency policy, host priority, explicit server model, and 0.x version
  framing. D006 lists retired proposals with reasons and the reshaped ones.
- Anchor: `## Decision`
- On conflict: Decision text wins over roadmap prose. Keep both records
  `accepted`; supersede with a new decision rather than editing the stance.

### Roadmap

- File: `docs/ROADMAP.md`
- Changed: Phase 10 "Next product slices" now points at the re-evaluation and
  names the retired items; Phase 11 "Local Memory Engine" lists the pillars,
  sequencing, and version framing.
- Anchor: `## Phase 11: Local Memory Engine`
- On conflict: Keep Phase 11 as the single description of the next direction
  and keep the retired items out of any next-slices list.

### Backlog

- File: `.ledger/backlog/B005-architecture-and-token-efficiency-hardening.md`
- Changed: Promotion notes state that remaining CLI extraction is absorbed by
  the operation registry under D005; status stays `in-progress`.
- Anchor: `## Promotion Notes`
- On conflict: Do not close B005 until the registry replaces the CLI switch.

## Behavior And UX Impact

No runtime behavior changed. Readers of the roadmap see a planned Phase 11 and
no longer see Go and HTMX adapters or signed records as next slices. Agents
querying decisions find D005 and D006 alongside the four earlier decisions.

## Invariants

- The brainstorm document is an exploration, not a capability list; shipped
  behavior is described by README, ROADMAP status lines, and CLI help.
- Retired proposals in D006 are not planned and are not carried forward by
  default.
- Markdown remains the source of truth; the HTML view is a derived companion
  with identical content.

## Verification

- `npm ci` and `npm run build` on Node 24.13.1
- `node dist/cli.js validate`
- `node dist/cli.js doctor`
- Rendered the HTML view in the browser preview and checked the header,
  register table, and navigation.

## Notes

The checkout used for this change is not a Git repository, so `ledger ci`
coverage and docs impact could not be run against a diff here. Run
`node dist/cli.js ci` after committing in a Git checkout.
