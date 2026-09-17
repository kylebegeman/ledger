---
id: "0169"
kind: "change"
title: "Write reader sidecars compact and fill search shards to the budget"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "render"
files:
  - "src/render.ts"
  - "test/artifactChunks.test.ts"
  - "docs/ARCHITECTURE.md"
symbols:
  - "shardSearchIndex"
  - "writeStaticReader"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's artifact paragraph says the sidecars are compact JSON and how shards are filled."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0120"
  - "0168"
release: "v0.9.0"
---

# 0169: Write Reader Sidecars Compact And Fill Search Shards To The Budget

## Summary

The search index, its shards, `graph.json`, and `graph/contracts.json` are
now written as compact JSON. `shardSearchIndex` also counts each document's
exact serialized bytes and separators, so a shard never exceeds
`maxSearchIndexBytes` unless one document alone does.

This repository's internal reader went from 3,618,962 bytes, over its
3,500,000 byte total budget with a 515,182 byte shard against a 500,000 byte
limit, to 3,320,754 bytes. `ledger doctor` passes again.

## Why

While B009 was being checked, `ledger doctor` failed on render budgets.

- **The shard overflow was a bug.** Shards were pretty-printed, and the size
  estimate measured each document as its own JSON, not as it prints inside
  the shard array, one indentation level deeper. Every line of a long record
  was two bytes larger than counted, so a shard of long records overflowed.
  The existing test used one-line documents and missed it.
- **Indentation was a third of the graph's size.** Only the reader runtime,
  the engine, and MCP resources read these files, and all of them parse the
  JSON.

Raising this repository's budget was rejected, because the overflow came
from waste, not growth. The detail chunks were already compact.

## Changed Files

### Render

- Files: `src/render.ts`
- Changed: the graph and contracts chunks use `JSON.stringify` without
  indentation. `shardSearchIndex` writes compact shards and the compact
  single file, and it fills each shard while `[`, `]`, the newline, the
  documents, and one comma between each fit the budget. The manifest stub
  stays indented.
- Anchor: `shardSearchIndex`, `writeStaticReader`
- On conflict: Keep the byte count matching the exact serialization; if the
  format changes, change the count with it.

### Tests and docs

- Files: `test/artifactChunks.test.ts`, `docs/ARCHITECTURE.md`
- Changed: a new test shards nested, multi-line documents at three budgets.
  It checks that no shard exceeds the budget, that every shard but the last
  could not take another document, and that no document is lost. The
  architecture doc says the sidecars are compact and how shards fill.
- Anchor: `fills search shards up to the budget`
- On conflict: Keep the multi-line fixture; one-line documents hide
  estimation errors.

## Behavior And UX Impact

Rendered readers are smaller, and sharded search indexes use fewer, fuller
shards within budget. The files hold the same data, so the reader, the
engine, and MCP resources behave the same.

## Invariants

- A search shard exceeds `maxSearchIndexBytes` only when a single document
  does.
- Every document appears in exactly one shard, in order.
- Sidecars parse to the same values as before.

## Verification

- `npx vitest run test/artifactChunks.test.ts test/render.test.ts test/generatedArtifacts.test.ts`
- `node dist/cli.js render`, which reported a passing budget at 3,320,754
  bytes against 3,618,962 before
- `node dist/cli.js doctor`
- `npm run ci`

## Notes

The detail chunk files under `details/` were already compact and did not
change.
