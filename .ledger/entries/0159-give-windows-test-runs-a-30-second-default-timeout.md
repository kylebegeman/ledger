---
id: "0159"
kind: "change"
title: "Give Windows test runs a 30 second default timeout"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "tests"
  - "ci"
files:
  - "vitest.config.ts"
  - "docs/HANDOFF.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff's Windows CI lessons name the platform timeout in vitest.config.ts."
  docs:
    - "docs/HANDOFF.md"
commits: []
related:
  - "0142"
  - "0151"
release: "v0.8.2"
---

# 0159: Give Windows Test Runs A 30 Second Default Timeout

## Summary

A new `vitest.config.ts` sets the test timeout to 30 seconds on Windows and
keeps the 5 second default elsewhere. Git-heavy and transaction-heavy tests
no longer fail on a slow Windows runner, and a slow test still shows up on
macOS and Linux.

## Why

The CI run for pull request #23, which changed only records, failed on the
Windows Node 24 runner: `checkCoverage > treats coverage from records
outside the change set as historical under current mode` took 5315 ms and
`ledger verify > ages evidence out and rejects a corrupt sidecar` took
6279 ms against the 5000 ms default. In the same run the Windows Node 22 job
finished its slowest test in 5.4 s while Node 24 needed 10.4 s, so the
runner's speed, not the tests, decides these failures. Adding per-test
timeouts again, as 0142 did for the session record suite, only moves the
next failure to another test; a platform default ends it.

## Changed Files

### Test configuration

- Files: `vitest.config.ts`, `docs/HANDOFF.md`
- Changed: `testTimeout` is 30000 on `win32` and 5000 elsewhere; the
  handoff's Windows CI lessons say so.
- Anchor: `testTimeout`, `Windows CI lessons`
- On conflict: Keep the default on macOS and Linux so slow tests stay
  visible there.

## Behavior And UX Impact

None for users. Windows CI stops failing on runner speed.

## Invariants

- Tests on Windows have at least 30 seconds each.
- Tests on macOS and Linux keep the 5 second default unless they set their
  own timeout.

## Verification

- `npx vitest run test/draftLimits.test.ts test/coverage.test.ts test/verify.test.ts`
  loaded the config and passed.
- The Windows jobs of pull request #23 after this change.
- `npm run ci`

## Notes

The two failing tests were unrelated to the records-only change in #23.
