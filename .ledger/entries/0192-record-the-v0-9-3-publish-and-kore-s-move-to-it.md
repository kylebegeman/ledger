---
id: "0192"
kind: "change"
title: "Record the v0.9.3 publish and Kore's move to it"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
  - "adoption"
files:
  - ".ledger/sessions/S0006-claude-code-session-2026-09-17.md"
  - "docs/HANDOFF.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the 0.9.3 publish and Kore's move to the launcher."
  docs:
    - "docs/HANDOFF.md"
commits: []
related:
  - "0189"
  - "0191"
  - "S0006"
---

# 0192: Record the v0.9.3 publish and Kore's move to it

## Summary

This records the 0.9.3 release and Kore's move to it:

- **Published.** 0.9.3 went out from kylebegeman/ledger#33 (tag `v0.9.3`,
  npm `latest`). Its GitHub Release notes are identical to
  `ledger release notes v0.9.3`.
- **Smoke test.** The published package installed the Codex launcher in a
  scratch repository. The script printed `ledger 0.9.3` for `version`, a
  piped SessionStart payload returned the session context, and doctor passed
  the hooks and symbols checks.
- **Kore.** Kore moved to 0.9.3 in kylebegeman/forge#33 (Kore receipt 0011),
  and its Codex hooks now run the launcher. Kore's checkout was on another
  task's branch with uncommitted work, so the bump ran in a separate
  worktree from `origin/main`.
- **Handoff.** It names 0.9.3 as published and Kore on 0.9.3 with the
  launcher. It keeps one last Codex hook approval in Kore as the first next
  slice.
- **Session.** S0006 is closed with what this session did and learned.

## Why

Kyle chose to build the launcher as the next patch release, including moving
Kore to it, so the handoff and the session record have to describe the
result before the project pauses again.

## Changed Files

### Handoff and session

- Files: `docs/HANDOFF.md`,
  `.ledger/sessions/S0006-claude-code-session-2026-09-17.md`
- Changed:
  - The handoff's product state names the 0.9.3 publish, the smoke run, and
    Kore's move with the launcher and the worktree.
  - Its open threads say Kore's Codex hooks changed one last time.
  - The session record lists the work and what it taught, and it is closed.
- Anchor: `Where the product stands`, `Open threads and small debts`
- On conflict: Keep the handoff describing the paused state until work
  resumes.

## Behavior And UX Impact

None; this records the release and Kore's move.

## Invariants

- The handoff matches the published version and Kore's pin.

## Verification

- `npm view @kylebegeman/ledger@0.9.3 version` printed 0.9.3, and
  `dist-tags.latest` is 0.9.3.
- `gh release view v0.9.3` has the same notes as
  `node dist/cli.js release notes v0.9.3`.
- `npx --yes @kylebegeman/ledger@0.9.3 verify 0011 --run` passed in Kore.
- `npm run ci`

## Notes

Kyle still needs to approve Kore's six changed Codex hooks in the Codex app,
once.
