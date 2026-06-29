---
id: "0018"
kind: "change"
title: "Polish release workflow"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "release", "docs", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
  - ".ledger/templates/release.md"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/release.ts"
  - "src/workspace.ts"
  - "test/release.test.ts"
symbols:
  - "buildReleaseDocument"
  - "formatReleaseMarkdown"
  - "validateReleaseVersion"
  - "releaseCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
release: "v0.1.1"
commits: ["c5ff5d3"]
---

# 0018: Polish Release Workflow

## Summary

Improves release generation with semver-like version validation, explicit
release status/date support, and separate public notes plus internal Ledger
entry details in rendered release records.

## Why

The initial release command proved selection and rendering, but v0.1 needs
slightly stronger release ergonomics. Public notes and internal entries serve
different audiences, and release filenames should not accept arbitrary strings.

## Changed Files

### src/release.ts

- What changed: Adds `validateReleaseVersion`, status-aware release documents,
  and a `## Public Notes` section separate from internal entry details.
- Anchor: `formatReleaseMarkdown`
- On conflict: Keep release records valid Ledger Markdown and keep public notes
  derived from selected change titles.

### src/config.ts, src/workspace.ts, and .ledger/templates/release.md

- What changed: Adds `Public Notes` to the release required-section policy and
  release template.
- Anchor: `requiredSections.release`
- On conflict: Keep release validation, generated release Markdown, and the
  scaffolded release template in sync.

### src/cli.ts

- What changed: Adds `--status planned|released` and `--date yyyy-mm-dd` to
  `ledger release`.
- Anchor: `releaseCommand`
- On conflict: Preserve default planned status and explicit non-overwriting
  `--write` behavior.

### test/release.test.ts

- What changed: Adds coverage for released status, public notes, and invalid
  version rejection.
- Anchor: `validateReleaseVersion`
- On conflict: Keep version validation strict enough to protect generated file
  paths without implementing a full package-release system.

### README.md and docs/*

- What changed: Documents release status/date flags, semver-style validation,
  and public-vs-internal release sections.
- Anchor: `ledger release`
- On conflict: Keep docs clear that this is release record generation, not npm
  publishing.

## Behavior And UX Impact

Users can generate release records that are closer to publishable changelogs
while preserving internal Ledger references for maintainers and agents.

## Invariants

- Release versions must be semver-like.
- Release status defaults to `planned`.
- `--write` refuses to overwrite existing release records.
- Release Markdown includes both public notes and internal entry details.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js release v0.1.0 --include-unreleased --status released --date 2026-06-29`
- `node dist/cli.js release bad --include-unreleased` exits non-zero
- `node dist/cli.js ci`
- `node dist/cli.js coverage`

## Notes

Future release work can update selected entries with release assignments and
compare release versions against package metadata.
