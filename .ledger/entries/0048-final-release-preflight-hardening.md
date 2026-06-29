---
id: "0048"
kind: "change"
title: "Final release preflight hardening"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas:
  - "release"
  - "tests"
files:
  - "src/release.ts"
  - "test/release.test.ts"
  - "docs/ARCHITECTURE.md"
  - ".ledger/entries/0048-final-release-preflight-hardening.md"
symbols:
  - "assertReleaseDocumentWritable"
docs:
  - "docs/ARCHITECTURE.md"
commits:
  - "034a249"
---

# 0048: Final release preflight hardening

## Summary

Hardens the release write preflight so `release --assign --write` verifies the
release output directory before mutating entries. This closes the remaining
safe edge case from the audit pass where an absent or unwritable releases
directory could still fail after assignment had started.

## Why

Ledger release assignment is intentionally conservative because it mutates
source entry records. The previous preflight blocked existing release files, but
it did not mirror the directory creation and writability requirement used by the
actual release document write.

## Changed Files

### src/release.ts

- What changed: Creates the releases directory and checks it is writable before
  allowing assignment plus release-file writing to proceed.
- Anchor: `assertReleaseDocumentWritable`
- On conflict: Preserve the invariant that preflight checks happen before entry
  mutation when `--assign` and `--write` are combined.

### test/release.test.ts

- What changed: Extends the missing-release-file case to assert the preflight
  creates the releases directory.
- Anchor: `assertReleaseDocumentWritable`
- On conflict: Keep test coverage for preflight side effects that protect
  release assignment.

### docs/ARCHITECTURE.md

- What changed: Documents the release assignment preflight invariant in the
  release workflow architecture and CLI behavior sections.
- Anchor: `Release Workflow`
- On conflict: Keep the docs aligned with the requirement that output readiness
  is checked before source entry mutation.

## Behavior And UX Impact

Release assignment fails earlier when the releases directory cannot be prepared.
Successful preflight now leaves the releases directory ready for the subsequent
exclusive release-file write.

## Invariants

- `release --assign --write` must verify release output readiness before entry
  assignment.
- Existing release files must still be rejected without mutating entries.
- The final release write must continue using exclusive file creation.

## Verification

- `npm run typecheck`
- `npx vitest run test/release.test.ts test/cliE2e.test.ts`

## Notes

This is a final safe hardening item from the release sweep. No product-direction
changes were made.
