---
id: "0073"
kind: "change"
title: "Prepare v0.1.13 release"
date: "2026-07-04"
updated: "2026-07-04"
status: "landed"
areas:
  - "release"
  - "package"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0051-static-search-and-token-budgeted-agent-context.md"
  - ".ledger/entries/0052-render-artifact-budget-metrics.md"
  - ".ledger/entries/0053-weighted-static-search-ranking.md"
  - ".ledger/entries/0054-explicit-docs-impact-declarations.md"
  - ".ledger/entries/0055-json-operational-errors.md"
  - ".ledger/entries/0056-cli-search-performance-and-template-renderer.md"
  - ".ledger/entries/0057-command-result-model-extraction.md"
  - ".ledger/entries/0058-parser-backed-symbol-extraction.md"
  - ".ledger/entries/0059-generated-artifact-contract-tests.md"
  - ".ledger/entries/0060-config-version-migrations.md"
  - ".ledger/entries/0061-validation-policy-profiles.md"
  - ".ledger/entries/0062-mcp-compact-summaries.md"
  - ".ledger/entries/0063-render-asset-split.md"
  - ".ledger/entries/0064-graph-invariant-verification-nodes.md"
  - ".ledger/entries/0065-query-packet-command-models.md"
  - ".ledger/entries/0066-public-api-boundary.md"
  - ".ledger/entries/0067-render-html-component-split.md"
  - ".ledger/entries/0068-search-result-agent-packets.md"
  - ".ledger/entries/0069-static-reader-graph-search-polish.md"
  - ".ledger/entries/0070-api-and-release-prep-docs.md"
  - ".ledger/entries/0071-final-improvement-sweep-verification.md"
  - ".ledger/entries/0072-comprehensive-audit-correctness-hardening.md"
  - ".ledger/entries/0073-prepare-v0-1-13-release.md"
  - ".ledger/releases/v0.1.13.md"
symbols:
  - "v0.1.13"
docs: []
docsImpact:
  status: "not-needed"
  reason: "Release prep only updates package metadata and Ledger release records for already documented behavior."
commits: []
release: "v0.1.13"
---

# 0073: Prepare v0.1.13 Release

## Summary

Bumps Ledger to `0.1.13`, assigns the completed improvement and audit work to
the release, and generates the `v0.1.13` release record.

## Why

The improvement pass has accumulated a substantial set of landed user-facing,
agent-facing, architecture, documentation, and release-readiness changes. These
should ship together as the next public patch release after `0.1.12`.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.13`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.13` tag.

### .ledger/entries/0051 through .ledger/entries/0073

- What changed: Records release assignment for the improvement pass, final audit
  hardening, and release-prep entry.
- Anchor: `release`
- On conflict: Preserve `v0.1.13` assignment for the release contents listed in
  `.ledger/releases/v0.1.13.md`.

### .ledger/releases/v0.1.13.md

- What changed: Adds the generated release document for `v0.1.13`.
- Anchor: `v0.1.13`
- On conflict: Regenerate with `ledger release v0.1.13 --include-unreleased
  --assign --status released --date 2026-07-04 --write` after resolving entry
  metadata.

## Behavior And UX Impact

Users get the full improvement pass in a single patch release, including static
search, token-bounded agent packets, public API boundary docs, renderer
hardening, release-prep documentation, and audit fixes.

## Invariants

- Package version, release record, and Git tag must agree.
- `ledger unreleased` should be empty after release prep.
- The release document should include entries `0051` through `0073`.
- The npm package dry run should include only the intended package files.

## Verification

- `npm run ci`
- `npm run release:build`
- `node dist/cli.js render --json`
- `node dist/cli.js index`
- `node dist/cli.js doctor`
- `node dist/cli.js stale --check`
- `node dist/cli.js verify-integrity`
- `node dist/cli.js unreleased`
- `node dist/cli.js version`

## Notes

This is the public patch release for the completed improvement pass.
