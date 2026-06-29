---
id: "0020"
kind: "change"
title: "Overhaul README and prepare patch release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "release", "package", "branding"]
files:
  - "README.md"
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0001-ledger-project-bootstrap.md"
  - ".ledger/entries/0002-ledger-root-and-docs-lifecycle.md"
  - ".ledger/entries/0003-init-template-scaffold.md"
  - ".ledger/entries/0004-git-coverage-command.md"
  - ".ledger/entries/0005-query-and-agent-explain.md"
  - ".ledger/entries/0006-conflict-assistant-command.md"
  - ".ledger/entries/0007-release-and-unreleased-commands.md"
  - ".ledger/entries/0008-docs-impact-command.md"
  - ".ledger/entries/0009-docs-classify-command.md"
  - ".ledger/entries/0010-static-reader-render-command.md"
  - ".ledger/entries/0011-ci-summary-command.md"
  - ".ledger/entries/0012-repo-hygiene-and-ci-workflow.md"
  - ".ledger/entries/0013-cli-help-polish.md"
  - ".ledger/entries/0014-config-validation-hardening.md"
  - ".ledger/entries/0015-cli-fixture-workflow-tests.md"
  - ".ledger/entries/0016-git-aware-drafting-polish.md"
  - ".ledger/entries/0017-static-reader-context-polish.md"
  - ".ledger/entries/0018-release-workflow-polish.md"
  - ".ledger/entries/0019-bug-sweep-integration-fixes.md"
  - ".ledger/entries/0020-readme-overhaul-and-patch-release.md"
  - ".ledger/releases/v0.1.1.md"
symbols:
  - "Five Minute Start"
  - "Command Map"
  - "Agent Workflow"
  - "Release Workflow"
docs:
  - "docs/PRODUCT.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
release: "v0.1.1"
commits: []
---

# 0020: Overhaul README And Prepare Patch Release

## Summary

Reworks the README into a fuller public project landing page with a branded
header, badges, quick starts, command map, example entry, agent workflow,
release workflow, docs relationship, library usage, and development guidance.
The package metadata is bumped to `0.1.1`, existing change entries are assigned
to the `v0.1.1` release, and a release record is prepared.

## Why

The prior README was accurate but too thin for an open source project. It did
not make the icon feel intentional, did not surface status at a glance, and did
not give a clear path from first checkout to real usage. The patch release also
needed Ledger's own records to reflect that the initial body of work has now
shipped.

## Changed Files

### README.md

- What changed: Replaces the sparse README with a branded, badge-rich guide
  covering positioning, setup, commands, examples, agent workflow, release
  workflow, docs relationship, library usage, and development.
- Anchor: `Five Minute Start`
- On conflict: Keep the install instructions honest about the current source
  checkout workflow until the package is actually published.

### package.json and package-lock.json

- What changed: Bumps the package version from `0.1.0` to `0.1.1`.
- Anchor: `version`
- On conflict: Keep package metadata, lockfile metadata, and release records in
  agreement.

### .ledger/entries/*.md

- What changed: Assigns existing change entries to `release: "v0.1.1"` so
  release state and `ledger unreleased` remain meaningful after the patch
  release.
- Anchor: `release`
- On conflict: Preserve release assignment for entries included in
  `.ledger/releases/v0.1.1.md`.

### .ledger/releases/v0.1.1.md

- What changed: Adds the generated release record for the `0.1.1` patch
  release.
- Anchor: `Ledger v0.1.1`
- On conflict: Regenerate or edit the release record so it matches the entries
  assigned to `v0.1.1`.

## Behavior And UX Impact

New visitors get a stronger first impression and a clearer path to using
Ledger. Maintainers get consistent release metadata, and agents can see that
the current body of work is assigned to the first patch release.

## Invariants

- README install instructions must not imply unavailable package distribution.
- The package version must match the release record.
- Entries included in the release must carry `release: "v0.1.1"`.
- Ledger remains independent from Dossier and renderer-specific products.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js render`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js unreleased`
- `node dist/cli.js ci`
- `npm pack --dry-run`

## Notes

Publishing to npm still needs an explicit package-publishing decision and
registry ownership check.
