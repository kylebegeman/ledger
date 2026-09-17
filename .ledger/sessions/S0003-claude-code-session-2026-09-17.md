---
id: "S0003"
kind: "session"
title: "Claude Code session 2026-09-17"
date: "2026-09-17"
updated: "2026-09-17"
status: "active"
expires: "2026-09-24"
areas:
  - "docs"
  - "reader"
  - "render"
  - "renderhtml"
  - "stale"
  - "tests"
files:
  - "src/renderHtml.ts"
  - "test/render.test.ts"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "src/stale.ts"
  - "test/stale.test.ts"
  - "docs/SCHEMA.md"
  - "src/render.ts"
  - "test/readerRuntime.test.ts"
  - "src/reader/runtime.ts"
  - "test/sessions.test.ts"
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
related:
  - "0141"
  - "0146"
  - "0147"
  - "0148"
---

# S0003: Claude Code session 2026-09-17

## Summary

Resumed S0002 after its usage limit. Finished inline code in the reader
(0146), including double-backtick spans and shortened summaries, and
recaptured the three README screenshots that showed literal backticks. Fixed
`ledger stale` and `ledger doctor` failing on a receipt that lists a PNG
(0147), and folded 0142 to 0147 into the v0.8.0 release record, receipt
0141, and the handoff. Then merged #20, stopped the reader from logging
skipped view transitions as unhandled rejections (0148) on branch
`reader-transition-abort`, and added that fix to v0.8.0.

## Learned

- `serve` without `--watch` renders once at startup, so a capture server has
  to restart after records change. Servers left by another session can hold
  ports 4173 and 4174.
- Receipts join an existing release record through
  `release <version> --include-unreleased --assign` without `--write`,
  followed by a hand edit of the record.
- In a hidden Chromium tab, `startViewTransition` still runs the update, and
  only `ready` rejects with `InvalidStateError`; `finished` rejects only when
  the update throws.
- The Claude Code auto-mode permission check refused `gh pr merge` for #20 as
  a merge without review, even after Kyle said to merge it.

## Next

- Tag v0.8.0 once the transition fix merges, then record the publish.
- Bump Kore's pin and run the second live Kore session that closes B010.
