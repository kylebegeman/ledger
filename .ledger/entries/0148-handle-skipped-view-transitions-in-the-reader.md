---
id: "0148"
kind: "change"
title: "Handle skipped view transitions in the reader"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
files:
  - "src/reader/runtime.ts"
  - "test/readerRuntime.test.ts"
  - "docs/ARCHITECTURE.md"
symbols:
  - "runTransition"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's reader motion sentence says a transition the browser skips still applies the update and its rejected ready promise is handled."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0083"
  - "0119"
release: "v0.8.0"
---

# 0148: Handle Skipped View Transitions In The Reader

## Summary

The reader runtime now handles the `ready` promise of every view transition
it starts. When the browser skips the animation, as it does in a hidden tab
or when a newer transition starts, `ready` rejects while the update still
runs, and the reader no longer logs an unhandled `InvalidStateError` on each
load and filter change. The watchdog, the reduced-motion path, and the
`viewTransitionName` cleanup are unchanged.

## Why

Loading the reader in a hidden browser pane logged "Transition was aborted
because of invalid state" as an uncaught promise rejection once per
transition. A probe in the same hidden Chromium pane showed that only
`ready` rejects: the update runs, and `finished` and `updateCallbackDone`
resolve. When the update itself throws, `finished` rejects with that error,
so `finished` is left unhandled on purpose to keep real update failures
visible. Skipping `startViewTransition` in hidden documents was rejected
because it would not cover transitions skipped for other reasons, such as a
newer transition starting.

## Changed Files

### Reader runtime

- Files: `src/reader/runtime.ts`
- Changed: `ViewTransitionLike` declares `ready`, and `runTransition`
  attaches a no-op rejection handler to it before arming the watchdog.
- Anchor: `ViewTransitionLike`, `runTransition`, `transitionWatchdogMs`
- On conflict: Handle only `ready`; an update that throws must still surface
  through `finished`.

### Tests and docs

- Files: `test/readerRuntime.test.ts`, `docs/ARCHITECTURE.md`
- Changed: a happy-dom test stubs `document.startViewTransition` with a
  transition whose `ready` rejects, changes a filter, and expects the list
  updated with no unhandled rejection; the architecture doc's reader motion
  sentence describes the skip.
- Anchor: `still updates the list when the browser skips a view transition`, `Render And Export Adapters`
- On conflict: Keep the stub's shape matching what a hidden Chromium tab
  reports: `ready` rejects, `finished` resolves.

## Behavior And UX Impact

Readers open in background tabs, and readers whose filters change while a
transition runs, stop filling the console with `InvalidStateError` messages.
Visible behavior is unchanged.

## Invariants

- A transition the browser skips still applies the update.
- `runTransition` never leaves `ready` without a rejection handler.
- An error thrown by the update still rejects `finished` without a handler.

## Verification

- `npm run build:reader`, then
  `npx vitest run test/readerRuntime.test.ts test/render.test.ts`; the new
  test failed against the bundle from before the fix with one unhandled
  `InvalidStateError` and passes after it.
- `npm run typecheck`
- In a hidden browser pane, filter changes logged the error with the old
  runtime and nothing with the rebuilt reader.
- `npm run ci`

## Notes

Found while checking the recaptured README screenshots for receipt 0146.
