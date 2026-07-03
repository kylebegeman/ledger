---
id: "0057"
kind: "change"
title: "Command result model extraction"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "cli"
  - "architecture"
  - "tests"
files:
  - ".ledger/entries/0057-command-result-model-extraction.md"
  - "src/cli.ts"
  - "src/commands/index.ts"
  - "src/commands/metrics.ts"
  - "src/commands/search.ts"
  - "src/index.ts"
  - "test/commands.test.ts"
symbols:
  - "runLedgerSearchCommand"
  - "formatLedgerSearchResult"
  - "runLedgerMetricsCommand"
  - "formatLedgerMetricsResult"
docs: []
docsImpact:
  status: "not-needed"
  reason: "Internal command extraction only; existing README command behavior remains unchanged."
commits: []
backlog:
  - "B005"
---

# 0057: Command Result Model Extraction

## Summary

Extracted `ledger search` and `ledger metrics` behavior into reusable command
modules with result models and formatters.

## Why

B005 calls for command behavior that can be tested through command modules or
canonical result models without intercepting `console`. Search and metrics were
good first candidates because they already had stable data models and compact
CLI surfaces.

## Changed Files

### src/commands/search.ts and src/commands/metrics.ts

- What changed: Added reusable command runners and formatters for search and
  metrics.
- Anchor: `runLedgerSearchCommand`, `runLedgerMetricsCommand`
- On conflict: Keep command modules free of process-level concerns like cwd
  discovery and stdout.

### src/cli.ts and src/index.ts

- What changed: Delegated search and metrics CLI behavior to command modules
  and exported those modules through the package entrypoint.
- Anchor: `searchCommand`, `metricsCommand`
- On conflict: Preserve current JSON output shapes for the CLI.

### test/commands.test.ts

- What changed: Added direct tests for search and metrics result models without
  capturing console output.
- Anchor: `command result models`
- On conflict: Keep these tests focused on command-layer behavior; CLI tests
  should only prove wiring.

## Behavior And UX Impact

Users should see the same `ledger search` and `ledger metrics` output. Library
callers and future MCP/report adapters can reuse the command result models
directly.

## Invariants

- Search and metrics CLI output must stay backed by the same command result
  models that direct tests exercise.
- Command runners should receive a resolved workspace rather than performing cwd
  discovery themselves.

## Verification

- `npm test -- --run test/commands.test.ts test/cliE2e.test.ts test/cliHelp.test.ts`
- `npm run typecheck`

## Notes

This establishes the extraction pattern. Older commands can move gradually
without a broad CLI rewrite.
