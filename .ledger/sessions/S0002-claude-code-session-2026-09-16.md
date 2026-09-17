---
id: "S0002"
kind: "session"
title: "Claude Code session 2026-09-16"
date: "2026-09-16"
updated: "2026-09-17"
status: "closed"
expires: "2026-09-23"
areas:
  - "assets"
  - "docs"
  - "hooks"
  - "operations"
  - "reader"
  - "readme"
  - "scripts"
  - "sessions"
  - "tests"
  - "toolchain"
  - "types"
  - "workspace"
files:
  - "src/workspace.ts"
  - "src/operations/definitions/records.ts"
  - "src/operations/definitions/docs.ts"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "test/workspace.test.ts"
  - "test/operations.test.ts"
  - "src/types.ts"
  - "src/hooks.ts"
  - "src/sessions.ts"
  - "test/sessions.test.ts"
  - "src/toolchain.ts"
  - "test/toolchain.test.ts"
  - "assets/ledger.svg"
  - "src/reader/styles.css"
  - "package.json"
  - "scripts/readme-assets.mjs"
  - "CONTRIBUTING.md"
  - "src/operations/definitions/server.ts"
  - "docs/HANDOFF.md"
host: "claude-code"
hostSession: "6cf5fed7-a387-4a27-bb1a-125e18d27bfd"
related:
  - "0131"
  - "0132"
  - "0133"
  - "0134"
  - "0135"
  - "0137"
  - "0141"
  - "0142"
  - "0143"
  - "0144"
  - "0145"
---

# S0002: Claude Code session 2026-09-16

## Summary

Built Ledger 0.8.0 on `adoption-0.8`: the five B010 milestones (0131 to
0135), the README overhaul and emerald mark (0137), and release prep (0141)
in pull request #20. Then fixed what checking the README against the code
found (0142 to 0145), and hit the usage limit while finishing inline code in
the reader (0136), which S0003 completed.

## Learned

- The Stop hook drafted a duplicate of a receipt already written with
  `ledger new`; 0142 counts receipts new or modified in the working tree.
- Kyle rejected a choppy animation of a cursor picking viewport sizes. No
  README image is animated, so it was most likely the visible browser running
  the scripted captures; README visuals stay still images.
- Kyle left the `coverage: any` docs impact decision to the assistant, which
  chose to relax docs impact under `any` (0144).

## Next

- Merge #20, tag v0.8.0, then bump Kore's pin and run the second live Kore
  session that closes B010.
