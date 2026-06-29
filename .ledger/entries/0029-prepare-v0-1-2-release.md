---
id: "0029"
kind: "change"
title: "Prepare v0.1.2 patch release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package", "ledger"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0021-expanded-query-filters.md"
  - ".ledger/entries/0022-draft-symbol-extraction.md"
  - ".ledger/entries/0023-conflict-report-output.md"
  - ".ledger/entries/0024-notebook-icon-refresh.md"
  - ".ledger/entries/0025-relationship-indexes.md"
  - ".ledger/entries/0026-docs-routing-reconcile.md"
  - ".ledger/entries/0027-agent-packet-command.md"
  - ".ledger/entries/0028-ignore-generated-docs-manifest.md"
  - ".ledger/entries/0029-prepare-v0-1-2-release.md"
  - ".ledger/releases/v0.1.2.md"
symbols:
  - "v0.1.2"
docs:
  - "docs/ROADMAP.md"
commits: ["3201878"]
release: "v0.1.2"
---

# 0029: Prepare v0.1.2 Patch Release

## Summary

Prepares the `v0.1.2` patch release by bumping package metadata, assigning the
latest landed changes to `release: "v0.1.2"`, and generating the Ledger release
record.

## Why

The latest `next` milestones are ready to promote to `master`: richer query
filters, diff-draft symbol extraction, conflict report output, the refreshed
notebook icon, relationship indexes, docs routing manifest generation, agent
packets, and generated manifest ignore behavior.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version from `0.1.1` to `0.1.2`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the release tag and release
  record.

### .ledger/entries/0021-0028

- What changed: Assigns the latest landed entries to `release: "v0.1.2"`.
- Anchor: `release`
- On conflict: Preserve release assignment for entries included in
  `.ledger/releases/v0.1.2.md`.

### .ledger/releases/v0.1.2.md

- What changed: Adds the generated release record for the patch release.
- Anchor: `Ledger v0.1.2`
- On conflict: Regenerate or edit the release record so it matches entries
  assigned to `v0.1.2`.

## Behavior And UX Impact

The release branch can carry the latest Ledger improvements as a patch release,
with `ledger unreleased` returning zero after promotion.

## Invariants

- Package version, release record, and git tag must agree.
- `master` should fast-forward from `next` for this release.
- Generated docs manifests remain excluded from package contents.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs reconcile`
- `node dist/cli.js ci`
- `node dist/cli.js unreleased`
- `npm pack --dry-run`

## Notes

This release is a GitHub/tag release prep. It does not publish to npm.
