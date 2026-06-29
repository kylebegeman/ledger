---
id: "0040"
kind: "change"
title: "Prepare v0.1.6 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0039-integrity-provenance-report.md"
  - ".ledger/entries/0040-prepare-v0-1-6-release.md"
  - ".ledger/releases/v0.1.6.md"
symbols:
  - "v0.1.6"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits:
  - "6b0c8a2"
release: "v0.1.6"
---

# 0040: Prepare v0.1.6 Release

## Summary

Bumps Ledger to `0.1.6`, assigns the integrity provenance work to the release,
and generates the release record.

## Why

The integrity command is a distinct patch release and should be promoted before
the static reader polish work begins.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.6`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.6` tag.

### .ledger/entries/0039-integrity-provenance-report.md and .ledger/entries/0040-prepare-v0-1-6-release.md

- What changed: Records commit and release metadata for the integrity patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.6` assignment for the integrity slice.

### .ledger/releases/v0.1.6.md

- What changed: Adds the generated release document for `v0.1.6`.
- Anchor: `v0.1.6`
- On conflict: Regenerate with `ledger release v0.1.6 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get integrity provenance artifacts in a dedicated patch release.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the requested integrity/provenance work.
