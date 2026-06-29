---
id: "0033"
kind: "change"
title: "Harden open source packaging"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["github", "release", "package", "docs"]
files:
  - ".github/workflows/ci.yml"
  - ".github/workflows/release.yml"
  - ".github/ISSUE_TEMPLATE/config.yml"
  - ".github/ISSUE_TEMPLATE/bug_report.md"
  - ".github/ISSUE_TEMPLATE/feature_request.md"
  - ".github/pull_request_template.md"
  - "CONTRIBUTING.md"
  - "README.md"
  - "package.json"
  - ".ledger/entries/0033-open-source-packaging.md"
symbols:
  - "npm run ci"
  - "Release"
docs:
  - "README.md"
  - "CONTRIBUTING.md"
commits: []
---

# 0033: Harden Open Source Packaging

## Summary

Adds a release-grade npm script, simplifies CI to use that script, adds a
tag-driven release workflow, and improves issue and pull request templates for
public collaboration.

## Why

Ledger is now useful enough to treat as an open-source package. The repository
needs repeatable verification, predictable release automation, and contributor
prompts that reinforce Ledger-specific expectations.

## Changed Files

### package.json

- What changed: Adds `ledger:ci`, `pack:dry-run`, and `ci` scripts.
- Anchor: `scripts`
- On conflict: Keep one release-grade command that runs typecheck, tests, build,
  Ledger CI, and packaging dry run.

### .github/workflows/ci.yml

- What changed: Runs `npm run ci` with a job timeout.
- Anchor: `Verify`
- On conflict: Keep CI aligned with the local release-grade command.

### .github/workflows/release.yml

- What changed: Adds tag-driven release verification and conditional npm
  publishing with provenance when `NPM_TOKEN` is configured.
- Anchor: `Publish`
- On conflict: Preserve verification on every tag and keep publish conditional
  until npm credentials exist.

### .github/ISSUE_TEMPLATE/config.yml

- What changed: Disables blank issues and routes security reports privately.
- Anchor: `contact_links`
- On conflict: Keep security-sensitive reports out of public issues.

### .github/ISSUE_TEMPLATE/bug_report.md and .github/ISSUE_TEMPLATE/feature_request.md

- What changed: Adds Ledger-specific reproduction, install, and surface prompts.
- Anchor: `Ledger Surface`
- On conflict: Keep templates short enough to encourage complete reports.

### .github/pull_request_template.md

- What changed: Uses `npm run ci` and adds Ledger release/generated-file checks.
- Anchor: `Verification`
- On conflict: Keep PR verification aligned with CI.

### README.md and CONTRIBUTING.md

- What changed: Documents `npm run ci` and tag-driven release publishing.
- Anchor: `Development`
- On conflict: Keep public docs accurate for the current release workflow.

## Behavior And UX Impact

Contributors have a single local verification command. Release tags verify the
package and can publish automatically once npm credentials are configured.

## Invariants

- `npm run ci` remains the release-grade local verification command.
- Release tags always run full verification before optional publish.
- npm publishing is conditional on repository credentials.
- Contributor templates should not encourage committing generated files.

## Verification

- `npm run ci`
- `node dist/cli.js validate`

## Notes

This does not publish to npm by itself. It prepares the repository so publishing
can be enabled by adding the npm token.
