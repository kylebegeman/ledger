---
id: "0056"
kind: "change"
title: "CLI search, performance metrics, and template renderer"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "cli"
  - "performance"
  - "render"
  - "templates"
files:
  - ".ledger/config.yaml"
  - ".ledger/entries/0015-cli-fixture-workflow-tests.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/doctor.ts"
  - "src/index.ts"
  - "src/newEntry.ts"
  - "src/performance.ts"
  - "src/search.ts"
  - "src/template.ts"
  - "src/types.ts"
  - "src/workspace.ts"
  - "test/cliE2e.test.ts"
  - "test/config.test.ts"
  - "test/doctor.test.ts"
  - "test/performance.test.ts"
  - "test/search.test.ts"
  - "test/template.test.ts"
symbols:
  - "LedgerPerformanceResult"
  - "measureLedgerPerformance"
  - "searchLedgerDocuments"
  - "searchLedgerIndex"
  - "renderLedgerTemplate"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Documented terminal search, metrics, performance budgets, and reusable template rendering behavior."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/IMPLEMENTATION_PLAN.md"
    - "docs/SCHEMA.md"
backlog:
  - "B005"
  - "B006"
commits: []
---

# 0056: CLI Search, Performance Metrics, And Template Renderer

## Summary

Added terminal weighted search, core pipeline performance metrics, doctor
performance warnings, and a typed template renderer for entry creation.

## Why

The static reader already had a compact weighted search index, but terminal
users and agents still had to rely on metadata filters or browser output for
ranked retrieval. The Ledger pipeline also needed explicit latency budgets so
growth in parsing, validation, indexing, reader-model generation, or search
scoring is visible before it becomes normal. Entry creation used ad hoc string
replacement, which made future template changes harder to reason about.

## Changed Files

### src/search.ts and src/cli.ts

- What changed: Added shared weighted fuzzy search helpers and `ledger search
  <query> [--limit] [--json]`.
- Anchor: `searchLedgerDocuments`, `searchLedgerIndex`, `searchCommand`
- On conflict: Keep CLI ranking aligned with the static reader search fields and
  avoid adding a separate search payload shape.

### src/performance.ts, src/doctor.ts, src/config.ts, src/types.ts, src/workspace.ts, .ledger/config.yaml

- What changed: Added `performance.budgets`, `ledger metrics`, and a doctor
  performance check covering read, validate, index, render-model, and search.
- Anchor: `measureLedgerPerformance`, `performanceCheck`, `maxSearchMs`
- On conflict: Performance failures should remain warnings in doctor, while
  `ledger metrics` exits non-zero when a configured budget is exceeded.

### src/template.ts, src/newEntry.ts, and .ledger/entries/0015-cli-fixture-workflow-tests.md

- What changed: Replaced local entry-template replacement with a typed renderer
  that separates scalar values, YAML arrays, and body blocks. Updated an older
  Ledger symbol anchor from the removed local helper to the new renderer.
- Anchor: `renderLedgerTemplate`, `yamlStringArray`
- On conflict: Preserve existing default template substitutions, especially
  status overrides, empty arrays, and changed-file block replacement.

### README.md, docs/ARCHITECTURE.md, docs/IMPLEMENTATION_PLAN.md, docs/SCHEMA.md

- What changed: Documented terminal search, metrics, performance budgets, and
  architecture implications.
- Anchor: `ledger search`, `ledger metrics`, `performance.budgets`
- On conflict: Keep command documentation consistent with CLI help.

### test/*.test.ts

- What changed: Added focused coverage for search ranking, performance metrics,
  template rendering, config validation, doctor checks, and CLI workflow wiring.
- Anchor: `test/search.test.ts`, `test/performance.test.ts`,
  `test/template.test.ts`
- On conflict: Keep module tests narrow and E2E tests limited to command wiring.

## Behavior And UX Impact

Humans and agents can now search the Ledger catalog from the terminal with the
same weighted ranking used by the static reader. Maintainers can run
`ledger metrics` or `ledger doctor` to spot latency growth, and new workspaces
include configurable performance budgets. Entry creation behavior should remain
unchanged, but its templating path is easier to extend safely.

## Invariants

- `ledger search` and static reader search must share the same field weights.
- `ledger metrics --json` must return measured steps and budget status.
- `ledger doctor` should warn, not fail, when performance budgets are exceeded.
- Entry templates must keep existing scalar, YAML array, and changed-file block
  substitutions.

## Verification

- `npm run typecheck`
- `npm test -- --run test/search.test.ts test/performance.test.ts test/template.test.ts test/config.test.ts test/doctor.test.ts test/cliE2e.test.ts`
- `npm run ci`
- `node dist/cli.js metrics --json`
- `node dist/cli.js search metrics --limit 3`
- `node dist/cli.js stale --json`
- `node dist/cli.js doctor`

## Notes

This slice lands the terminal and core-budget foundation. Later work can add
metrics history, per-command budget reports, and richer static search result
pages without changing the source record format.
