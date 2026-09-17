---
id: "S0006"
kind: "session"
title: "Ledger 0.9.3: Codex hooks that keep their approval"
date: "2026-09-17"
updated: "2026-09-17"
status: "closed"
expires: "2026-09-24"
areas:
  - "hooks"
files:
  - "src/hooks.ts"
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
---

# S0006: Ledger 0.9.3: Codex hooks that keep their approval

## Summary

This session continued after a context compaction. Kyle trusted Kore's
changed Codex hooks by hand and asked whether that step could be
streamlined. He then chose to build the fix as 0.9.3 and move Kore to it:

- 0189: `hooks install --host codex --launcher` and the generated
  `.ledger/bin/ledger.mjs`, so a version bump leaves `.codex/hooks.json`
  unchanged
- 0190: the doctor symbols advice from product note 0187
- 0191: the 0.9.3 release preparation
- 0192: the publish from kylebegeman/ledger#33, a smoke run of the published
  package, and Kore's move in kylebegeman/forge#33 (Kore receipt 0011)

## Learned

- Codex approves a hook by a hash of its definition. The hash covers the
  event, the matcher, and handler fields such as the command and timeout,
  not the script a command runs. A command that names no version therefore
  keeps its approval.
- Codex runs hooks with `$SHELL -lc`, or `cmd.exe /C` on Windows, from the
  session's working directory. Project hooks get no variable naming the
  project root, so a relative launcher path needs a session started at the
  root.
- Another session can hold Kore's checkout on its own branch with
  uncommitted work. A worktree from `origin/main` lets a Ledger bump proceed
  without touching it.

## Next

- Kyle approves Kore's six Codex hooks once more on the Hooks page of the
  Codex app's settings. A live `codex exec` session in Kore needs his
  go-ahead first.
