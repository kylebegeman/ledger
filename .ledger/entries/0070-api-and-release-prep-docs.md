---
id: "0070"
kind: "change"
title: "API and release prep docs"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "docs"
  - "package"
  - "release"
  - "architecture"
files:
  - ".ledger/entries/0070-api-and-release-prep-docs.md"
  - "README.md"
  - "docs/API.md"
  - "docs/RELEASE_PREP.md"
symbols: []
docs:
  - "README.md"
  - "docs/API.md"
  - "docs/RELEASE_PREP.md"
docsImpact:
  status: "updated"
  reason: "Added durable API boundary and release-prep documentation and linked it from the README."
  docs:
    - "README.md"
    - "docs/API.md"
    - "docs/RELEASE_PREP.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0070: API And Release Prep Docs

## Summary

Added durable documentation for the TypeScript API boundary and release-prep
checklist.

## Why

Ledger now has a deliberate stable package root plus an unstable internal
entrypoint. Future changes need clear promotion rules and release checks so API
shape, package contents, and Ledger receipts stay consistent.

## Changed Files

### docs/API.md

- What changed: Documented stable and unstable import paths, root export
  criteria, command result models, token-bounded APIs, and compatibility rules.
- Anchor: `Ledger API`
- On conflict: Keep this document aligned with `package.json` exports and
  `test/publicApi.test.ts`.

### docs/RELEASE_PREP.md

- What changed: Added preconditions, local verification commands, package
  boundary review, publishing steps, and post-publish checks.
- Anchor: `Release Prep`
- On conflict: Keep command names aligned with `package.json` scripts.

### README.md

- What changed: Linked API and release-prep docs from package and project docs
  sections.
- Anchor: `Library API`
- On conflict: Keep README links pointing to durable docs.

## Behavior And UX Impact

No runtime behavior changed. Maintainers now have a clearer checklist for API
changes and package releases.

## Invariants

- Stable root exports are documented in README and `docs/API.md`.
- Release prep includes both npm package checks and Ledger-specific checks.
- Durable docs are linked from the README.

## Verification

- `npm test -- --run test/publicApi.test.ts`
- `npm run typecheck`

## Notes

The docs routing manifest will be refreshed during the final generated-artifact
pass because durable docs were added.
