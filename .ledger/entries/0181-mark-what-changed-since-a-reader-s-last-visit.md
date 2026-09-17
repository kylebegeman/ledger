---
id: "0181"
kind: "change"
title: "Mark what changed since a reader's last visit"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "render"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
  - "test/render.test.ts"
symbols:
  - "trackVisit"
  - "markChangedEntries"
  - "renderVisitNote"
  - "contentHash"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes visit tracking, and the README says both profiles mark changes since the last visit."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
decisions:
  - "D005"
related:
  - "0180"
  - "B002"
release: "v0.9.2"
---

# 0181: Mark what changed since a reader's last visit

## Summary

Both reader profiles now mark what is new or changed since the viewer's last
visit.

- **Markers.** A changed record gets a New or Updated chip. A note under the
  result count shows how many records changed, filters the list to them (the
  `changed` URL parameter), and offers Mark all as seen.
- **What counts as a visit.** A load more than 30 minutes after the last one
  starts a new visit. A reload within that gap keeps comparing with the same
  earlier visit, so the markers survive live reload. A first visit only
  records a baseline.
- **Where it lives.** Each entry carries `data-hash`, a 12-digit hash of what
  the reader shows for it. The runtime keeps the hashes it saw in
  `localStorage`, keyed by project and profile. Nothing leaves the browser,
  and without storage the page renders normally and marks nothing.

## Why

Decision D005's reader track asked for a "since you last looked" view (E6).
Readers of the internal reader and the public changelog had no way to see
what changed without comparing by memory.

Rejected:

- **Server-side read state in the engine.** The reader is also a static file
  on any host. A per-viewer preference belongs in the viewer's browser.
- **Marking everything on a first visit.** Every record would be flagged, and
  the flags would say nothing.

## Changed Files

### Reader runtime and styles

- Files: `src/reader/runtime.ts`, `src/reader/styles.css`
- Changed:
  - `trackVisit` reads and writes the visit state and computes the changes.
    `markChangedEntries` adds the chips, and `renderVisitNote` shows the
    count.
  - The changed-only filter works with the URL, the reset action, and the
    active-filter count. Mark all as seen stores the current hashes as the
    earlier visit.
  - Every storage call is guarded, and stored state is validated before use.
  - The styles cover the note, its pressed toggle, and the New chip tone.
- Anchor: `trackVisit`, `markChangedEntries`, `renderVisitNote`,
  `visitGapMs`
- On conflict: Keep read state in the browser, and keep a first visit
  unmarked.

### Rendering

- Files: `src/renderHtml.ts`
- Changed:
  - Entries in both profiles carry `data-hash`. The internal hash covers the
    source record; the public hash covers the title, date, and Public Notes.
  - The body carries `data-reader-key`, and the library toolbar holds the
    hidden note.
- Anchor: `contentHash`, `visitNote`
- On conflict: The public hash must cover only what the public page shows.

### Tests and docs

- Files: `test/readerRuntime.test.ts`, `test/render.test.ts`,
  `docs/ARCHITECTURE.md`, `README.md`
- Changed:
  - New browser tests cover:
    - a first-visit baseline
    - markers after a gap, the filter, and a reload within the visit
    - Mark all as seen
    - a new visit forgetting old changes
    - unreadable state, and storage that throws
  - The test mount now copies the body's attributes, and every test clears
    storage.
  - A render test covers the hashes, the key, and the note in both
    profiles.
  - The architecture doc and the README describe the markers.
- Anchor: `changes since the last visit`
- On conflict: Keep the storage failure test.

## Behavior And UX Impact

- On a return visit, changed records carry a chip, and a note offers to show
  only them or to mark them seen.
- Each entry adds about 25 bytes to the page for its hash.

## Invariants

- Read state never leaves the viewer's browser.
- A missing, full, or blocked storage never breaks the page.
- A first visit marks nothing.
- The public hash covers only public content.

## Verification

- `npx vitest run test/render.test.ts test/readerRuntime.test.ts`
- `npm run typecheck`
- `npm run ci`
- In a browser, against this repository's reader served over HTTP:
  - An older visit state marked 0180 and 0179 as new, and 0178 and v0.9.1
    as updated.
  - The filter showed those 4 records, and Mark all as seen cleared them.
  - The public changelog marked v0.9.1 as new.

## Notes

The Summary excerpts in reader rows showed raw list markers and bold markers from receipts that use them; the next change renders those excerpts as plain text.
