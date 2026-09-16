---
id: "0092"
kind: "change"
title: "Sort the reader model newest-first"
date: "2026-07-15"
updated: "2026-07-15"
status: "landed"
areas:
  - "reader"
  - "search"
files:
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "test/render.test.ts"
symbols:
  - "buildStaticReaderModel"
  - "renderStaticReaderHtml"
  - "staticReaderRuntime"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture guide now states that the reader model orders documents newest-first for both profiles, replacing the description of a public-only presentational sort."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0090"
release: "v0.3.2"
---

# 0092: Sort The Reader Model Newest-First

## Summary

Moved document ordering into the reader model. buildStaticReaderModel now
sorts rendered documents by date descending with a numeric-aware identifier
tiebreak, also descending, before the search index is derived, so both
profiles share one newest-first order. The public-only presentational copy
sort in renderStaticReaderHtml was removed, DOM order now equals model
order everywhere, and the command palette's empty-query recent list takes
the first eight search index entries instead of the last eight reversed.

## Why

Entry 0090 sorted the public feed at the presentation layer only and left
the model fix as a recorded follow-up; this change is that follow-up. Plain
identifier comparison left two model-level defects. The search index kept
lexicographic order, so the palette's recent-records list picked the wrong
records: on the public profile it read scrambled patch versions (v0.1.1,
v0.1.10, v0.1.12, v0.1.2), and on the internal profile the lexicographic
tail was mostly release ids because every v-prefixed id sorts after every
numbered entry. DOM order also diverged from model order on the public
profile, a trap for any maintainer correlating the two.

Sorting only the public projection was rejected: the internal index has the
same recency defect, and one shared order removes the divergence instead of
scoping it. Newest-first was chosen over keeping ascending order with a
reversed presentation because every consumer that cares about order (the
feed, year grouping, palette recency) wants recent records first.

## Changed Files

### Model ordering

- File: `src/render.ts`
- Changed: buildStaticReaderModel sorts rendered documents date descending
  with a numeric-aware identifier tiebreak before deriving the search
  index; both profiles share the order.
- Anchor: `buildStaticReaderModel`.
- On conflict: The model is the single ordering authority. Do not
  reintroduce downstream presentational sorts; fix ordering here.

### Markup composition

- File: `src/renderHtml.ts`
- Changed: The public-only date-descending copy sort was removed; both
  profiles render model.documents in model order, and public year-start
  marks continue to derive from that order.
- Anchor: `renderStaticReaderHtml`.
- On conflict: DOM order must equal model.documents order on both profiles.

### Palette recency

- File: `src/renderAssets.ts`
- Changed: The command palette's empty-query recent list slices the first
  eight search index entries instead of the last eight reversed, matching
  the newest-first index.
- Anchor: `staticReaderRuntime`.
- On conflict: Recent records derive from index order; keep the slice
  direction in step with the model sort.

### Contracts and documentation

- Files: `test/render.test.ts`, `docs/ARCHITECTURE.md`
- Changed: A dedicated test asserts date-descending order with the
  numeric-aware tiebreak across model.documents and the search index; the
  test document factory accepts a date so ordering assertions are
  date-driven; the architecture guide describes the shared newest-first
  model order.
- On conflict: This entry supersedes the entry 0090 invariant that the
  public feed sort is presentational and the model untouched; the model
  sort is now the contract.

## Behavior And UX Impact

- The command palette's recent-records list shows the newest records on
  both profiles; previously it surfaced lexicographically last identifiers,
  which on public meant scrambled patch versions and on internal meant
  mostly releases.
- The internal reader opens on the newest records; page one previously
  started at entry 0001.
- The public changelog is visually unchanged; it was already newest-first
  through the presentational sort this change replaces.

## Invariants

- model.documents and the search index are ordered date descending, ties
  broken by numeric-aware identifier descending, on both profiles.
- renderStaticReaderHtml performs no document reordering; DOM order equals
  model order.
- The palette's empty-query recent list is the first eight search index
  entries.
- All artifacts stay within configured render budgets.

## Verification

- `npm run check`
- Internal and public renders within budget via `ledger render` and
  `ledger render --profile public`
- Inspected regenerated artifacts: the public search index reads v0.3.1
  through v0.1.1 in true version order with v0.1.10 between v0.1.12 and
  v0.1.9; the internal recent eight are v0.3.1, 0090, v0.3.0, v0.2.0, 0089,
  0088, 0087, 0086; article order in both HTML outputs matches the sidecar
  index order; public year-start marks still render.

## Notes

Completes the follow-up recorded in entry 0090's notes. Records that share
a date tiebreak by identifier descending, which places a release above the
entries it wraps (v0.3.1 before 0090); this is deterministic and reads
naturally in the feed.
