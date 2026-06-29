---
id: "0042"
kind: "change"
title: "Prepare v0.1.7 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0041-static-reader-facets.md"
  - ".ledger/entries/0042-prepare-v0-1-7-release.md"
  - ".ledger/releases/v0.1.7.md"
symbols:
  - "v0.1.7"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
release: "v0.1.7"
---

# 0042: Prepare v0.1.7 Release

## Summary

Bumps Ledger to `0.1.7`, assigns the static reader polish work to the release,
and generates the release record.

## Why

The static reader improvements are the third requested patch slice and should
ship separately from docs-plane and integrity work.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.7`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.7` tag.

### .ledger/entries/0041-static-reader-facets.md and .ledger/entries/0042-prepare-v0-1-7-release.md

- What changed: Records commit and release metadata for the static reader patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.7` assignment for the static reader slice.

### .ledger/releases/v0.1.7.md

- What changed: Adds the generated release document for `v0.1.7`.
- Anchor: `v0.1.7`
- On conflict: Regenerate with `ledger release v0.1.7 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get a more useful static reader with facets and relationship context.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the requested static reader polish work.
