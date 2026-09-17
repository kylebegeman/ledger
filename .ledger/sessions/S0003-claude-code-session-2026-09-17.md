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
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
related:
  - "0141"
  - "0146"
  - "0147"
---

# S0003: Claude Code session 2026-09-17

## Summary

Resumed S0002 after its usage limit. Finished inline code in the reader
(0146), including double-backtick spans and shortened summaries, and
recaptured the three README screenshots that showed literal backticks. Fixed
`ledger stale` and `ledger doctor` failing on a receipt that lists a PNG
(0147), and folded 0142 to 0147 into the v0.8.0 release record, receipt
0141, and the handoff.

## Learned

- `serve` without `--watch` renders once at startup, so a capture server has
  to restart after records change. Servers left by another session can hold
  ports 4173 and 4174.
- Receipts join an existing release record through
  `release <version> --include-unreleased --assign` without `--write`,
  followed by a hand edit of the record.
- In a hidden browser tab, every reader load logs an aborted view transition
  as an unhandled rejection.

## Next

- Kyle merges #20 and pushes the v0.8.0 tag; then bump Kore's pin and run the
  second live Kore session that closes B010.
- Handle aborted view transitions in `src/reader/runtime.ts`.
