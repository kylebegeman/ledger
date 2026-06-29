---
id: "0015"
kind: "change"
title: "Add CLI fixture workflow tests"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "tests", "quality"]
files:
  - "src/newEntry.ts"
  - "test/cliE2e.test.ts"
symbols:
  - "captureRun"
  - "renderTemplate"
docs:
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0015: Add CLI Fixture Workflow Tests

## Summary

Adds an end-to-end CLI test that runs a complete Ledger workflow in a temporary
workspace: init, new, validate, index, render, query, docs classify, and CI.

## Why

Unit tests cover core modules, but the public product is the CLI. Before v0.1,
Ledger needs at least one real workflow test that proves the commands work
together against the filesystem.

## Changed Files

### src/newEntry.ts

- What changed: Keeps YAML quotes around template placeholders when rendering
  new entries.
- Anchor: `renderTemplate`
- On conflict: Preserve quoted string frontmatter so numeric-looking IDs remain
  strings after YAML parsing.

### test/cliE2e.test.ts

- What changed: Adds a temporary-workspace CLI workflow test that calls `run()`
  directly and captures console output.
- Anchor: `CLI end-to-end`
- On conflict: Keep this test focused on command integration. Detailed policy
  behavior belongs in narrower module tests.

## Behavior And UX Impact

The test suite now catches regressions where individual modules still pass but
the CLI workflow breaks across workspace discovery, file writing, indexing, and
rendering.

## Invariants

- The fixture creates no persistent files outside the OS temp directory.
- The test restores the original working directory.
- The workflow includes generated index and render output checks.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js ci`
- `node dist/cli.js coverage`

## Notes

Future end-to-end tests can cover staged Git diffs and release file writing.
