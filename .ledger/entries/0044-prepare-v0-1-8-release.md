---
id: "0044"
kind: "change"
title: "Prepare v0.1.8 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0043-release-assignment-workflow.md"
  - ".ledger/entries/0044-prepare-v0-1-8-release.md"
  - ".ledger/releases/v0.1.8.md"
symbols:
  - "v0.1.8"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
release: "v0.1.8"
---

# 0044: Prepare v0.1.8 Release

## Summary

Bumps Ledger to `0.1.8`, assigns the release assignment workflow to the release,
and generates the release record.

## Why

The release assignment workflow is the requested release workflow polish slice
and should ship separately from the smarter drafting work.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.8`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.8` tag.

### .ledger/entries/0043-release-assignment-workflow.md and .ledger/entries/0044-prepare-v0-1-8-release.md

- What changed: Records commit and release metadata for the release workflow
  patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.8` assignment for the release workflow slice.

### .ledger/releases/v0.1.8.md

- What changed: Adds the generated release document for `v0.1.8`.
- Anchor: `v0.1.8`
- On conflict: Regenerate with `ledger release v0.1.8 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get `ledger release --assign` and the README now makes Ledger's
agent-first focus explicit.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the requested release workflow polish work.
