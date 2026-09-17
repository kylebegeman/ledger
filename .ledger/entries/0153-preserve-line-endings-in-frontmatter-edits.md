---
id: "0153"
kind: "change"
title: "Preserve line endings in frontmatter edits"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "records"
  - "sessions"
files:
  - "src/frontmatterEdit.ts"
  - "test/frontmatterEdit.test.ts"
symbols:
  - "lineEnding"
  - "setFrontmatterScalars"
  - "setFrontmatterArray"
  - "replaceSectionBody"
docs: []
docsImpact:
  status: "not-needed"
  reason: "Line endings are an implementation detail of the record editors; the schema doc already says records are edited in place without reformatting."
commits: []
related:
  - "0107"
  - "0132"
release: "v0.8.1"
---

# 0153: Preserve Line Endings In Frontmatter Edits

## Summary

The four record editors that hooks and authoring commands use,
`setFrontmatterScalars`, `setFrontmatterArray`, `ensureFrontmatterArrays`,
and `replaceSectionBody`, now write the line ending the record already uses.
Each reads the ending from the first line break and joins with it, so a
CRLF session record stays CRLF after every touch, note, and close, and an LF
record stays LF.

## Why

The 0.8.0 audit ran the editors over a CRLF session record: one
`setFrontmatterArray` left three lone LF endings among twelve CRLF ones, and
one `replaceSectionBody` rewrote the whole file to LF. On a Windows checkout
with `core.autocrlf`, every PostToolUse hook would mix endings in committed
session records and every `session note` would rewrite them, producing
noisy diffs and, with some editors, a file Git reports as fully changed.
0132 already preserved CRLF when writing `agents.command`; the record
editors now follow the same rule.

## Changed Files

### Editors

- Files: `src/frontmatterEdit.ts`
- Changed: `lineEnding` reads the document's ending; the three frontmatter
  editors join appended lines and the closing fence with it and render block
  lists on it; `replaceSectionBody` joins its lines with it.
- Anchor: `lineEnding`, `frontmatterPattern`
- On conflict: Never emit a bare `\n` into a document that uses CRLF.

### Tests

- Files: `test/frontmatterEdit.test.ts`
- Changed: a CRLF record and an LF record go through all four editors, and
  the results contain only their own ending.
- Anchor: `keep a CRLF record on CRLF`
- On conflict: Keep both endings under test.

## Behavior And UX Impact

Session records and receipts on Windows checkouts keep consistent line
endings through hook and authoring edits, so their diffs show only the lines
that changed.

## Invariants

- An edited record uses one line ending throughout, the one it started with.

## Verification

- `npx vitest run test/frontmatterEdit.test.ts test/sessions.test.ts test/hooks.test.ts test/authoring.test.ts`
- `npm run typecheck`
- `npm run ci`

## Notes

Found by the 0.8.0 audit.
