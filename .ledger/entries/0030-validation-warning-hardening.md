---
id: "0030"
kind: "change"
title: "Harden validation warnings"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["validation", "quality", "docs", "tests"]
files:
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
  - "src/validate.ts"
  - "test/validate.test.ts"
  - ".ledger/entries/0030-validation-warning-hardening.md"
symbols:
  - "validateDocuments"
  - "warnUnknownFrontmatterFields"
  - "warnMissingPathReferences"
docs:
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
commits:
  - "04d5294"
release: "v0.1.3"
---

# 0030: Harden Validation Warnings

## Summary

Adds validator warnings for missing `updated`, empty changed-file references
when policy requires them, empty invariants when policy requires them, unknown
frontmatter fields, and missing `files` or `docs` references.

## Why

The implementation plan already defined these as useful warnings. Adding them
now makes `ledger validate` catch stale references and low-quality entries
without turning advisory cleanup into blocking errors.

## Changed Files

### src/validate.ts

- What changed: Adds metadata, policy, unknown-field, and missing-reference
  warning checks.
- Anchor: `validateDocuments`
- On conflict: Keep these checks warnings rather than errors so older records
  remain readable and incrementally cleanable.

### test/validate.test.ts

- What changed: Adds warning coverage and creates real referenced fixture files
  for the valid fixture.
- Anchor: `validateDocuments`
- On conflict: Preserve both a clean fixture and a warning-focused fixture.

### docs/IMPLEMENTATION_PLAN.md and docs/SCHEMA.md

- What changed: Documents implemented validation warnings and explains that
  missing-reference validation respects `git.ignore`.
- Anchor: `Validation Policy`
- On conflict: Keep docs aligned with validator behavior.

## Behavior And UX Impact

Users get actionable quality warnings for incomplete records and stale path
references while validation still only fails on hard schema errors.

## Invariants

- Missing-reference checks must respect generated-path ignores.
- Advisory quality issues remain warnings.
- A clean Ledger catalog should validate with zero warnings.

## Verification

- `npm run typecheck`
- `npx vitest run test/validate.test.ts`
- `npm run build`
- `node dist/cli.js validate`

## Notes

Future validation can add warning configuration levels if projects need stricter
CI gates.
