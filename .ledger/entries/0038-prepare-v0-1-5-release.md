---
id: "0038"
kind: "change"
title: "Prepare v0.1.5 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0037-docs-plane-reconcile-migration.md"
  - ".ledger/entries/0038-prepare-v0-1-5-release.md"
  - ".ledger/releases/v0.1.5.md"
symbols:
  - "v0.1.5"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
release: "v0.1.5"
---

# 0038: Prepare v0.1.5 Release

## Summary

Bumps Ledger to `0.1.5`, assigns the docs-plane reconciliation work to the
release, and generates the release record.

## Why

The docs-plane improvements are a distinct patch release from MCP integration
and should be easy to identify in release history.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.5`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.5` tag.

### .ledger/entries/0037-docs-plane-reconcile-migration.md and .ledger/entries/0038-prepare-v0-1-5-release.md

- What changed: Records commit and release metadata for the docs-plane patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.5` assignment for the docs-plane slice.

### .ledger/releases/v0.1.5.md

- What changed: Adds the generated release document for `v0.1.5`.
- Anchor: `v0.1.5`
- On conflict: Regenerate with `ledger release v0.1.5 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get generated docs routing and migration reporting in a dedicated patch.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the requested docs-plane work.
