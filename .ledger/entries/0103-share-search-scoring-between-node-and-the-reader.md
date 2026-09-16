---
id: "0103"
kind: "change"
title: "Share search scoring between Node and the reader"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "search"
  - "reader"
  - "architecture"
files:
  - "src/searchCore.ts"
  - "src/search.ts"
  - "src/renderAssets.ts"
  - "test/searchCore.test.ts"
  - "docs/ARCHITECTURE.md"
symbols:
  - "scoreSearchFields"
  - "fuzzyScore"
  - "sharedSearchRuntime"
  - "scoreSearchDocument"
  - "staticReaderRuntime"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture render section states that search weights and scoring live once in searchCore and are serialized into the reader runtime."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
---

# 0103: Share Search Scoring Between Node And The Reader

## Summary

`src/searchCore.ts` now holds the search weights, `normalizeSearchText`,
`fuzzyScore`, and `scoreSearchFields` once. `ledger search` scores through it,
and the static reader runtime embeds the same functions by serializing them
with `Function.prototype.toString()` at build time, replacing the hand-copied
browser implementation. A parity test evaluates the embedded JavaScript in
Node and checks it produces identical scores and matched fields, and a runtime
test confirms the functions appear exactly once in the reader.

## Why

The August audit's finding G named the duplicated scoring between
`src/search.ts` and `src/renderAssets.ts` as a drift risk: a weight change in
one place silently changed ranking in the other. Decision D005's search
follow-up asks for one scoring module shared by Node and the browser. This
delivers the sharing without adding a bundler; the typed browser runtime and
sharded indexes remain scheduled for 0.7.

## Changed Files

### Shared core

- File: `src/searchCore.ts`
- Changed: weights, normalization, fuzzy scoring, field scoring, and the
  `sharedSearchRuntime` string.
- Anchor: `sharedSearchRuntime`
- On conflict: Functions in this file must stay self-contained; they may only
  reference each other and `searchWeights` because they are serialized.

### Consumers

- Files: `src/search.ts`, `src/renderAssets.ts`
- Changed: `scoreSearchDocument` delegates to `scoreSearchFields`; the reader
  runtime interpolates `sharedSearchRuntime` and keeps a thin
  `scoreSearchDocument` shim for older indexes without `fields`.
- Anchor: `scoreSearchDocument`
- On conflict: Do not reintroduce a second copy of the weights.

### Tests and docs

- Files: `test/searchCore.test.ts`, `docs/ARCHITECTURE.md`
- Changed: parity and embedding tests; architecture note.
- Anchor: `shared search scoring`
- On conflict: The parity test evaluates the serialized runtime with
  `new Function`; keep it free of imports and exports.

## Behavior And UX Impact

Ranking in the reader now matches `ledger search` exactly, including the
two-decimal rounding. No user-facing change beyond that.

## Invariants

- Node and browser search use one set of weights and one scoring function.
- The serialized runtime contains no `import` or `export` tokens.

## Verification

- `npm test` (search, render, generated artifact, and search core suites)
- `npm run ci`

## Notes

Milestone five of 0.5. Sharded search indexes and sqlite FTS remain on the
0.7 list with chunked artifacts.
