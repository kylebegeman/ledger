---
id: "0101"
kind: "change"
title: "Reload the reader from the engine event stream"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "reader"
  - "server"
files:
  - "src/renderAssets.ts"
  - "test/engine.test.ts"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "staticReaderRuntime"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture engine section describes the reader's live reload behavior and its fallbacks; the README mentions that the served reader reloads itself."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0099"
release: "v0.5.0"
---

# 0101: Reload The Reader From The Engine Event Stream

## Summary

The reader runtime now opens an `EventSource` on `/events` whenever the page
is served over HTTP, announces `rebuilt` events in the live status region, and
reloads the page 150 ms later so filters, pagination, and the open record in
the URL survive. A `rebuild-failed` event leaves the last good render in place
with a status message. From a `file:` URL the client is never created, and
under a plain static server the 404 on `/events` closes the source without
retrying.

## Why

The August audit's finding H and the brainstorm's quick win both named watch
mode that rebuilt without telling the browser. The engine (0099) already
broadcasts `rebuilt`; this closes the loop so editing a record while
`ledger serve --api` runs shows up without a manual refresh.

## Changed Files

### Reader runtime

- File: `src/renderAssets.ts`
- Changed: live reload block appended to `staticReaderRuntime`.
- Anchor: `new EventSource("events")`
- On conflict: Keep the protocol check and the relative `events` URL so the
  same bundle works from `file:`, a static server, and the engine.

### Tests and docs

- Files: `test/engine.test.ts`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: the engine test asserts the served page carries the client; docs
  describe the behavior and fallbacks.
- On conflict: The content security policy's `connect-src 'self'` must keep
  allowing the stream.

## Behavior And UX Impact

A reader served by `ledger serve --api` refreshes itself after each rebuild
and keeps its URL state. Static and offline use are unchanged.

## Invariants

- The reader never opens an event stream from a `file:` URL.
- A failed rebuild never replaces the last good render in the browser.

## Verification

- `npm test` (engine and render suites)
- `npm run ci`

## Notes

Milestone three of 0.5. Next: MCP resources and prompts.
