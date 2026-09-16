---
id: "0096"
kind: "change"
title: "Add an incremental catalog cache"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "performance"
  - "architecture"
  - "cli"
files:
  - "src/catalogCache.ts"
  - "src/documents.ts"
  - "src/config.ts"
  - "src/types.ts"
  - "src/workspace.ts"
  - "src/doctor.ts"
  - "src/performance.ts"
  - "src/operations/definitions/cache.ts"
  - "src/operations/registry.ts"
  - "test/catalogCache.test.ts"
  - "test/performance.test.ts"
  - "test/doctor.test.ts"
  - "test/cliE2e.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "README.md"
  - ".gitignore"
  - ".ledger/config.yaml"
symbols:
  - "readLedgerCatalog"
  - "readLedgerDocuments"
  - "inspectLedgerCatalogCache"
  - "clearLedgerCatalogCache"
  - "resolveCatalogCacheBackend"
  - "measureLedgerPerformance"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture guide gains a Catalog Cache section describing invalidation, backends, and the cache commands; the README documents the cache and its commands."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
release: "v0.4.0"
---

# 0096: Add An Incremental Catalog Cache

## Summary

Every read of the source records now goes through `readLedgerCatalog` in
`src/catalogCache.ts`. It stats each Markdown file and serves unchanged files
from a derived cache under `.ledger/cache/`, parsing only files whose size or
mtime changed and whose SHA-256 content hash differs. Files modified within two
seconds of the last cache write are re-hashed to defeat mtime granularity
races. Removed files drop out of the cache on the next read. The cache header
carries a format version and a fingerprint of the source directories and
limits, so config changes and format bumps rebuild the cache instead of serving
stale records.

Two backends implement one interface: a JSON file written atomically, and a
`node:sqlite` database chosen automatically on Node 24.15 or newer where the
module is a release candidate and no longer warns on import. `cache.backend`
in `.ledger/config.yaml` accepts `auto`, `json`, `sqlite`, or `none`.
`readLedgerDocuments` keeps its signature and becomes a facade that accepts
`{ cache: false }`. New operations `cache status`, `cache warm`, and
`cache clear` expose the cache, `doctor` gains a `cache` check, and `metrics`
times a cold read that bypasses the cache and a warm read that uses it.

## Why

Before this change every command re-read and re-parsed the whole catalog. On
this repository the read step took about 38 ms of a 43 ms pipeline, and the
cost scales linearly with catalog size, so a 10,000 record catalog would spend
seconds parsing before answering an `explain`. Decision D005 names an
incremental content-hash cache as the second prerequisite of the local memory
engine: the planned `serve --api` process and CLI delegation depend on a warm
catalog that only re-parses what changed. Measured on this repository the warm
read now takes about 4 ms against 38 ms cold. The cache is a derived artifact
under D001: it is never read as source, it is written outside the transaction
journal because it is not a source mutation, and it can be deleted at any time.

## Changed Files

### Cache implementation

- File: `src/catalogCache.ts`
- Changed: `readLedgerCatalog` scans source directories with the existing
  limits, compares stat and hash against cached records, parses misses, and
  commits changes through a backend. `JsonCacheBackend` and
  `SqliteCacheBackend` share the `CatalogCacheBackend` interface.
  `inspectLedgerCatalogCache`, `clearLedgerCatalogCache`, and
  `resolveCatalogCacheBackend` support the commands and doctor.
- Anchor: `readLedgerCatalog`
- On conflict: Keep stat-then-hash invalidation and the racy window. Bump
  `ledgerCatalogCacheFormatVersion` whenever the cached record shape changes.

### Document facade and configuration

- Files: `src/documents.ts`, `src/config.ts`, `src/types.ts`,
  `src/workspace.ts`, `.ledger/config.yaml`, `.gitignore`
- Changed: `readLedgerDocuments` delegates to the cache and accepts
  `{ cache: false }`; the `cache` config section has defaults, merge, path
  normalization, and validation; `init` writes the section; `.ledger/cache/**`
  is ignored by Git and by coverage.
- Anchor: `readLedgerDocuments`
- On conflict: The cache must stay optional through `cache.backend: none` and
  invisible to callers that only need documents.

### Diagnostics and operations

- Files: `src/doctor.ts`, `src/performance.ts`,
  `src/operations/definitions/cache.ts`, `src/operations/registry.ts`,
  `test/fixtures/operations-contract.json`
- Changed: doctor reports the cache backend, entries, size, and freshness;
  metrics adds a `read-warm` step and cache hit counts; the registry gains
  `cache.status`, `cache.warm`, and `cache.clear` with `ledger_cache_status`
  exposed over MCP.
- Anchor: `cacheStatusOperation`
- On conflict: Regenerate the operations contract after touching the cache
  operations.

### Tests and docs

- Files: `test/catalogCache.test.ts`, `test/performance.test.ts`,
  `test/doctor.test.ts`, `test/cliE2e.test.ts`, `docs/ARCHITECTURE.md`,
  `README.md`
- Changed: Cache tests cover warm hits, edits, touch-only changes confirmed by
  hash, removals, fingerprint and corruption recovery, bypass, disabled
  backend, inspection, clearing, backend resolution, and the sqlite backend
  when `node:sqlite` loads. The end-to-end workflow test gets a 30 second
  budget because Windows runners exceeded the 5 second default.
- Anchor: `catalog cache`
- On conflict: Keep the sqlite test skipped rather than failing on runtimes
  without `node:sqlite`.

## Behavior And UX Impact

- Repeated commands and MCP calls on an unchanged catalog skip parsing; the
  first read after a change parses only the changed files.
- `.ledger/cache/` appears in projects after the first read. It is ignored by
  Git and by coverage, and `ledger cache clear` removes it.
- `ledger metrics` prints a `read-warm` step and cache hit counts; `ledger
  doctor` prints a `cache` check.
- New commands: `ledger cache status`, `ledger cache warm`, `ledger cache
  clear`, all with `--json`.

## Invariants

- Cached records are byte-for-byte equivalent to a fresh parse of the same
  content; a mismatch in size, mtime, or hash always re-parses.
- The cache is never read as source of truth and is safe to delete.
- Cache writes never take the workspace write lock and never fail a read; a
  failed write is reported in the read statistics.
- All render artifacts and performance steps stay within configured budgets.

## Verification

- `npm run typecheck`
- `npm test` (38 files, 216 tests)
- `npm run build`, then `ledger cache status`, `ledger cache warm`, `ledger
  metrics` (read 37.86 ms, read-warm 4.25 ms), `ledger doctor`, three warm
  `ledger explain` runs at 90 ms wall clock each, and `ledger cache clear` on
  this repository
- `npm run ci`

## Notes

Milestone two of the 0.4 foundation. The sqlite backend is exercised locally
on Node 24.13 through the explicit `cache.backend: sqlite` setting; automatic
selection waits for Node 24.15 where the module stops warning on import.
