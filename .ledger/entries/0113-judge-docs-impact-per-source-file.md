---
id: "0113"
kind: "change"
title: "Judge docs impact per source file"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "docs"
  - "ci"
  - "trust"
files:
  - "src/docsImpact.ts"
  - "src/types.ts"
  - "src/operations/definitions/changes.ts"
  - "test/docsImpact.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "buildDocsImpact"
  - "LedgerDocsImpactFile"
  - "LedgerDocsImpactEvidence"
  - "formatDocsImpactReport"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema's docs impact declaration section states the per-file rule; the architecture docs bridge bullets and the README command row describe the evidence requirement."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0112"
release: "v0.7.0"
---

# 0113: Judge Docs Impact Per Source File

## Summary

`buildDocsImpact` now produces one evidence record per changed source file.
A file is satisfied only through a change entry in the same change set that
lists it and either carries a reviewed `docsImpact` declaration or references
docs; the file's evidence names the entry, the declaration status and reason,
and the docs. `missingDocsImpact` is the list of unsatisfied files, so a docs
edit elsewhere in the change set no longer clears every source file. The
report gains a Per-File Evidence section that says why each file passed or
which entry listed it without a reviewed declaration, and the JSON output
carries `files`.

## Why

B008's second item: replace the single boolean with per-file evidence so one
docs touch cannot satisfy an entire change set. With coverage now bound to the
change set (0112), the entry that covers a file is exactly the place where
docs impact should be declared, and attributing evidence through that entry
makes the check explain itself. The old rule accepted any changed docs file
or any declaration anywhere, which hid untouched files behind unrelated docs
work.

## Changed Files

### Docs impact

- Files: `src/docsImpact.ts`, `src/types.ts`
- Changed: `docsImpactFile` matches changed change entries to each source
  file with `coveragePatternMatches`, collects declaration or docs-reference
  evidence, and drives `missingDocsImpact`; `LedgerDocsImpactFile` and
  `LedgerDocsImpactEvidence` types; per-file report lines.
- Anchor: `docsImpactFile`
- On conflict: Only `change` kind records contribute evidence, and a
  declaration whose reason is a TODO contributes nothing.

### Operation, tests, and docs

- Files: `src/operations/definitions/changes.ts`, `test/docsImpact.test.ts`,
  `test/fixtures/operations-contract.json`, `README.md`,
  `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: the `files` output field and help text; the docs-only test now
  expects a missing file, plus tests for per-file attribution and unreviewed
  declarations; regenerated contract; docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

`ledger ci` and `ledger docs impact --check` fail for source files that no
changed entry ties to a docs decision, even when docs changed in the same
set. This repository's receipts already list their files and declare docs
impact, so they pass unchanged.

## Invariants

- Every changed source file appears exactly once in `files`.
- A source file is satisfied only through an entry that lists it.
- `missingDocsImpact` equals the unsatisfied entries of `files`.

## Verification

- `npm run typecheck`
- `npx vitest run` (273 tests, including `test/docsImpact.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `npm run ci`

## Notes

Milestone two of 0.7 trust (B008). Next: honest symbol extraction with
`typescript` as an optional peer dependency.
