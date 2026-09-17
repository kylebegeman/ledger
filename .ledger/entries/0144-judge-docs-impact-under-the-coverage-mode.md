---
id: "0144"
kind: "change"
title: "Judge docs impact under the coverage mode"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "ci"
  - "docs"
  - "trust"
files:
  - "src/docsImpact.ts"
  - "src/types.ts"
  - "src/ci.ts"
  - "src/operations/definitions/changes.ts"
  - "test/docsImpact.test.ts"
  - "test/ci.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/SCHEMA.md"
  - "README.md"
symbols:
  - "buildDocsImpact"
  - "BuildDocsImpactOptions"
  - "historicalFiles"
docs:
  - "docs/SCHEMA.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The schema doc's coverage section and the README's CI section say that docs impact follows git.coverage, and the docs impact help text says the same."
  docs:
    - "docs/SCHEMA.md"
    - "README.md"
commits: []
related:
  - "0112"
  - "0113"
  - "0135"
  - "0138"
release: "v0.8.0"
---

# 0144: Judge Docs Impact Under The Coverage Mode

## Summary

Docs impact now follows `git.coverage`. Under `current`, the default, nothing
changes: only change entries in the change set give a source file its docs
impact evidence. Under `any`, a file those entries do not satisfy may take its
evidence from an earlier receipt that lists it and carries a reviewed
`docsImpact` declaration or docs references, and it is reported as satisfied
by an earlier receipt. `ledger ci` judges coverage and docs impact under one
mode, so under `any` a pull request that changes a file an earlier receipt
covers passes both checks, and a file no receipt lists fails both.

## Why

Product note 0138: `adopt` writes `git.coverage: any` so a repository's history
counts, but docs impact still required a receipt in the change set, so
adopters' pull requests failed `ledger ci` exactly as they would under
`current`. Kyle asked for a decision. Keeping docs impact strict and
documenting that `any` only affects `ledger coverage` was rejected because it
would make `any` meaningless in CI, contradicting what `adopt` promises.
Evidence from an older receipt still has to be a reviewed declaration or docs
references, and `current` keeps the per-change rule from 0113.

## Changed Files

### Docs impact

- Files: `src/docsImpact.ts`, `src/types.ts`, `src/ci.ts`,
  `src/operations/definitions/changes.ts`,
  `test/fixtures/operations-contract.json`
- Changed: `buildDocsImpact` takes `BuildDocsImpactOptions.mode`, defaulting
  to `git.coverage`, and under `any` falls back to earlier change entries for
  a file the change set leaves unsatisfied. `LedgerDocsImpact` gains `mode`
  and `historicalFiles`, and a file satisfied that way carries
  `historical: true`. `runCiChecks` passes the coverage mode. The report, the
  CLI output, and the help text name earlier receipts; the contract changes
  only by `historicalFiles` in the docs impact output.
- Anchor: `buildDocsImpact`, `historicalFiles`
- On conflict: Under `current`, only change-set entries give evidence, and an
  older receipt without reviewed evidence never satisfies a file.

### Tests and docs

- Files: `test/docsImpact.test.ts`, `test/ci.test.ts`, `docs/SCHEMA.md`,
  `README.md`
- Changed: unit cases for both modes, an unreviewed earlier declaration, and a
  change-set entry taking precedence; a `runCiChecks` case over a Git range in
  both modes with an unlisted file; the schema doc's coverage section and the
  README's CI paragraph.
- Anchor: `judges coverage and docs impact for a file an earlier receipt covers under one mode`
- On conflict: Keep the range test proving both checks pass together under
  `any` and fail together under `current`.

## Behavior And UX Impact

Repositories adopted with `git.coverage: any` stop failing `ledger ci` and
the GitHub Action on docs impact for files their existing receipts already
cover. `ledger docs impact` lists those files as satisfied by an earlier
receipt. Repositories on `current` see no change.

## Invariants

- Under `current`, docs impact evidence comes only from change entries in the
  change set.
- Under `any`, a file is satisfied by an earlier receipt only when that receipt
  lists it and carries a reviewed declaration or docs references.
- `ledger ci` judges coverage and docs impact under the same mode.

## Verification

- `npx vitest run test/docsImpact.test.ts test/ci.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (docs impact output only)
- `npm run ci`

## Notes

Resolves product note 0138.
