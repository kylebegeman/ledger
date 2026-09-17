---
id: "0149"
kind: "change"
title: "Rank reader search like the CLI and keep the palette working offline"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
files:
  - "src/reader/runtime.ts"
  - "test/readerRuntime.test.ts"
symbols:
  - "scoreSearchDocument"
  - "fallbackCommandItems"
  - "runTransition"
docs: []
docsImpact:
  status: "not-needed"
  reason: "The architecture doc already describes the reader deriving search terms like the CLI and falling back to inline text from a file URL; the code now does what it says."
commits: []
related:
  - "0119"
  - "0120"
  - "0148"
---

# 0149: Rank Reader Search Like The CLI And Keep The Palette Working Offline

## Summary

The reader now scores search the way `ledger search` does: the sidecar omits
each record's `terms` text, and the runtime passed an empty string in its
place instead of leaving it undefined, so the shared scorer never derived it
and the `terms` weight was always zero. The command palette falls back to the
rendered rows when the search sidecar cannot load, as it does from a `file:`
URL, instead of showing an empty dialog. A modified click on a record link
(command, control, shift, alt, or a non-primary button) keeps its browser
meaning, such as opening the record in a new tab. A transition's cleanup no
longer clears the view transition names a newer transition has just set.

## Why

An audit of the 0.8.0 reader compared the reader's ranking against the CLI's
on this repository's catalog: for one query the CLI returned 155 records and
the reader 132, in a different order, because `document.terms || ""` turned
the omitted field into an empty string that `??` in the scorer kept. The
palette is the surface the README screenshots, and opened from disk it said
"No matching Ledger records" for every query while the list search still
worked through `data-search`. The other two fixes came from the same review.

## Changed Files

### Runtime

- Files: `src/reader/runtime.ts`
- Changed: `scoreSearchDocument` passes `terms` through unchanged so
  `scoreSearchFields` derives it with `searchTermsFor`; `fallbackCommandItems`
  builds palette items from the entry rows and their `data-search` text, and
  `renderCommandResults` uses it when the index is empty; the entry click
  handler returns early on a modified click; `runTransition` tracks a
  generation and the entries it named, clears names of a previous run it does
  not name itself, and skips its own cleanup when a newer run has started.
- Anchor: `scoreSearchDocument`, `fallbackCommandItems`, `renderCommandResults`, `transitionGeneration`
- On conflict: Keep the sidecar free of `terms`; parity comes from deriving
  it in both places, not from shipping it.

### Tests

- Files: `test/readerRuntime.test.ts`
- Changed: the fixture strips `terms` from the served index as the writer
  does; new cases assert the reader's visible order equals the CLI's ranking
  for three queries, that a modified click is not prevented and opens no
  panel, and that the palette lists rows and filters them when fetch fails.
- Anchor: `ranks search results exactly as ledger search does`, `fills the command palette from the rendered rows when the search index cannot load`
- On conflict: Keep the served fixture shaped like the file on disk.

## Behavior And UX Impact

Search in the reader returns the same records in the same order as
`ledger search`. Opening the reader from disk gives a working palette that
lists recent records and filters them by plain text. Command-click on a
receipt opens it in a new tab.

## Invariants

- For a query, the reader's ranked order equals `ledger search` over the
  same records.
- The palette always offers results when the list search does.
- A modified click on a record link is never prevented.

## Verification

- `npx vitest run test/readerRuntime.test.ts`; the three new cases failed
  against the bundle from before the fix and pass after it.
- `npm run typecheck`
- `npm run ci`

## Notes

Found by the 0.8.0 audit. The architecture doc's claim that Node and the
browser derive `terms` with `searchTermsFor` was true of the code path but
not of the value the browser passed in.
