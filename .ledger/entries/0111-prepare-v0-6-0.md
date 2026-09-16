---
id: "0111"
kind: "change"
title: "Prepare v0.6.0"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B007-capture-hooks-skills-and-authoring.md"
docs:
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The roadmap marks Phase 11 capture as shipped in 0.6.0 with Kore adoption as the open acceptance check; the handoff records the new state, how capture works in this repository, the publish step, and the next slices."
  docs:
    - "docs/ROADMAP.md"
    - "docs/HANDOFF.md"
decisions:
  - "D005"
commits: []
backlog:
  - "B007"
related:
  - "0106"
  - "0107"
  - "0108"
  - "0109"
  - "0110"
release: "v0.6.0"
---

# 0111: Prepare v0.6.0

## Summary

Bumps the package to 0.6.0, marks Phase 11 capture as shipped in the roadmap,
rewrites the handoff for the next session, and records in backlog B007 which
receipts promoted each part of the slice. The v0.6.0 release record groups
receipts 0106 through 0111 and carries Public Notes for the GitHub Release.

## Why

Five capture milestones landed on the `capture-0.6` branch: authoring
commands, session records, the `ready` gate, host hooks, and the skill with
the managed `AGENTS.md` block. The release record and version bump make the
slice publishable through the existing tag-driven workflow, and the handoff
keeps the publish step and the Kore adoption check explicit so the next
session does not have to rediscover them.

## Changed Files

### Version

- Files: `package.json`, `package-lock.json`
- Changed: version 0.6.0.
- Anchor: `version`
- On conflict: The tag must match the package version or the release workflow
  fails its version check.

### Docs and backlog

- Files: `docs/ROADMAP.md`, `docs/HANDOFF.md`,
  `.ledger/backlog/B007-capture-hooks-skills-and-authoring.md`
- Changed: Phase 11 status and sequencing note; the handoff's state, capture
  conventions, open threads, next slices, and verification block; B007's
  promotion notes.
- Anchor: `Phase 11: Local Memory Engine`
- On conflict: Keep the handoff as the resume point; retire sections that
  stop being true rather than appending history.

## Behavior And UX Impact

`ledger version` prints 0.6.0. No runtime behavior changes in this receipt.

## Invariants

- The release record lists every unreleased landed entry at the time of the
  release.
- The handoff names the exact publish command for the pending tag.

## Verification

- `node dist/cli.js version`
- `node dist/cli.js release v0.6.0 --include-unreleased --assign --status released --date 2026-09-16 --write`
- `node dist/cli.js unreleased` (empty afterwards)
- `npm run ci`

## Notes

Release six of the Phase 11 sequence. The tag is applied on `master` after
the pull request merges.
