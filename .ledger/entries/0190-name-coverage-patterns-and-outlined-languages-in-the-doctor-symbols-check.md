---
id: "0190"
kind: "change"
title: "Name coverage patterns and outlined languages in the doctor symbols check"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "doctor"
  - "symbols"
files:
  - ".ledger/entries/0187-doctor-suggests-the-typescript-parser-where-it-cannot-help.md"
  - "docs/ARCHITECTURE.md"
  - "src/doctor.ts"
  - "test/doctor.test.ts"
symbols:
  - "symbolsCheck"
  - "listPatterns"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's doctor section describes when the symbols check reports the TypeScript parser."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0187"
  - "0163"
  - "S0006"
release: "v0.9.3"
---

# 0190: Name coverage patterns and outlined languages in the doctor symbols check

## Summary

The doctor symbols check now gives advice only for code under coverage:

- When no tracked file matches `git.requireEntryFor`, it passes, names the
  patterns, and suggests pointing them at the code receipts should cover. It
  no longer reports the TypeScript parser.
- When TypeScript or JavaScript sits beside an outlined language, the parser
  message also says which symbols come from Ledger's declaration outlines,
  and which languages are not extracted.
- The fallback warning says it covers TypeScript and JavaScript anchors, not
  all code anchors.

This resolves product note 0187.

## Why

A fresh `ledger init` in a Go repository covers `src/**`, `test/**`, and
`docs/**`. With the code elsewhere, nothing was under coverage, and the check
still told the user to install TypeScript. In Kore, which covers TypeScript and
Go, the warning did not say that the Go symbols need nothing installed.

## Changed Files

### Symbols check

- Files: `src/doctor.ts`, `test/doctor.test.ts`
- Changed:
  - `symbolsCheck` returns early when nothing is under coverage and adds the
    outlined and unsupported language notes to every message.
  - `listPatterns` shows at most five patterns.
  - A new test covers a Go file outside the default patterns, and the mixed
    TypeScript and Go test expects the outline note.
- Anchor: `symbolsCheck`, `listPatterns`
- On conflict: Advice about the TypeScript parser applies only when
  TypeScript or JavaScript is under coverage.

### Architecture doc

- Files: `docs/ARCHITECTURE.md`
- Changed: The doctor section describes when the symbols check reports the
  parser.
- Anchor: `ledger doctor`
- On conflict: Keep the description in step with `symbolsCheck`.

### Product note

- Files: `.ledger/entries/0187-doctor-suggests-the-typescript-parser-where-it-cannot-help.md`
- Changed: Marked resolved by this receipt.
- Anchor: `0187`
- On conflict: Keep the note resolved.

## Behavior And UX Impact

`ledger doctor` stops recommending TypeScript to repositories where it would
not change anything, and says where Go, Rust, Python, and Swift symbols come
from.

## Invariants

- The symbols check warns only when TypeScript or JavaScript is under coverage
  and the parser is unavailable.

## Verification

- `npx vitest run test/doctor.test.ts`
- `npm run ci`

## Notes
