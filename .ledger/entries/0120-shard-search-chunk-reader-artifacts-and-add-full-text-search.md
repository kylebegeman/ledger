---
id: "0120"
kind: "change"
title: "Shard search, chunk reader artifacts, and add full-text search"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "reader"
  - "search"
  - "cache"
  - "trust"
files:
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "src/reader/runtime.ts"
  - "src/searchCore.ts"
  - "src/catalogCache.ts"
  - "src/commands/search.ts"
  - "src/fileTransaction.ts"
  - "src/operations/definitions/retrieval.ts"
  - "test/artifactChunks.test.ts"
  - "test/readerRuntime.test.ts"
  - "test/render.test.ts"
  - "test/fixtures/operations-contract.json"
  - ".ledger/config.yaml"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "searchTermsFor"
  - "shardSearchIndex"
  - "chunkRelationshipGraph"
  - "chunkRecordDetails"
  - "renderRecordDetails"
  - "compactHtml"
  - "searchLedgerCatalogCache"
  - "ftsMatchExpression"
  - "runLedgerSearchCommand"
  - "loadDetailChunk"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The architecture render and cache sections describe shards, chunks, the file URL fallback, and the FTS5 table; the schema's render budget config explains per-file budgets and what the total counts; the README reader and search rows mention chunking and --full-text."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0103"
  - "0119"
release: "v0.7.0"
---

# 0120: Shard Search, Chunk Reader Artifacts, And Add Full-Text Search

## Summary

Reader artifacts now stay under their per-file budgets as a catalog grows.
The serialized search index drops each record's `terms` text, which Node and
the browser derive from the weighted fields with `searchTermsFor`, and when it
still exceeds `maxSearchIndexBytes` it is written as shards under `search/`
behind a manifest the runtime follows. The internal graph is split into
`graph.json` and `graph/contracts.json`. The page is written with template
indentation removed outside `pre`, `script`, and `style`, and when it would
still exceed `maxHtmlBytes`, record details move into JSON chunks under
`details/` that the runtime fetches when a record opens, with a fallback panel
(title, a serve-over-HTTP note, and the source link) for `file:` opens where
fetch is blocked. Budgets apply to the largest shard or chunk, stale shards and
chunks are deleted in the render transaction, and the sqlite cache keeps an
FTS5 table that `ledger search --full-text` uses to narrow candidates.

## Why

B008's search item (and brainstorm E4, "chunked artifacts so large catalogs
stay under budget"): this repository's own reader had grown to 1.15 MB of HTML,
579 KB of search index, and 601 KB of graph, failing `doctor`'s render budget.
Two alternatives were rejected. Loading detail chunks through `<script src>`
would have required relaxing the content security policy, and chunking
unconditionally would have degraded `file:` opens for every small catalog, so
chunking only happens past the budget. FTS5 candidates were first used for
every search on the sqlite backend, but on this catalog two of four sample
queries returned a different third result than the full scan, because the
shared fuzzy scorer finds subsequence matches that token search cannot. Search
results must not depend on which backend a Node version selects, so full-text
narrowing is an explicit flag and the default stays the exact scan.

## Changed Files

### Artifacts

- Files: `src/render.ts`, `src/renderHtml.ts`, `src/searchCore.ts`
- Changed: terms omitted from the serialized index; `shardSearchIndex`,
  `chunkRelationshipGraph`, `chunkRecordDetails`, `renderRecordDetails`, and
  `compactHtml`; conditional detail chunking in `writeStaticReader`; chunk-aware
  budget accounting with `largestBytes` and `files`; the `details` artifact
  kind; stale shard and chunk cleanup.
- Anchor: `chunkRecordDetails`
- On conflict: Details stay inline until the page exceeds `maxHtmlBytes`; do
  not chunk small catalogs, because `file:` opens cannot fetch chunks.

### Runtime and transactions

- Files: `src/reader/runtime.ts`, `src/fileTransaction.ts`
- Changed: the runtime follows the search manifest, fetches and caches detail
  chunks, and builds the fallback panel with DOM APIs; the render transaction
  limit now allows per-document shard and chunk writes and deletes.
- Anchor: `loadDetailChunk`
- On conflict: The fallback panel must never use `innerHTML`; chunk HTML is
  renderer output from the same origin, the same trust level as the old inline
  template.

### Search and cache

- Files: `src/catalogCache.ts`, `src/commands/search.ts`,
  `src/operations/definitions/retrieval.ts`
- Changed: cache format version 2 with an FTS5 `search` table maintained in the
  record transaction; `searchLedgerCatalogCache` and `ftsMatchExpression`;
  `--full-text` on `ledger search` with a `candidates` field and an explicit
  note when the backend cannot serve it.
- Anchor: `searchLedgerCatalogCache`
- On conflict: Default search must scan every record so rankings match the
  reader and every backend.

### Tests, config, and docs

- Files: `test/artifactChunks.test.ts`, `test/readerRuntime.test.ts`,
  `test/render.test.ts`, `test/fixtures/operations-contract.json`,
  `.ledger/config.yaml`, `README.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: sharding, graph chunking, detail chunking and cleanup, compaction,
  FTS, and runtime chunk loading and fallback tests; the artifact list and a
  leak-safe fallback wording; regenerated contract; this repository's
  `maxTotalBytes` raised from 2.5 MB to 3.5 MB; docs.
- Anchor: `maxTotalBytes`
- On conflict: The total counts every generated file including source
  sidecars and grows with history; raise it deliberately, as 0094 did, and keep
  the per-file budgets.

## Behavior And UX Impact

This repository's reader passes every budget again. Once the page passes 1 MB,
opening `.ledger/dist/index.html` directly from disk shows a fallback panel for
record details; `ledger serve` shows full details. Search results are unchanged;
`--full-text` is new and opt-in.

## Invariants

- Default `ledger search` ranks every record with the shared scorer on every
  cache backend.
- Every per-file artifact budget is checked against the largest shard or chunk.
- Record details are inline whenever the page fits its budget.

## Verification

- `npm run typecheck`
- `npm test` (306 tests, including `test/artifactChunks.test.ts` and the
  chunked runtime tests)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js render` and `node dist/cli.js doctor` in this repository
- `npm run ci`

## Notes

Milestone nine of 0.7 trust (B008). Next: prepare v0.7.0.
