---
id: "0147"
kind: "change"
title: "Skip binary files in stale checks"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "stale"
  - "trust"
files:
  - "src/stale.ts"
  - "test/stale.test.ts"
  - "docs/SCHEMA.md"
symbols:
  - "detectStaleKnowledge"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema doc's anchor paragraph says listed files that are not UTF-8 text are skipped by the anchor and symbol checks."
  docs:
    - "docs/SCHEMA.md"
commits: []
related:
  - "0074"
  - "0116"
  - "0121"
  - "0146"
release: "v0.8.0"
---

# 0147: Skip Binary Files In Stale Checks

## Summary

`ledger stale` and `ledger doctor` no longer stop when a record lists a
screenshot or another file that is not UTF-8 text. The stale run's file cache
treats such a file like a missing one: it adds nothing to the text that
symbols and anchors are checked against, and a block that names only binary
files is skipped. Text files the same record lists are still checked.

## Why

Receipt 0146 lists the README screenshots it recaptured together with a
symbol, and both commands then failed with "symbol source is not valid UTF-8"
before reporting anything. Symbol extraction already skips files by
extension, but the stale run read every exact file a record lists. Listing
the images as a glob would have hidden the crash from this repository and
left it for adopters whose receipts name an icon or a screenshot. Guessing
binary files from their extension was rejected in favor of the decoder's own
verdict.

## Changed Files

### Stale file cache

- Files: `src/stale.ts`
- Changed: the cache's `load` returns undefined when the bounded UTF-8 read
  fails with `invalid-utf8`; the size limit and every other read error still
  stop the run.
- Anchor: `ReferencedFileCache`, `invalid-utf8`
- On conflict: Keep reads bounded and keep stale signals non-blocking; only a
  file that cannot be decoded as text is skipped.

### Tests and docs

- Files: `test/stale.test.ts`, `docs/SCHEMA.md`
- Changed: a stale test lists a PNG next to text files with symbols and a
  block anchored only to the image, and expects the text files' stale symbol
  and anchor and nothing for the image; the schema doc's anchor paragraph
  describes the skip.
- Anchor: `skips binary files a record lists and keeps checking its text files`, `stale-anchor`
- On conflict: Keep the test proving that text files in the same record are
  still checked.

## Behavior And UX Impact

Repositories whose receipts list images, archives, or other binary files get
stale and doctor reports again instead of an `invalid-utf8` failure.

## Invariants

- A listed file that is not UTF-8 text never stops `ledger stale` or
  `ledger doctor`.
- Anchors and symbols are still checked against the text files a record
  lists.
- Referenced file reads stay bounded by `limits.maxTotalDocumentBytes`.

## Verification

- `npx vitest run test/stale.test.ts test/doctor.test.ts`
- A script running the new test's fixture against the build from before the
  fix threw `invalid-utf8`, and the fixed source passes the test.
- `node dist/cli.js stale`
- `node dist/cli.js doctor`
- `npm run ci`

## Notes

Found while writing receipt 0146. A binary file larger than
`limits.maxTotalDocumentBytes` still stops the run at the size check, as any
oversized referenced file does.
