---
id: "0154"
kind: "change"
title: "Tighten adoption, docs impact, and verification trust"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "trust"
  - "adoption"
  - "ci"
files:
  - "src/toolchain.ts"
  - "src/verify.ts"
  - "src/docsImpact.ts"
  - "src/coverage.ts"
  - "src/ci.ts"
  - "src/docs.ts"
  - "src/types.ts"
  - "src/operations/definitions/changes.ts"
  - "src/operations/definitions/docs.ts"
  - "test/toolchain.test.ts"
  - "test/verify.test.ts"
  - "test/docsImpact.test.ts"
  - "test/coverage.test.ts"
  - "test/ci.test.ts"
  - "test/operations.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/SCHEMA.md"
  - ".ledger/config.yaml"
symbols:
  - "detectToolchain"
  - "isDeniedCommandName"
  - "parseVerificationBullet"
  - "evidenceSources"
  - "docsImpactDeclaration"
  - "collectCoveragePatterns"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema doc says environment assignments are matched by the allowlist, that agents.command is trusted like the allowlist, that only change entries cover a path under any, and what adopt ignores and leaves out of its proposed allowlist."
  docs:
    - "docs/SCHEMA.md"
commits: []
related:
  - "0135"
  - "0143"
  - "0144"
  - "0131"
release: "v0.8.1"
---

# 0154: Tighten Adoption, Docs Impact, And Verification Trust

## Summary

`verify --run` matches the whole backticked command against
`verification.allow`, environment assignments included, so a receipt can no
longer set `NODE_OPTIONS` or `PATH` on an allowlisted command; this
repository's allowlist names `LEDGER_UPDATE_CONTRACT=1 npx vitest **` for
the contract bullets. Docs impact treats a placeholder reason as unreviewed
whatever the status, normalizes each entry once instead of once per changed
file, and names its earlier-receipt list `earlierEvidenceFiles`, so it no
longer shares a name, with the opposite meaning, with coverage's
`historicalFiles`. Only change entries cover a path: coverage under `any`
no longer accepts session records, which expire and are pruned, or backlog
items and decisions, which matches docs impact. `ledger ci` annotations and
the job summary drop "in this change set" under `any`. `adopt` ignores
`vendor/` at any depth and never makes it a coverage root, ignores build
output inside packages, proposes no Make targets or npm scripts that reset,
migrate, format, serve, start, or watch, caps npm scripts at forty, and
loses an unused extension list and command option. `docs reconcile` refuses
a routing path it cannot read, such as a directory or symlink, even with
`--force`, instead of failing with a raw system error.

## Why

The 0.8.0 audit demonstrated each problem: `NODE_OPTIONS=--require=./evil.js
npm test` passed the allowlist; a `status: updated` receipt with the
template's TODO reason satisfied docs impact under `any`; a session record
passed coverage while docs impact failed the same file, and would fail
coverage once pruned; a committed Go `vendor/` tree became a coverage root;
a monorepo's `packages/a/dist` needed receipts; adopt proposed `make
db-reset` and `npm run start:prod`; docs impact under `any` took 35 times
longer than `current` on this catalog; and `docs reconcile` crashed with
`ELOOP` on a symlinked START_HERE. Rewriting the allowlist when
`agents.command` changes was rejected again: both keys live in the same
reviewed file, so the command is trusted as far as the allowlist is, and the
schema doc now says so.

## Changed Files

### Verification

- Files: `src/verify.ts`, `test/verify.test.ts`, `.ledger/config.yaml`
- Changed: `parseVerificationBullet` checks the full word list, and the
  `agents.command` form keeps its environment words; tests reject
  `NODE_OPTIONS`, `PATH`, and a different value of a named variable.
- Anchor: `parseVerificationBullet`, `LEDGER_UPDATE_CONTRACT=1 npx vitest **`
- On conflict: The allowlist bounds the whole command, environment included.

### Docs impact, coverage, and CI

- Files: `src/docsImpact.ts`, `src/coverage.ts`, `src/ci.ts`, `src/types.ts`,
  `src/operations/definitions/changes.ts`,
  `test/fixtures/operations-contract.json`, `test/docsImpact.test.ts`,
  `test/coverage.test.ts`, `test/ci.test.ts`
- Changed: `evidenceSources` reads each entry once; `docsImpactDeclaration`
  checks the reason for every status; `earlierEvidenceFiles` and
  `earlierEvidence` replace `historicalFiles` and `historical` in the docs
  impact output, the only contract change; `collectCoveragePatterns` skips
  records that are not change entries; `docsImpactScope` words annotations
  by mode; the coverage help says `any` accepts change entries.
- Anchor: `evidenceSources`, `earlierEvidenceFiles`, `collectCoveragePatterns`, `docsImpactScope`
- On conflict: Coverage and docs impact read the same set of records.

### Adoption and docs reconcile

- Files: `src/toolchain.ts`, `src/docs.ts`,
  `src/operations/definitions/docs.ts`, `test/toolchain.test.ts`,
  `test/operations.test.ts`, `docs/SCHEMA.md`
- Changed: `vendorDirectory` is ignored recursively and skipped as a root;
  build output directories get both ignore forms unless tracked at the top
  level; `isDeniedCommandName` also rejects `deniedCommandSegments`;
  `maxNpmScripts` caps proposals; `codeExtensions` and
  `ToolchainDetectionOptions` are gone; an unreadable routing file is refused
  with reason `unreadable`, which `--force` does not override.
- Anchor: `vendorDirectory`, `deniedCommandSegments`, `maxNpmScripts`, `unreadable`
- On conflict: Adopt proposes only read-only checks; never write through a
  path Ledger cannot read.

## Behavior And UX Impact

A receipt bullet that sets an environment variable runs only when the
allowlist names that assignment, so repositories whose receipts set one need
a pattern for it. Adopted Go and monorepo repositories stop requiring
receipts for vendored and built files. Adopters see CI messages that match
their coverage mode. The docs impact JSON field is renamed.

## Invariants

- A verification command runs only when a pattern matches every word of it,
  environment assignments included.
- A docs impact declaration with a placeholder reason is never evidence.
- Only change entries cover a path, in both coverage modes.
- Adopt never proposes a command that resets, migrates, formats, serves, or
  watches.
- `docs reconcile` never writes through an unreadable routing path.

## Verification

- `npx vitest run test/toolchain.test.ts test/docsImpact.test.ts test/ci.test.ts test/verify.test.ts test/coverage.test.ts test/operations.test.ts test/workspace.test.ts test/docs.test.ts test/workflows.test.ts test/doctor.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`, with the
  contract diff limited to the docs impact field rename
- `npm run typecheck`
- `npm run ci`

## Notes

Found by the 0.8.0 audit. Whether `git.coverage: any` should let one broad
pattern such as `src/**` in an old receipt satisfy every future change under
it is a policy question left for a decision.
