---
id: "0034"
kind: "change"
title: "Prepare v0.1.3 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0030-validation-warning-hardening.md"
  - ".ledger/entries/0031-query-text-filter.md"
  - ".ledger/entries/0032-agent-packet-report.md"
  - ".ledger/entries/0033-open-source-packaging.md"
  - ".ledger/entries/0034-prepare-v0-1-3-release.md"
  - ".ledger/releases/v0.1.3.md"
symbols:
  - "v0.1.3"
docs:
  - "README.md"
  - "CONTRIBUTING.md"
commits: []
release: "v0.1.3"
---

# 0034: Prepare v0.1.3 Release

## Summary

Bumps the package to `0.1.3`, assigns the latest landed work to `v0.1.3`, and
generates the release record.

## Why

The validation, query, packet-report, and open-source packaging improvements are
ready to promote as a patch release before starting the MCP integration slice.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.3`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the release tag.

### .ledger/entries/0030-validation-warning-hardening.md through .ledger/entries/0034-prepare-v0-1-3-release.md

- What changed: Assigns landed records to `v0.1.3` and records relevant commit
  hashes.
- Anchor: `release`
- On conflict: Preserve release assignment for entries shipped in `v0.1.3`.

### .ledger/releases/v0.1.3.md

- What changed: Adds the generated release document for `v0.1.3`.
- Anchor: `v0.1.3`
- On conflict: Regenerate with `ledger release v0.1.3 --status released
  --date 2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get the latest core hardening and open-source packaging improvements in a
patch release.

## Invariants

- Package version, release record, and Git tag must agree.
- Release entries should include all landed work promoted in this patch.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This release is promoted before the MCP integration work so each requested chunk
has its own patch version.
