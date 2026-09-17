---
id: "S0005"
kind: "session"
title: "Ledger 0.9.2: complete records, symbols for four languages, and the reader and publishing pillar"
date: "2026-09-17"
updated: "2026-09-17"
status: "closed"
expires: "2026-09-24"
areas:
  - "release"
  - "authoring"
  - "symbols"
  - "reader"
  - "publishing"
  - "docs"
files:
  - "src/sections.ts"
  - "test/recordBodies.test.ts"
  - "src/context.ts"
  - "test/context.test.ts"
  - "src/symbolOutlines.ts"
  - "test/symbolOutlines.test.ts"
  - "src/doctor.ts"
  - "src/stale.ts"
  - "src/symbols.ts"
  - "test/doctor.test.ts"
  - "test/stale.test.ts"
  - "src/pathPatterns.ts"
  - "src/renderFeed.ts"
  - "docs/PUBLISHING.md"
  - "src/operations/reference.ts"
  - "test/commandReference.test.ts"
  - "scripts/readme-screenshots.mjs"
  - "scripts/check-dossier-tokens.mjs"
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
related:
  - "0176"
  - "0177"
  - "0178"
  - "0179"
  - "0180"
  - "0181"
  - "0182"
  - "0183"
  - "0184"
  - "0185"
  - "0186"
---

# S0005: Ledger 0.9.2: complete records, symbols for four languages, and the reader and publishing pillar

## Summary

Kyle asked for everything left on the 0.9.x list in one patch release. This
session built 0.9.2 on `release-0.9.2`, one milestone per commit:

- record bodies from every surface, and `ledger update` (0176)
- `ledger context` (0177)
- `doctor --fix` and the hooks check (0178)
- Go, Rust, Python, and Swift symbols (0179)
- reader entity views and copy actions (0180)
- changed-since-last-visit markers (0181), and plain-prose excerpts (0182)
- the publishable public changelog (0183)
- the generated command reference (0184)
- the screenshot and token scripts (0185)
- the release preparation (0186)

## Learned

- Checking outlines against real parsers (`go/parser`, Python's `ast`, `syn`,
  and `swiftc -dump-parse` with `#if` lines blanked) found about 15 bugs that
  the fixtures missed.
- Browsers run a view transition's update after `startViewTransition`
  returns. happy-dom runs it at once, so code after a filter pass must await
  the update; a test now defers it.
- Rendering the reference lists into every detail panel doubled this
  repository's detail chunks. Building them from inline entry data in the
  runtime cut the chunks by a quarter instead.
- `ledger update` list flags replace the whole list. Adding one file to a
  receipt that way dropped the rest until the full list was passed again.
- `npx playwright install` removes browser builds that no installed
  Playwright references.
- The reader's palette selected text typed while its index loaded; the
  scripted screenshot showed it.

## Next

- After the merge, tag `v0.9.2`, check npm and the GitHub Release, and move
  Kore to 0.9.2 with a Kore receipt.
- Ask Kyle before a live `codex exec` session in Kore.
