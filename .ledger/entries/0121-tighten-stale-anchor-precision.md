---
id: "0121"
kind: "change"
title: "Tighten stale anchor precision"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "stale"
  - "trust"
files:
  - "src/retrieval.ts"
  - "src/stale.ts"
  - "src/newEntry.ts"
  - "src/index.ts"
  - "test/stale.test.ts"
  - "test/newEntry.test.ts"
  - "docs/SCHEMA.md"
  - ".ledger/entries/0116-check-anchors-and-invariants-against-the-code-tree.md"
symbols:
  - "LedgerAnchor"
  - "extractAnchors"
  - "isCheckableAnchor"
  - "anchorsMissingFromFiles"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema's Changed Files section now says to write anchors in backticks and states which anchors stale checks and how dotted key paths match."
  docs:
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0116"
release: "v0.7.0"
---

# 0121: Tighten Stale Anchor Precision

## Summary

The anchor freshness check from 0116 now separates literal anchors from
descriptions. `extractAnchors` returns structured anchors: each backticked span
in an `- Anchor:` bullet is a literal, and a bullet without backticks is split
on commas into descriptive anchors. `isCheckableAnchor` skips descriptions that
contain spaces and anchors that name the block's own file path, file name, or
directory, and a dotted key path such as `git.ignore` counts as present when
every segment appears in the file. `ledger new --from-diff` now drafts anchors
in backticks so drafted anchors stay checkable. Receipt 0116's wording no longer
trips the `ready` TODO check.

## Why

Release verification for 0.7 ran `ledger stale` across this repository and it
reported 69 stale anchors. A sample showed a false-positive class: prose such as
"README header image", anchors naming the file itself such as `ledger.svg` for
`assets/ledger.svg`, and YAML key paths such as `git.ignore` that are spelled
across lines. After this change the report lists 53 anchors, and each sampled
one is genuine drift, mostly command functions that left `src/cli.ts` in the
0.4 registry refactor and headings renamed in the README overhaul. A warning
signal is only useful when people can trust it, so precision wins over recall.

## Changed Files

### Anchor parsing and checks

- Files: `src/retrieval.ts`, `src/stale.ts`, `src/index.ts`
- Changed: `LedgerAnchor` with `text` and `literal`; `extractAnchors` returns
  backticked spans as literals; `isCheckableAnchor` and dotted key matching;
  the export.
- Anchor: `isCheckableAnchor`
- On conflict: Keep descriptions unchecked; do not strip backticks before
  deciding whether an anchor is literal.

### Drafting, tests, and docs

- Files: `src/newEntry.ts`, `test/stale.test.ts`, `test/newEntry.test.ts`,
  `docs/SCHEMA.md`,
  `.ledger/entries/0116-check-anchors-and-invariants-against-the-code-tree.md`
- Changed: drafted anchors are backticked; a precision test covering a
  description, a self-naming anchor, a present dotted key, and a missing dotted
  key; drafting expectations; schema text; the 0116 sentence rewrapped.
- Anchor: `renderChangedFiles`
- On conflict: The precision test must keep flagging the missing dotted key.

## Behavior And UX Impact

`ledger stale` reports fewer, more trustworthy anchor signals. Newly drafted
entries show anchors in backticks. Historical records in this repository still
carry 53 genuine stale anchors, left for curation with `staleRefs` or a
`historical` status.

## Invariants

- Only literal anchors, or single-token descriptions, are checked.
- An anchor equal to its block's file path, file name, or directory is never
  reported.
- A dotted key path is stale only when some segment is missing.

## Verification

- `npm run typecheck`
- `npm test` (307 tests, including the precision test in `test/stale.test.ts`)
- `node dist/cli.js stale` in this repository (69 anchor signals before, 53 after)
- `node dist/cli.js ready 0116`
- `npm run ci`

## Notes

Found during 0.7 release verification. Next: prepare v0.7.0.
