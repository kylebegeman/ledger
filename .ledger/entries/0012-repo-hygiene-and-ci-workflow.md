---
id: "0012"
kind: "change"
title: "Add repo hygiene and CI workflow"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["github", "ci", "docs", "package"]
files:
  - ".github/workflows/ci.yml"
  - ".github/ISSUE_TEMPLATE/bug_report.md"
  - ".github/ISSUE_TEMPLATE/feature_request.md"
  - ".github/pull_request_template.md"
  - "CONTRIBUTING.md"
  - "SECURITY.md"
  - "README.md"
  - "package.json"
symbols: []
docs: []
commits: []
---

# 0012: Add Repo Hygiene And CI Workflow

## Summary

Adds GitHub CI, issue templates, a pull request template, contributing guidance,
security reporting guidance, and npm package metadata.

## Why

Ledger is intended to be open source. A first public version needs a clear
repository shape so contributors and automation know how to verify changes,
where development happens, and how Ledger entries fit into the workflow.

## Changed Files

### .github/workflows/ci.yml

- What changed: Adds a GitHub Actions workflow for `master`, `next`, and pull
  requests.
- Anchor: `CI`
- On conflict: Keep CI aligned with local verification: install, check, build,
  Ledger CI, and package dry run.

### .github/ISSUE_TEMPLATE/*

- What changed: Adds bug and feature request templates.
- Anchor: `ISSUE_TEMPLATE`
- On conflict: Keep templates short and practical for early contributors.

### .github/pull_request_template.md

- What changed: Adds verification and Ledger-entry checklist items.
- Anchor: `Ledger`
- On conflict: Keep the checklist focused on commands this repo can actually
  run today.

### CONTRIBUTING.md

- What changed: Documents local development, Ledger entry expectations, branch
  policy, and pull request expectations.
- Anchor: `Development`
- On conflict: Preserve `next` as the development branch and `master` as stable.

### SECURITY.md

- What changed: Adds private-report guidance and reminds contributors not to
  commit secrets or private data into Ledger records.
- Anchor: `Security`
- On conflict: Keep the security note direct and repo-native.

### README.md

- What changed: Adds a concise contributing section.
- Anchor: `Contributing`
- On conflict: Keep README contributor guidance brief and link to the durable
  contributing document.

### package.json

- What changed: Adds keywords, repository, homepage, and bug-report metadata.
- Anchor: `repository`
- On conflict: Keep package metadata pointed at `mrbagels/ledger`.

## Behavior And UX Impact

GitHub can run the same verification path used locally. Contributors have basic
templates and branch expectations before the first public release.

## Invariants

- CI runs `npm run check`, `npm run build`, `node dist/cli.js ci --json`, and
  `npm pack --dry-run`.
- Active development remains on `next`.
- `master` remains the stable branch.
- Ledger records must not include secrets or private data.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js ci`
- `npm pack --dry-run`

## Notes

Future GitHub work can add annotations and pull request comments on top of the
existing `ledger ci --json` result.
