---
id: "0150"
kind: "change"
title: "Scan code spans linearly and share the record row markup"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "docs"
files:
  - "src/renderHtml.ts"
  - "src/render.ts"
  - "src/reader/styles.css"
  - "test/render.test.ts"
  - "docs/ARCHITECTURE.md"
  - "scripts/readme-assets.mjs"
symbols:
  - "scanProseLine"
  - "withoutOpenCodeSpan"
  - "compactSection"
  - "recordTags"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's reader section says a summary that is one code span keeps its text and that the agent packet digest keeps its backticks on purpose."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0146"
  - "0137"
release: "v0.8.1"
---

# 0150: Scan Code Spans Linearly And Share The Record Row Markup

## Summary

The renderer finds Markdown code spans with a one-pass scanner over backtick
runs instead of a lookaround regex, which was quadratic on unpaired runs of
increasing length. A shortened summary that is entirely one code span keeps
its text instead of becoming "...", and `why`, which only feeds search, is
shortened with a plain cut so it keeps every character it can. The inline
code chip carries a hairline outline so it reads as a chip on the light
canvas, where its fill had a 1.07:1 contrast against the page. The record
row and the record panel now build their badges, status, summary, and chips
through four shared helpers, so a prose change lands in both at once. The
README asset script refuses to run without a build, reports where it kept
the demo repositories even when a card fails, and drops an unused width
parameter.

## Why

The 0.8.0 audit measured the regex at 406 ms on a 336 KB bullet of unpaired
runs, found a 402-character single-span summary that rendered as "...", and
computed the light-theme chip contrast. The row and panel duplicated the
same markup, which is why 0146 had to apply inline code twice. A byte
comparison of this repository's rendered reader before and after the
refactor showed no markup change: only the new CSS declaration and three
`why` excerpts that now keep a few more words of search text.

## Changed Files

### Renderer

- Files: `src/renderHtml.ts`, `src/render.ts`, `src/reader/styles.css`
- Changed: `scanProseLine` collects backtick runs, pairs each with the next
  run of the same length, and returns literal and code segments plus the
  offset of the first run with no closer; `inlineCodeHtml` and
  `withoutOpenCodeSpan` are built on it, and the latter keeps the text when
  the cut would leave nothing. `compactSection` takes a `codeSpans` option
  that only the summary sets. `recordBadges`, `recordStatus`,
  `recordSummary`, and `recordTags` render the shared row pieces. The
  `.inline-code` rule gains an inset hairline in `--line`.
- Anchor: `scanProseLine`, `withoutOpenCodeSpan`, `compactSection`, `recordTags`, `inline-code`
- On conflict: Keep the scanner linear in the number of backtick runs, and
  keep the row and panel on the shared helpers.

### Tests and docs

- Files: `test/render.test.ts`, `docs/ARCHITECTURE.md`
- Changed: cases for a summary that is one long span, a `why` excerpt that
  keeps words a span cut would drop, and a 2000-run bullet that renders
  literally within a second; the architecture doc states the whole-span rule
  and why the agent packet digest keeps its backticks.
- Anchor: `keeps a shortened summary that is one long code span, and shortens why without the rule`, `renders unpaired backtick runs literally in linear time`
- On conflict: Keep the pathological-input case; it is the regression test
  for the scanner.

### README asset script

- Files: `scripts/readme-assets.mjs`
- Changed: exits with a message when `dist/cli.js` is missing, prints the
  kept demo path from `finally`, and renders every card at `CARD_WIDTH`.
- Anchor: `CARD_WIDTH`, `renderCard`
- On conflict: Regenerated cards must stay byte-identical when nothing the
  cards show has changed.

## Behavior And UX Impact

Inline code chips are visible in the light theme. A long single-span summary
shows its text with a literal backtick instead of disappearing. Search over
`why` text matches a few more words. Rendering a record with a pathological
bullet costs milliseconds instead of hundreds of them.

## Invariants

- Code span matching is linear in the number of backtick runs.
- A shortened summary is never empty when the section has text.
- The list row and the record panel render badges, status, summary, and chips
  through the same helpers.
- Regenerating the README cards from an unchanged build produces identical
  files.

## Verification

- `npx vitest run test/render.test.ts test/readerRuntime.test.ts test/stale.test.ts`
- `npm run typecheck`
- A script rendered this repository's reader before and after the change and
  diffed the HTML and the detail chunks: chunks identical, rows changed only
  in three `why` excerpts, plus the new CSS declaration.
- `node scripts/readme-assets.mjs` regenerated byte-identical cards, and
  running it with `dist/cli.js` moved aside printed the build message.
- `npm run ci`

## Notes

Found by the 0.8.0 audit. Titles still render as plain text.
