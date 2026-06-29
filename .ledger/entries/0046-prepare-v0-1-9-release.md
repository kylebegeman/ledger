---
id: "0046"
kind: "change"
title: "Prepare v0.1.9 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0045-smarter-diff-drafting.md"
  - ".ledger/entries/0046-prepare-v0-1-9-release.md"
  - ".ledger/releases/v0.1.9.md"
symbols:
  - "v0.1.9"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
release: "v0.1.9"
---

# 0046: Prepare v0.1.9 Release

## Summary

Bumps Ledger to `0.1.9`, assigns the smarter drafting work to the release, and
generates the release record.

## Why

The smarter drafting improvements are the requested final slice and should ship
as their own patch release after the release workflow polish.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.9`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.9` tag.

### .ledger/entries/0045-smarter-diff-drafting.md and .ledger/entries/0046-prepare-v0-1-9-release.md

- What changed: Records commit and release metadata for the drafting patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.9` assignment for the drafting slice.

### .ledger/releases/v0.1.9.md

- What changed: Adds the generated release document for `v0.1.9`.
- Anchor: `v0.1.9`
- On conflict: Regenerate with `ledger release v0.1.9 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get smarter `ledger new --from-diff` draft entries in a dedicated patch
release.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the requested smarter drafting work.
