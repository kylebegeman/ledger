---
id: "0050"
kind: "change"
title: "Dogfood-driven Ledger adoption improvements"
date: "2026-06-30"
updated: "2026-06-30"
status: "landed"
areas:
  - "cli"
  - "migration"
  - "validation"
  - "docs"
files:
  - ".ledger/config.yaml"
  - ".ledger/templates/product-note.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/PRODUCT.md"
  - "docs/ROADMAP.md"
  - "docs/SCHEMA.md"
  - "package.json"
  - "package-lock.json"
  - "src/ci.ts"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/coverage.ts"
  - "src/docs.ts"
  - "src/documents.ts"
  - "src/indexer.ts"
  - "src/migrate.ts"
  - "src/newEntry.ts"
  - "src/query.ts"
  - "src/render.ts"
  - "src/types.ts"
  - "src/validate.ts"
  - "src/workspace.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/coverage.test.ts"
  - "test/migrate.test.ts"
  - "test/render.test.ts"
  - "test/validate.test.ts"
symbols:
  - "ledger migrate changelog"
  - "ledger feedback"
  - "ledger agents"
  - "ledger validate --current-only"
  - "schema.extensions"
  - "migrateChangelog"
  - "LedgerCoverageFile"
  - "buildStaticReaderModel"
  - "status: historical"
docs:
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/PRODUCT.md"
  - "docs/ROADMAP.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
commits: []
release: "v0.1.12"
---

# 0050: Dogfood-driven Ledger adoption improvements

## Summary

Added the dogfood-driven adoption path Ledger needed after the Lumen migration:
scoped package metadata, legacy changelog migration, historical validation noise
controls, glob/prefix coverage, partial docs adoption, schema extensions, richer
reader filters, agent instructions, and first-class product-note records.

## Why

The Lumen migration exposed real adoption friction that small sample ledgers did
not show: install paths were unclear, hundreds of old Markdown records needed a
safe importer, historical missing file references overwhelmed validation, and
established docs trees needed routing/impact support without wholesale takeover.
These changes make Ledger viable for mature repos while preserving strictness for
current work.

## Changed Files

### Package distribution

- What changed: Renamed the npm package to `@kylebegeman/ledger`, added public
  publish metadata, `prepare`, and `release:build`, then refreshed the lockfile.
- Files: `package.json`, `package-lock.json`, `README.md`
- On conflict: Preserve the scoped package name and build-before-pack behavior.

### Migration and adoption commands

- What changed: Added `ledger migrate changelog <dir>`, `ledger adopt`,
  `ledger init --migrate`, `ledger agents`, and `ledger feedback`.
- Files: `src/cli.ts`, `src/migrate.ts`, `src/newEntry.ts`, `src/workspace.ts`
- On conflict: Keep migration receipts, duplicate-ID suggestions, optional docs
  rewrites, and partial docs adoption defaults.

### Validation and schema model

- What changed: Added product-note/feedback document kinds, `status:
  historical`, `staleRefs`, validation baselines, current-only validation, and
  typed project schema extensions.
- Files: `src/types.ts`, `src/config.ts`, `src/documents.ts`, `src/validate.ts`,
  `src/ci.ts`, `.ledger/config.yaml`
- On conflict: Historical records should stay queryable while missing path
  warnings remain focused on current records.

### Coverage and reader scale

- What changed: Entry `files` now support exact paths, glob patterns, and
  `prefix:`/`glob:` forms; coverage output includes per-file explanations; the
  static reader gained filters for warnings, duplicate IDs, missing refs,
  coverage status, kind, tags, and Markdown source links.
- Files: `src/coverage.ts`, `src/indexer.ts`, `src/query.ts`, `src/render.ts`
- On conflict: Preserve exact-path behavior and only use broad patterns when
  entries intentionally describe large or generated surfaces.

### Documentation and tests

- What changed: Updated README and durable docs for scoped package usage,
  migration/adoption, product notes, historical validation controls, coverage
  patterns, and schema extensions. Added targeted tests for migration,
  validation noise controls, coverage patterns, reader filters, and CLI
  ergonomics.
- Files: `docs/*.md`, `test/*.test.ts`, `.ledger/templates/product-note.md`
- On conflict: Keep docs aligned with the implemented CLI flags and config
  names.

## Behavior And UX Impact

Users can now run `pnpm dlx @kylebegeman/ledger`, adopt Ledger in existing repos,
migrate old Markdown changelogs with receipts, suppress historical validation
noise without deleting context, capture product feedback separately from change
receipts, and inspect large ledgers with focused static-reader filters.

## Invariants

- Markdown remains the source of truth for Ledger records.
- Duplicate IDs remain validation errors for active Ledger documents.
- Historical records remain queryable even when stale path warnings are
  suppressed.
- Broad coverage patterns are opt-in through entry `files`, not inferred during
  validation.
- Partial docs adoption must not imply Ledger owns every file under `docs/`.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- `node dist/cli.js ci`
- `npm run release:build`
- `npm publish --dry-run --access public`

## Notes

The first real npm publish attempt under `@kylebegeman/ledger` reached the
registry but was blocked by npm write-time 2FA (`EOTP`). The account uses a
passkey, but the npm CLI publish flow still requires an `--otp` value or a
granular access token with bypass 2FA enabled.

`@kylebegeman/ledger@0.1.10` was published, but npm's symlinked bin invocation
exposed an ESM entrypoint guard bug. `0.1.11` fixed that invocation path, and
`0.1.12` republished the package with the canonical `kylebegeman/ledger`
repository metadata after the GitHub account rename.
README npm examples use `npm exec --package`/`npx --package` because direct
`npx @scope/package` does not reliably infer the `ledger` binary for scoped
packages.
