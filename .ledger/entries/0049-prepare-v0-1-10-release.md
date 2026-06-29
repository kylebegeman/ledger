---
id: "0049"
kind: "change"
title: "Prepare v0.1.10 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas:
  - "release"
  - "package"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0047-bug-sweep-release-agent-fixes.md"
  - ".ledger/entries/0048-final-release-preflight-hardening.md"
  - ".ledger/entries/0049-prepare-v0-1-10-release.md"
  - ".ledger/releases/v0.1.10.md"
symbols:
  - "v0.1.10"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
commits:
  - "1ec3e36"
release: "v0.1.10"
---

# 0049: Prepare v0.1.10 release

## Summary

Bumps Ledger to `0.1.10`, assigns the final audit and release-preflight
hardening work to the patch release, and generates the release record.

## Why

The final sweep found one more safe release-readiness hardening item after the
agent integrity audit. These changes should ship together as a patch release so
`next` and `master` have the latest safety and MCP integration fixes.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.10`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.10` tag.

### .ledger/entries/0047-bug-sweep-release-agent-fixes.md, .ledger/entries/0048-final-release-preflight-hardening.md, and .ledger/entries/0049-prepare-v0-1-10-release.md

- What changed: Records release assignment for the audit, preflight hardening,
  and release-prep entries.
- Anchor: `release`
- On conflict: Preserve `v0.1.10` assignment for the patch release contents.

### .ledger/releases/v0.1.10.md

- What changed: Adds the generated release document for `v0.1.10`.
- Anchor: `v0.1.10`
- On conflict: Regenerate with `ledger release v0.1.10 --status released --date
  2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users get the final release assignment safety hardening and MCP integrity tool
in a dedicated patch release.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.
- The release document should include entries `0047`, `0048`, and `0049`.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This is the patch release for the final bug sweep.
