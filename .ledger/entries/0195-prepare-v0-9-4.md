---
id: "0195"
kind: "change"
title: "Prepare v0.9.4"
date: "2026-09-19"
updated: "2026-09-19"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.9.4.md"
  - "docs/HANDOFF.md"
  - "README.md"
  - "assets/readme/adopt.svg"
docs:
  - "docs/HANDOFF.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the prepared release and what follows it, and the README's pinned npx commands, action version, and adopt card move to the new version."
  docs:
    - "docs/HANDOFF.md"
    - "README.md"
commits: []
related:
  - "0192"
  - "0193"
  - "0194"
release: "v0.9.4"
---

# 0195: Prepare v0.9.4

## Summary

Bumps the package to 0.9.4 and writes the v0.9.4 release record over receipts
0192 through 0194 and this one, with Public Notes for the GitHub Release. The
release carries the two stale fixes found while triaging Kore's report:
coverage patterns are searched rather than dropped, and directory headings and
path anchors resolve before anything is called drift. The handoff records the
state, the cost of the new search, and the Kore follow-up.

## Why

Kore's stale report showed 169 signals, 156 of them false, because
`ledger stale` judged symbols and anchors against an unrepresentative subset of
a record's references. Adopters see the fix only once it publishes and their
pin moves, so the slice is prepared for the tag-driven workflow.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.4.md`
- Changed: version 0.9.4; the release record with a summary, Public Notes, and
  every receipt landed since v0.9.3.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version or the release workflow
  fails its version check.

### Pinned version in the README

- Files: `README.md`, `assets/readme/adopt.svg`
- Changed: the quick start's pinned `npx` commands, the global install line,
  the action reference, and the version the adopt card shows, which
  `scripts/readme-assets.mjs` takes from `package.json`.
- Anchor: `In any other repository`
- On conflict: The README's pinned version and the card must match
  `package.json`, which the `readme:check` job enforces.

### Handoff

- Files: `docs/HANDOFF.md`
- Changed: the prepared release, what the stale fix means for a repository
  whose receipts use patterns, the cost of the pattern search on a large tree,
  and the Kore pin bump and fourteen-signal cleanup that follow the publish.
- Anchor: `Where the product stands`
- On conflict: Keep the handoff as the resume point; retire sections that stop
  being true rather than appending history.

## Behavior And UX Impact

`ledger version` prints 0.9.4. No runtime behavior changes in this receipt.

## Invariants

- The release record lists every unreleased landed change entry at the time of
  the release.
- The handoff names the exact publish command for the pending tag.

## Verification

- `node dist/cli.js version`
- `node dist/cli.js release v0.9.4 --include-unreleased --assign --status released --write`
- `node dist/cli.js unreleased` (empty afterwards)
- `npm run ci`

## Notes

Release four of the 0.9 line. The tag is applied on `master` after the pull
request merges.

The triage that produced 0193 and 0194 found no fault in Kore's records. Its
169 stale signals were this checker reading pattern, directory, and path
references as absence, and its feature receipts 0046 to 0060, which carried
most of the false signals, are sound, so `ledger packet` on those paths stays
trustworthy. Kore's own session owns moving its pin to 0.9.4 and clearing the
14 signals that remain there; Ledger's part is to publish and send the
version.
