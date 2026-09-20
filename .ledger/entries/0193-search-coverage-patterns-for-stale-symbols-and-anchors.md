---
id: "0193"
kind: "change"
title: "Search coverage patterns for stale symbols and anchors"
date: "2026-09-19"
updated: "2026-09-19"
status: "landed"
areas:
  - "stale"
  - "git"
  - "trust"
files:
  - "src/stale.ts"
  - "src/git.ts"
  - "test/stale.test.ts"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "grepTrackedFiles"
  - "missingAfterPatterns"
  - "PatternSearches"
  - "patternPathspec"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's stale section and the schema doc's anchor rules describe how coverage patterns are searched and what happens when the search cannot run."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
related:
  - "0116"
  - "0121"
---

# 0193: Search Coverage Patterns For Stale Symbols And Anchors

## Summary

`ledger stale` now searches the files a record's coverage patterns cover.
Patterns such as `src/**` became Git `:(glob)` pathspecs and are searched with
`git grep` for the symbols and anchors the record's exact files did not
account for. When the search cannot run, because Git is missing, the workspace
is outside a work tree, or a pathspec carries its own magic, the patterns
report nothing instead of guessing. `grepTrackedFiles` in `src/git.ts` is the
one place that runs the search, and it returns undefined for "could not
search" so a caller can tell that from "searched and absent".

## Why

Kore, Ledger's first outside adopter, reported 169 stale signals, 156 of them
stale symbols. Its receipts list code as patterns such as
`blueprints/go-hypermedia-postgres/**` alongside a changelog and a doc. The
reference cache dropped every pattern and read only the exact files, then
checked every symbol against that unrepresentative remainder, so symbols that
do exist under the patterns were reported as drift. `requireOperator`,
`ReplayDomainEvent`, and `RegisterJobQueue` are all in the tree under the
globs their receipts name. Volume like that hides the real drift a fresh agent
needs to see, and it makes the packets those receipts feed look untrustworthy.
The alternative, skipping symbol and anchor checks whenever a record lists a
pattern, was rejected because it would leave pattern-heavy repositories with
no freshness checking at all.

## Changed Files

### Search

- Files: `src/git.ts`, `src/stale.ts`
- Changed: `grepTrackedFiles` runs `git grep -I -h -o -F` for a bounded set of
  terms over a bounded set of pathspecs and distinguishes no matches, exit 1,
  from no answer. `missingAfterPatterns` converts each coverage pattern to a
  `:(glob)` pathspec, searches the candidates the exact files left missing,
  and drops the ones found. `PatternSearches` memoizes a run's searches, and a
  record's Changed Files blocks are searched together rather than one after
  another. Member names are searched by segment the same way text is matched.
- Anchor: `grepTrackedFiles`, `missingAfterPatterns`
- On conflict: A pattern that cannot be searched must never produce a stale
  signal, and a pattern beginning with `:` is never passed to Git as magic.

### Tests and docs

- Files: `test/stale.test.ts`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: a fixture whose receipt lists `src/**` and an exact file reports
  nothing without Git, and after `git init` reports only the symbol and anchor
  that exist nowhere, while the one living under the pattern stays clean. The
  docs describe the search, the silent fallback, and its cost.
- Anchor: `searches the files a coverage pattern covers, and stays silent without Git`
- On conflict: Keep the case that proves a pattern-covered symbol is not
  reported and an absent one still is.

## Behavior And UX Impact

Repositories whose receipts reference code by pattern stop seeing false stale
symbols and start getting real anchor checks for those blocks. In Kore the
report goes from 169 signals to 25: stale symbols fall from 156 to 2, and
stale anchors rise from 12 to 22 because blocks that name only patterns were
never checked before. This repository is unchanged at 0 signals. The search
costs one `git grep` per record and block file list, so `ledger stale` and
`ledger doctor` take about 15 seconds on Kore's 12,000 file tree against 0.4
seconds here.

## Invariants

- A coverage pattern that cannot be searched produces no stale signal.
- A symbol or anchor found in any file a record's patterns cover is not stale.
- Exact file references keep their existing reading, caching, and byte limit.
- A pattern is passed to Git only as a `:(glob)` pathspec, never as pathspec
  magic of its own.

## Verification

- `npx vitest run test/stale.test.ts test/git.test.ts test/doctor.test.ts`
- `npm run ci`
- Against Kore at fe1e66e8: 169 signals before, 25 after, and the three
  sampled symbols were confirmed present in the tree under the globs their
  receipts name.

## Notes

Found while triaging Kore's stale report for its handoff. The 22 anchors, 2
symbols, and 1 invariant that remain there are candidates for real drift, and
five of the anchors are capture artifacts in Kore's receipts 0016, 0022, 0023,
and 0024. A one-pass search over the union of every record's patterns would
cut the cost further; memoizing and batching a record's blocks only saved
about a tenth, because each record's pattern set is its own.
