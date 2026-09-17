---
id: "0180"
kind: "change"
title: "Navigate the reader by file, symbol, and link, and copy from records"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "render"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "package.json"
  - "src/coverage.ts"
  - "src/documents.ts"
  - "src/pathPatterns.ts"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
  - "test/render.test.ts"
symbols:
  - "setEntityView"
  - "showEntity"
  - "addReferenceLists"
  - "addCopyActions"
  - "paletteEntities"
  - "referenceAttributes"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes entity views, copy actions, and the minified bundles, and the README names the new reader actions."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
decisions:
  - "D005"
related:
  - "B002"
  - "0119"
  - "0120"
  - "0146"
release: "v0.9.2"
---

# 0180: Navigate the reader by file, symbol, and link, and copy from records

## Summary

The internal reader can now follow a record to the things it names, and back.

- **Entity views.** In a record's panel, selecting a file, pattern, or
  symbol lists every record that names it. A bar above the list names the
  entity and counts the records. A path also counts the records whose
  coverage pattern covers it, and a pattern counts the records naming a path
  under it. The `file`, `symbol`, and `linked` URL parameters address these
  views, which combine with the other filters, and Back returns to the
  record.
- **Record traversal.** Relationships open the linked record by title. A new
  Referenced by list shows the records that link to the open one and can
  list them all. Ids that are missing from the reader are marked as such.
  Area and release chips in the panel set those filters.
- **Palette suggestions.** Before the ranked records, the command palette
  lists up to three files, symbols, or areas whose names contain the query.
- **Copy actions.** The panel copies the record link, the source path, the
  `ledger packet` command, and the agent-ready context. Where the Clipboard
  API is missing or refused, it copies from a selected text area.

## Why

Two items in decision D005's reader track were still open:

- **E2:** copy actions on every record.
- **E3:** entity navigation for files, symbols, areas, decisions, and
  backlog items.

Until now, a record's files and relationships were inert text, so following
one meant searching by hand.

Rejected:

- **Loading entity data from the search or graph sidecars.** A `file:` URL
  cannot fetch them, and the reader promises to work there. Entries carry
  their references inline instead.
- **Rendering the lists and backlinks into each detail panel.** On this
  repository's own reader, that grew the detail chunks from 934 KB to 1.75 MB
  and pushed the render over its 4.5 MB budget. The runtime builds the lists
  from the entry attributes, and the details are now 708 KB.

## Changed Files

### Reader runtime and styles

- Files: `src/reader/runtime.ts`, `src/reader/styles.css`
- Changed:
  - The runtime reads each entry's references once. It builds:
    - the panel's reference lists and backlinks
    - entity views, with pattern matching
    - the entity bar and the palette suggestions
    - the copy buttons
  - It keeps entity views in the URL and moves focus to what names the new
    view.
  - Offline search now also matches an entry's references.
  - The styles cover the entity bar, list buttons, chips, and copy actions.
- Anchor: `setEntityView`, `showEntity`, `addReferenceLists`,
  `addCopyActions`, `paletteEntities`
- On conflict: The runtime must keep working from a `file:` URL, so
  reference data stays inline.

### Rendering and shared path patterns

- Files: `src/renderHtml.ts`, `src/renderAssets.ts`, `src/pathPatterns.ts`,
  `src/coverage.ts`, `src/documents.ts`, `package.json`
- Changed:
  - Entries carry `data-files`, `data-symbols`, `data-docs`, and
    `data-links`, one value per line. `data-search` no longer repeats those
    values.
  - The detail panel keeps an empty `record-columns` block for the runtime.
    Its release and area chips are now buttons, and the library gains a
    hidden entity bar.
  - `matchesGlob`, `coveragePatternMatches`, `isCoveragePattern`, and
    `normalizePath` move to the Node-free `src/pathPatterns.ts`, which the
    reader bundle imports. `coverage.ts` and `documents.ts` re-export them.
  - The reader bundles now minify whitespace and syntax, which keeps names.
    The runtime is 39.5 KB and the stylesheet 30.7 KB.
  - Tests now embed the built assets, as the package does.
- Anchor: `referenceAttributes`, `normalizePath`, `build:reader`
- On conflict: Keep one path-pattern implementation for Node and the
  browser.

### Tests and docs

- Files: `test/readerRuntime.test.ts`, `test/render.test.ts`,
  `docs/ARCHITECTURE.md`, `README.md`
- Changed:
  - New browser tests cover:
    - path and pattern views, and Back
    - symbol, doc, and area views
    - relationships, backlinks, and the linked view
    - palette suggestions
    - copying, including the selection fallback
    - reference lists when a detail chunk cannot load
  - A render test covers the entry attributes and the leaner panel markup.
  - Assertions on CSS text now expect minified CSS.
  - The architecture doc describes entity views, copy actions, and the
    bundles. It also no longer claims the runtime serializes the scoring
    functions, which it has imported since 0.7.
  - The README names the new reader actions.
- Anchor: `reader entity views`
- On conflict: Keep the offline assertions.

## Behavior And UX Impact

- In the internal reader, the panel's files, symbols, and docs open entity
  views, relationships open records, and Referenced by lists backlinks. The
  panel also copies a record's link, path, packet command, or context.
- The palette offers files, symbols, and areas before records.
- On this repository, the rendered reader totals 3.43 MB, down from 3.64 MB.
  The HTML is 23 KB larger, and the detail chunks are 226 KB smaller.
- The public changelog is unchanged apart from the smaller embedded
  assets.

## Invariants

- The internal reader works from a `file:` URL: reference lists, entity
  views, and palette suggestions need no sidecar.
- Record text is inserted as text, never as markup.
- Detail HTML does not repeat an entry's references.
- The browser matches coverage patterns with the same module as Node.

## Verification

- `npx vitest run test/render.test.ts test/readerRuntime.test.ts test/coverage.test.ts`
- `npm run typecheck`
- `npm run ci`
- In a browser, against this repository's reader served over HTTP:
  - An entity view for `src/symbols.ts` listed 11 records.
  - The palette offered two symbols and a file for "outline", and Enter
    opened the file's view.
  - D007 listed 11 backlinks.
  - The copy buttons appeared.
  - At 375 px wide there was no horizontal scroll.
  - The only console errors were the `events` 404s a static server always
    returns.

## Notes

Screenshots for the README are recaptured with the 0.9.2 release.
