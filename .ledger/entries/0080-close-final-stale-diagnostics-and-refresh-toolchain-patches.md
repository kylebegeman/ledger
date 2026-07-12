---
id: "0080"
kind: "change"
title: "Close final stale diagnostics and refresh toolchain patches"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["maintenance", "diagnostics", "tests"]
files:
  - ".ledger/entries/0055-json-operational-errors.md"
  - "docs/SCHEMA.md"
  - "package-lock.json"
  - "src/stale.ts"
  - "test/stale.test.ts"
symbols:
  - "detectStaleKnowledge"
  - "staleRefs"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema now documents historical symbol acknowledgements alongside path acknowledgements."
  docs:
    - "docs/SCHEMA.md"
commits: []
---

# 0080: Close Final Stale Diagnostics And Refresh Toolchain Patches

## Summary

Stale-knowledge checks now honor explicit `symbols:name` acknowledgements for
historical symbol anchors. The compatible `@types/node` and Vitest patch
versions in the lockfile were also refreshed after the final dependency audit.

## Why

Historical receipt `0055` truthfully named helpers that were later replaced by
the versioned machine-result work. Rewriting those anchors would distort
history, while permanent warnings would train maintainers to ignore the stale
report. Explicit acknowledgements preserve both historical truth and a clean
diagnostic baseline.

## Changed Files

### Stale symbol acknowledgements

- Files: `src/stale.ts`, `test/stale.test.ts`, `docs/SCHEMA.md`,
  `.ledger/entries/0055-json-operational-errors.md`
- Rule: `staleRefs` accepts a bare historical symbol or the preferred
  `symbols:name` form, in addition to its existing path forms.
- On conflict: Do not suppress all stale-symbol checks for a document. Only
  exact, explicit acknowledgements may remove a signal.

### Compatible toolchain patches

- File: `package-lock.json`
- Rule: Keep the declared major lines while accepting current compatible patch
  releases for Node types and Vitest.
- On conflict: Major TypeScript or Vitest migrations require their own tested
  compatibility decision.

## Behavior And UX Impact

`ledger stale --check` and the doctor stale-knowledge diagnostic no longer
report intentionally historical helper names once they are acknowledged. New
unacknowledged stale symbols continue to appear normally.

## Invariants

- Historical acknowledgements are exact and document-local.
- Bare and `symbols:name` forms are supported for compatibility.
- Unacknowledged missing symbols remain visible.
- Dependency refreshes remain within declared compatible ranges.

## Verification

- Focused stale and validation tests.
- `npm ci` from the refreshed lockfile.
- `npm audit --omit=dev --audit-level=high` with zero vulnerabilities.
- `ledger stale --check` with zero issues.
- `npm run ci`.
