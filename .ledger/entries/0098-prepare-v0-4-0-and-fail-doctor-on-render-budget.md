---
id: "0098"
kind: "change"
title: "Prepare v0.4.0 and fail doctor on render budget overruns"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "release"
  - "cli"
files:
  - "src/doctor.ts"
  - "package.json"
  - "package-lock.json"
  - "docs/ROADMAP.md"
  - "docs/ARCHITECTURE.md"
symbols:
  - "runDoctor"
docs:
  - "docs/ROADMAP.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The roadmap marks the Phase 11 foundation as shipped in 0.4.0 and the architecture guide states that doctor fails on render budget overruns."
  docs:
    - "docs/ROADMAP.md"
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
  - "0096"
  - "0097"
release: "v0.4.0"
---

# 0098: Prepare V0.4.0 And Fail Doctor On Render Budget Overruns

## Summary

Bumped the package to 0.4.0, turned the `render-budget` doctor check from a
warning into a failure when a generated reader artifact exceeds its budget,
and marked the roadmap's Phase 11 foundation as shipped.

## Why

0.4.0 carries the three foundation milestones from decision D005: the
operation registry, the incremental catalog cache, and the unified retrieval
contract. The brainstorm's A6 item asked that budgets tell the truth: after
the September hygiene pass reconciled the total budget, a silent warning was
the last way an over-budget reader could ship. Failing the check makes doctor
and the release checklist stop instead.

## Changed Files

### Doctor

- File: `src/doctor.ts`
- Changed: `renderBudgetCheck` returns level `fail` when the render budget is
  not ok; a missing reader still passes because nothing has been generated.
- Anchor: `renderBudgetCheck`
- On conflict: Keep performance timing as a warning; only artifact size and
  write time are deterministic enough to fail on.

### Version and docs

- Files: `package.json`, `package-lock.json`, `docs/ROADMAP.md`,
  `docs/ARCHITECTURE.md`
- Changed: version 0.4.0; Phase 11 status reads "foundation shipped in
  0.4.0"; the architecture guide describes the failing budget check.
- On conflict: The tag must equal the package version.

## Behavior And UX Impact

`ledger doctor` exits 1 when the rendered reader is over its configured
budget. Nothing else changes for users; the release record for v0.4.0 groups
entries 0095 through 0098.

## Invariants

- Doctor fails on over-budget render artifacts and passes when no reader has
  been generated.
- The package version and the release tag agree.

## Verification

- `npm run ci`
- `ledger release v0.4.0 --include-unreleased --assign --status released --date 2026-09-16 --write`
- `ledger doctor` on this repository after `ledger render`

## Notes

Milestone four of the 0.4 foundation: the release itself.
