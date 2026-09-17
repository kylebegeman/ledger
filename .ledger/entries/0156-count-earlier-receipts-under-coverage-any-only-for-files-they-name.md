---
id: "0156"
kind: "change"
title: "Count earlier receipts under coverage any only for files they name"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "trust"
  - "coverage"
files:
  - "src/coverage.ts"
  - "src/docsImpact.ts"
  - "src/ci.ts"
  - "src/types.ts"
  - "src/operations/definitions/changes.ts"
  - "test/coverage.test.ts"
  - "test/docsImpact.test.ts"
  - "test/ci.test.ts"
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "isCoveragePattern"
  - "docsImpactFile"
  - "historicalCoverageMessage"
docs:
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The schema doc, the architecture doc's coverage paragraph, and the README's CI section say that under any an earlier receipt counts only for the files it names."
  docs:
    - "docs/SCHEMA.md"
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
related:
  - "0144"
  - "0154"
  - "0112"
release: "v0.8.1"
---

# 0156: Count Earlier Receipts Under Coverage Any Only For Files They Name

## Summary

Under `git.coverage: any`, an earlier change entry now covers a changed file
only when it names that file. A pattern such as `src/**`, a `prefix:` or
`glob:` reference, or a directory ending in `/` still covers files from a
receipt that is part of the change set, but no longer from an older one, for
coverage and for docs impact alike. A path that only an earlier pattern
matches is reported as `historical`, and `ledger coverage`, `ledger ci`
annotations, and the job summary say it is matched only by patterns in
earlier receipts and should be named in a receipt.

## Why

The 0.8.0 audit showed that under `any` one old receipt with `src/**` and a
reviewed docs impact declaration satisfied coverage and docs impact for every
later change under `src/`, forever. `adopt` writes `any` for every adopter, so
a broad adoption receipt would quietly switch off the check the README
promises. Kyle left the policy to the assistant. `any` exists so a
repository's history of specific receipts carries forward to later edits of
the same files; a pattern describes a change's scope at the time, not a
standing exemption. Dropping `any` entirely was rejected because adopters
need history to count while they build it, and a config switch was rejected
as a second knob for one rule. Kore's receipts name their files, so its CI is
unaffected.

## Changed Files

### Coverage and docs impact

- Files: `src/coverage.ts`, `src/docsImpact.ts`, `src/types.ts`
- Changed: `explainCoverageForPath` counts a path covered under `any` when a
  change-set entry lists it or an earlier reference that is not an
  `isCoveragePattern` matches it; `docsImpactFile` takes `namedOnly` and
  `buildDocsImpact` sets it for earlier entries; `historicalFiles` describes
  both modes.
- Anchor: `explainCoverageForPath`, `namedOnly`, `historicalFiles`
- On conflict: Patterns count only from entries in the change set; keep
  coverage and docs impact on the same rule.

### Messages

- Files: `src/ci.ts`, `src/operations/definitions/changes.ts`
- Changed: `historicalCoverageMessage` words the annotation and summary line
  by mode, the coverage report says the same under `any`, and the coverage
  help states the rule.
- Anchor: `historicalCoverageMessage`, `matched only by patterns in earlier receipts`
- On conflict: Tell the reader to name the file in a receipt under `any`.

### Tests and docs

- Files: `test/coverage.test.ts`, `test/docsImpact.test.ts`,
  `test/ci.test.ts`, `docs/SCHEMA.md`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: a range where an earlier receipt names one file and matches
  another only through `src/**`, then covers both once the receipt is part of
  the change; docs impact with a pattern-only earlier receipt; the CI
  annotation and summary under `any`; the docs describe the rule.
- Anchor: `accepts an earlier receipt under any only when it names the file`, `Git Inspector`
- On conflict: Keep the case proving a change-set pattern still covers.

## Behavior And UX Impact

An adopted repository whose receipts list broad patterns sees pull requests
fail coverage and docs impact for files those patterns only matched, with a
message to name the file in a receipt. A pull request that carries its own
receipt, patterns included, passes as before. Repositories on `current` see
no change.

## Invariants

- Under `any`, an earlier change entry covers a path only when it names the
  path.
- A pattern covers paths only from a change entry in the change set.
- Coverage and docs impact apply the same rule.

## Verification

- `npx vitest run test/coverage.test.ts test/docsImpact.test.ts test/ci.test.ts test/operations.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` left the
  contract unchanged.
- `npm run typecheck`
- `npm run ci`

## Notes

Decided in the 0.8.1 audit follow-up, where Kyle delegated the choice.
