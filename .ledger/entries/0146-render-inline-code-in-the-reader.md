---
id: "0146"
kind: "change"
title: "Render inline code in the reader"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
files:
  - "src/renderHtml.ts"
  - "src/render.ts"
  - "src/reader/styles.css"
  - "test/render.test.ts"
  - "docs/ARCHITECTURE.md"
  - "assets/readme/hero.png"
  - "assets/readme/receipt.png"
  - "assets/readme/changelog.png"
symbols:
  - "inlineCodeHtml"
  - "withoutOpenCodeSpan"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's reader section names the prose that renders inline code, says the text is escaped before code spans are built, says search keeps plain text, and says a shortened summary ends before a split code span."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0136"
  - "0137"
  - "0017"
release: "v0.8.0"
---

# 0146: Render Inline Code In The Reader

## Summary

The static reader now renders Markdown code spans in record prose as inline
code: library and record panel summaries, Invariants and Verification
bullets, and the public changelog's release notes. The text is escaped first,
then a backtick run pairs with the next run of the same length on the line,
as in Markdown, and one space of padding on both sides is dropped. A summary
shortened to its excerpt now ends before a code span the cut would split
instead of on a stray backtick. A new `.inline-code` style gives the spans a
soft chip in both themes, and the README's hero, receipt, and changelog
screenshots are recaptured to show it.

## Why

Product note 0136: receipts use backticks for commands, paths, config keys,
and symbols, and the reader printed them as literal characters, most visibly
in the README screenshots and the public changelog. Matching only single
backticks was rejected because a double-backtick span, which Markdown uses to
show a backtick inside code, broke into empty code elements around bare text.
Parsing full Markdown was rejected because the reader shows short prose, and a
renderer would add a dependency and a markup surface for record content.

## Changed Files

### Reader markup and style

- Files: `src/renderHtml.ts`, `src/render.ts`, `src/reader/styles.css`
- Changed: `inlineCodeHtml` escapes the text and replaces each code span
  matched by `inlineCodePattern` with an `inline-code` element; summaries,
  public notes, and the context blocks use it instead of plain escaping.
  `withoutOpenCodeSpan` drops an unclosed span from the end of a text, and
  `compactSection` applies it when it shortens a summary. The stylesheet adds
  the `inline-code` rule with padding, a soft surface, wrapping that clones
  the chip across lines, and a size relative to the surrounding text.
- Anchor: `inlineCodeHtml`, `inlineCodePattern`, `withoutOpenCodeSpan`, `compactSection`, `inline-code`
- On conflict: Escape before matching, and keep titles, file lists, search
  documents, and `data-search` as plain text.

### Tests and docs

- Files: `test/render.test.ts`, `docs/ARCHITECTURE.md`
- Changed: a render test covers a summary with two code spans, HTML inside a
  span, a stray backtick, invariant and verification bullets, a
  double-backtick span, and a public release note, and another covers a
  shortened summary cut inside a code span; the architecture doc's reader
  section describes both.
- Anchor: `renders Markdown code spans in record prose as escaped inline code`, `ends a shortened summary before a code span it cuts off`, `Render And Export Adapters`
- On conflict: Keep the test asserting that HTML inside backticks stays
  escaped.

### README screenshots

- Files: `assets/readme/hero.png`, `assets/readme/receipt.png`,
  `assets/readme/changelog.png`
- Changed: recaptured with the settings in CONTRIBUTING.md, dark and at a
  device scale factor of 2, then framed with rounded corners and a hairline
  border. The palette screenshot shows titles only and is unchanged.
- Anchor: the screenshot table in CONTRIBUTING.md
- On conflict: Keep one still image per visual.

## Behavior And UX Impact

Commands, paths, and keys in summaries, invariants, verification, and release
notes read as code in the internal reader, in chunked record details, and in
the public changelog, instead of showing backticks. Search results, filters,
and the palette are unchanged.

## Invariants

- Record text is escaped before code spans are built, so a record can never
  add markup through a code span.
- A code span closes only on a backtick run of the same length on the same
  line, and an unpaired backtick in full text stays literal.
- A shortened summary never ends inside a code span.
- Search documents and `data-search` keep plain text.
- The static reader remains a single offline HTML file.

## Verification

- `npx vitest run test/render.test.ts test/readerRuntime.test.ts`
- `npm run typecheck`
- The regenerated terminal cards were byte-identical, the billing demo reader
  rendered its code spans, and the three recaptured screenshots were checked
  by eye.
- `npm run ci`

## Notes

Resolves product note 0136. Record titles still render as plain text. The
browser runtime needed no change: record details, inline or chunked, are HTML
built by `recordDetail`, and the runtime writes only titles, ids, and counts
as text.
