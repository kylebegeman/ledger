---
id: "0011"
kind: "change"
title: "Add CI summary command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "ci", "automation", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/ci.ts"
  - "src/cli.ts"
  - "src/index.ts"
  - "test/ci.test.ts"
symbols:
  - "runCiChecks"
  - "ciCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["807e8d9"]
---

# 0011: Add CI Summary Command

## Summary

Adds `ledger ci [--staged] [--json]` for running the core Ledger guard set in
one command. The command composes validation, docs reference audit, Git coverage,
and docs impact into a compact pass/fail summary for humans or a nested JSON
result for automation.

## Why

The individual commands are useful during development, but CI and agents need a
single command that answers whether the Ledger catalog is healthy. This command
packages the existing checks without hiding their detailed outputs or changing
their underlying policies.

## Changed Files

### src/ci.ts

- What changed: Adds `runCiChecks` and the CI result model.
- Anchor: `runCiChecks`
- On conflict: Keep CI as composition of existing deterministic checks. Do not
  duplicate validation, docs, coverage, or docs impact rules locally.

### src/cli.ts

- What changed: Adds `ledger ci [--staged] [--json]` and writes generated
  validation, docs audit, and docs impact reports while running.
- Anchor: `ciCommand`
- On conflict: Preserve `--staged` as the mode that applies to Git coverage and
  docs impact together.

### src/index.ts

- What changed: Exports the CI helper API from the library entrypoint.
- Anchor: `export * from "./ci.js"`
- On conflict: Keep the CI result model importable for GitHub Actions and other
  automation.

### test/ci.test.ts

- What changed: Adds coverage for passing CI results and validation failures.
- Anchor: `runCiChecks`
- On conflict: Keep CI tests focused on summary composition; lower-level policy
  behavior belongs in the individual command tests.

### README.md and docs/*

- What changed: Documents `ledger ci` and its relationship to the individual
  guard commands.
- Anchor: `ledger ci`
- On conflict: Keep `ledger ci` described as a summary command, not a replacement
  for the detailed subcommands.

## Behavior And UX Impact

Users and CI systems can run one Ledger command before merging work. Agents can
request JSON and decide which detailed command output to inspect when a check
fails.

## Invariants

- `ledger ci` exits non-zero when any included check fails.
- `ledger ci --json` preserves the nested check results.
- `--staged` applies consistently to coverage and docs impact.
- Generated reports remain under `.ledger/reports`.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js docs impact --check`
- `node dist/cli.js ci`
- `node dist/cli.js ci --json`

## Notes

Later CI work can add GitHub annotations, pull request comments, and package
version guards on top of this result model.
