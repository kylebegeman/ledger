---
id: "0141"
kind: "change"
title: "Prepare v0.8.0"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md"
  - ".ledger/releases/v0.8.0.md"
  - ".ledger/config.yaml"
  - ".claude/settings.json"
  - "AGENTS.md"
  - ".agents/skills/ledger/SKILL.md"
docs:
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The roadmap marks the 0.8.0 adoption fixes as shipped and names B010's live Kore session as next; the handoff records the prepared release, the repository's six hooks and draft practice, the publish and Kore steps, and the open threads."
  docs:
    - "docs/ROADMAP.md"
    - "docs/HANDOFF.md"
decisions:
  - "D005"
commits: []
backlog:
  - "B010"
related:
  - "0128"
  - "0130"
  - "0131"
  - "0132"
  - "0133"
  - "0134"
  - "0135"
  - "0137"
  - "0138"
  - "0139"
  - "0140"
release: "v0.8.0"
---

# 0141: Prepare v0.8.0

## Summary

Bumps the package to 0.8.0 and writes the v0.8.0 release record over receipts
0128 through 0137 and this one, with Public Notes for the GitHub Release.
Reinstalls this repository's own Claude Code hooks, agents block, and skill
with 0.8.0, which saves `agents.command` and adds the prompt hook. Moves
backlog B010 to in progress with promotion notes, marks the 0.8.0 adoption
fixes in the roadmap, rewrites the handoff for the publish step and the Kore
follow-up, and acknowledges the README headings that historical receipts
anchored to before 0137 removed them.

## Why

B010's five milestones and the README overhaul landed on `adoption-0.8`. The
version bump and release record make the slice publishable through the
tag-driven workflow. This repository has to run the hooks it ships, so they
are regenerated rather than left on the 0.7 shape. B010 stays open because its
last two checks need 0.8.0 on npm.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.8.0.md`
- Changed: version 0.8.0; the release record with a summary, Public Notes,
  and every receipt landed since v0.7.0.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version or the release workflow
  fails its version check.

### This repository's hooks and instructions

- Files: `.ledger/config.yaml`, `.claude/settings.json`, `AGENTS.md`,
  `.agents/skills/ledger/SKILL.md`
- Changed: `hooks install --host claude-code --command "node dist/cli.js"`
  saved `agents.command`, widened the SessionStart matcher to include
  `clear`, and added UserPromptSubmit; `agents --write` and `skills install`
  render the saved command and prefer finishing hook drafts. Codex hooks stay
  uninstalled here.
- Anchor: `agents`, `UserPromptSubmit`
- On conflict: Keep `node dist/cli.js` as the command; `ledger` on Kyle's
  PATH is an unrelated program.

### Records and docs

- Files: `docs/ROADMAP.md`, `docs/HANDOFF.md`,
  `.ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md`,
  and 16 historical change entries from 0012 to 0070
- Changed: Phase 11 status and sequencing; the handoff's state, release
  table, decisions, repository practice, next slices, conventions, and open
  threads; B010 status and promotion notes; `staleRefs` acknowledgments for
  README headings the rewrite removed.
- Anchor: `Phase 11: Local Memory Engine`, `Promotion Notes`
- On conflict: Keep the handoff as the resume point; retire sections that stop
  being true rather than appending history.

## Behavior And UX Impact

`ledger version` prints 0.8.0. Claude Code sessions in this repository get the
one-time notice for their drafted receipt. No runtime behavior changes in this
receipt.

## Invariants

- The release record lists every unreleased landed change entry at the time of
  the release.
- The handoff names the exact publish command for the pending tag.
- This repository's hooks, agents block, and skill all run `node dist/cli.js`.

## Verification

- `node dist/cli.js version`
- `node dist/cli.js release v0.8.0 --include-unreleased --assign --status released --write`
- `node dist/cli.js unreleased` (empty afterwards)
- `node dist/cli.js hooks install --host claude-code --command "node dist/cli.js" --dry-run`
  reviewed before the install
- `node dist/cli.js stale` (82 issues before the acknowledgments, 66 after)
- `node dist/cli.js doctor`
- `npm run ci`

## Notes

Release eight of the Phase 11 sequence. The tag is applied on `master` after
the pull request merges. The release preview showed that `--assign` writes the
version into entries without `--write`; the help says so, and the handoff
lists it as a small debt.
