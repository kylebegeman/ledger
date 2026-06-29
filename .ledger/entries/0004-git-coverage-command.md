---
id: "0004"
kind: "change"
title: "Add git coverage command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "git", "coverage", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/coverage.ts"
  - "src/git.ts"
  - "src/index.ts"
  - "src/newEntry.ts"
  - "src/types.ts"
  - "test/coverage.test.ts"
symbols:
  - "checkCoverage"
  - "isCoverageRequired"
  - "matchesGlob"
  - "getChangedFiles"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
commits: ["bf27f82"]
---

# 0004: Add Git Coverage Command

## Summary

Adds `ledger coverage` to compare Git changed files against Ledger entries. The
command uses `git.requireEntryFor` and `git.ignore` config to decide which
changed paths require coverage, supports `--staged`, and can emit JSON for CI or
agent tools. `ledger new --from-diff` now also supports `--staged`.

## Why

Ledger should enforce its own discipline, not only provide templates. A project
needs a narrow guard that answers whether changed source, test, or docs files
have a corresponding Ledger record. Path-based coverage is the pragmatic first
slice before symbol-level or semantic docs-impact checks exist.

## Changed Files

### src/coverage.ts

- What changed: Adds path matching, coverage requirement checks, and changed-file
  to Ledger-entry comparison.
- Anchor: `checkCoverage`
- On conflict: Keep coverage deterministic and config driven. Do not introduce
  AI-generated judgment into this command.

### src/git.ts

- What changed: Adds `staged` support to changed-file detection by reading
  `git diff --name-only --cached`.
- Anchor: `getChangedFiles`
- On conflict: Preserve both staged and working-tree modes.

### src/cli.ts

- What changed: Adds `ledger coverage [--staged] [--json]` and passes
  `--staged` through `ledger new --from-diff`.
- Anchor: `coverageCommand`
- On conflict: Keep the command exit code non-zero when required files are
  missing Ledger coverage.

### src/config.ts and src/types.ts

- What changed: Adds typed `git.requireEntryFor` and `git.ignore` config.
- Anchor: `LedgerConfig`
- On conflict: Keep generated outputs, dependencies, and build output ignored by
  default.

### test/coverage.test.ts

- What changed: Adds glob matching and staged coverage checks against temporary
  Git repositories.
- Anchor: `checkCoverage`
- On conflict: Preserve staged-mode coverage because it is the right CI-friendly
  primitive.

### README.md and docs/*

- What changed: Documents `ledger coverage`, the coverage config, and the
  path-based first-slice behavior.
- Anchor: `Coverage Config`
- On conflict: Keep docs clear that this is path coverage, not semantic symbol
  coverage yet.

## Behavior And UX Impact

Users can now run `ledger coverage` locally or in CI to catch source/test/docs
changes that are not represented by any Ledger entry. `ledger coverage --json`
returns a machine-readable result for automation.

## Invariants

- Coverage is path-based and deterministic.
- Ignored paths do not require Ledger entries.
- `--staged` uses the staged diff.
- Missing required coverage exits non-zero.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js coverage`

## Notes

Future work can add symbol extraction and docs-impact coverage on top of this
path-based guard.
