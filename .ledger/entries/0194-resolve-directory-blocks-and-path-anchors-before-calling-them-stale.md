---
id: "0194"
kind: "change"
title: "Resolve directory blocks and path anchors before calling them stale"
date: "2026-09-19"
updated: "2026-09-19"
status: "landed"
areas:
  - "stale"
  - "retrieval"
  - "trust"
files:
  - "src/retrieval.ts"
  - "src/stale.ts"
  - "test/stale.test.ts"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "blockTitleMatchesPath"
  - "TreePaths"
  - "matchesTrackedPath"
  - "fileNamePattern"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's stale section and the schema doc's anchor rules describe directory headings and path anchors."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
related:
  - "0116"
  - "0121"
  - "0193"
release: "v0.9.4"
---

# 0194: Resolve Directory Blocks And Path Anchors Before Calling Them Stale

## Summary

Two more ways a record could be read as drift when it was not. A Changed Files
heading that names a directory path, such as `### internal/composer,
CHANGELOG.md`, now matches the record's files under that directory, so the
block's anchors are checked against them; the candidate has to carry a
separator, so a prose heading word such as `docs` stays prose. An anchor that
names a path the tree still holds, by full path, by a file name under some
directory, or as a directory itself, is treated as a reference to that file
rather than as content to find inside another file. A bare file name counts
only when its tail looks like an extension, which keeps `Server.throttle` a
member name.

## Why

Continuing the Kore triage from 0193. After coverage patterns were searched,
the report still named symbols and anchors that plainly exist: the block headed
`internal/composer, cmd/kore/main_test.go, ...` dropped the directory, so its
anchor was judged against a changelog and two docs, and anchors such as
`docs/security.md` or `internal/registry/openapi.go` were treated as text to
find rather than files to point at. A first attempt matched any heading word
that named a directory, which made blocks titled "Tests, skill, and docs" claim
every file under `docs/`; that took this repository from 0 stale signals to 36,
so the rule now requires a path separator.

## Changed Files

### Block and anchor resolution

- Files: `src/retrieval.ts`, `src/stale.ts`
- Changed: `blockTitleMatchesPath` matches a file under a heading candidate
  that carries a separator. `TreePaths` lists the tracked paths once per run
  and drops anchors that resolve to one of them, with `matchesTrackedPath`
  accepting a full path, a name under a directory, or a directory prefix, and
  `fileNamePattern` limiting bare names to a short extension.
- Anchor: `blockTitleMatchesPath`, `TreePaths`
- On conflict: A heading candidate without a separator stays prose, and an
  identifier without a separator is never resolved as a path.

### Tests and docs

- Files: `test/stale.test.ts`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: a fixture with a block headed `internal/composer, CHANGELOG.md`
  proves the directory's test name and a real doc path are not stale while a
  missing doc path still is; the docs describe both rules.
- Anchor: `matches a block headed with a directory and treats path anchors as references`
- On conflict: Keep the case that separates a path that exists from one that
  does not.

## Behavior And UX Impact

Records that head a block with a directory, or anchor a block to a file
elsewhere in the tree, stop reporting drift they do not have. In Kore the
report falls from 25 signals after 0193 to 14, and this repository stays at 0.

## Invariants

- A heading candidate without a path separator never matches files beneath it.
- An anchor is resolved as a path only when it carries a separator or a short
  extension.
- A path that no tracked file matches is still reported.

## Verification

- `npx vitest run test/stale.test.ts test/retrieval.test.ts`
- `npm run ci`
- Against Kore at fe1e66e8: 169 signals originally, 25 after 0193, 14 now, of
  which 6 are capture artifacts in its own Anchor lines.

## Notes

The 14 that remain in Kore are its triage list: 6 capture artifacts in
receipts 0016, 0022, 0023, 0024 and 0031, and 8 candidates for real drift in
0013, 0014, 0026, 0061 and 0073.
