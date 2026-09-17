---
id: "0182"
kind: "change"
title: "Show summary excerpts as plain prose"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "render"
files:
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "test/render.test.ts"
symbols:
  - "plainProse"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc states how summary excerpts drop list and strong markers."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0181"
  - "0146"
---

# 0182: Show summary excerpts as plain prose

## Summary

Summary excerpts in the reader read as plain prose. Outside code spans, a
summary's list markers and paired `**strong**` markers are dropped, so a
receipt that opens with bullets no longer shows `- **Go:**` in its row or
panel. Code spans keep their backticks and their content, `src/**` included,
and an unpaired `**` stays literal.

## Why

Recent receipts use bullets with bold labels in their Summary. The reader
collapses a summary to one excerpt and renders only code spans, so rows
showed raw Markdown markers. The README screenshots show those rows.

Rejected:

- **Rendering full Markdown in the excerpt.** Paragraphs and lists do not fit
  a one-line excerpt. Record text must stay text, and code spans are the only
  markup the reader adds.

## Changed Files

### Excerpt text

- Files: `src/renderHtml.ts`, `src/render.ts`
- Changed:
  - `scanProseLine` segments now carry their raw text.
  - `plainProse` drops list markers and paired strong markers outside code
    spans.
  - `buildStaticReaderModel` applies it to the Summary before compacting
    it.
- Anchor: `plainProse`, `plainSection`
- On conflict: Code spans must come through unchanged.

### Tests and docs

- Files: `test/render.test.ts`, `docs/ARCHITECTURE.md`
- Changed:
  - A render test covers a summary with a list, bold labels, a glob inside
    a code span, and literal asterisks.
  - The architecture doc names the rule.
- Anchor: `plain prose`
- On conflict: Keep the literal-asterisk cases.

## Behavior And UX Impact

Reader rows and panels show summaries without list or bold markers. The
search index's summary field reads the same way.

## Invariants

- Code span content in a summary is never altered.
- Record text still renders as text; only code spans become markup.

## Verification

- `npx vitest run test/render.test.ts`
- `npm run typecheck`
- `npm run ci`
- The rendered summaries for 0176, 0179, and 0180 read as plain prose.

## Notes

This follows the note in 0181.
