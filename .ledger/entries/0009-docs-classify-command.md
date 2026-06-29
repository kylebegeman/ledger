---
id: "0009"
kind: "change"
title: "Add docs classify command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "docs", "agents", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/docs.ts"
  - "test/docs.test.ts"
symbols:
  - "classifyDocsPaths"
  - "docsClassifyCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0009: Add Docs Classify Command

## Summary

Adds `ledger docs classify [path...] [--json]` for exposing Ledger's docs
lifecycle classifier directly through the CLI. With paths, it classifies only
those targets. Without paths, it discovers and classifies the configured docs
root.

## Why

Agents need a small command that can answer whether a document is durable truth,
agent routing material, temporary scratch work, generated output, or unknown.
The full docs audit is useful for reports, but a direct classifier is better for
routing decisions and lightweight checks.

## Changed Files

### src/docs.ts

- What changed: Adds `classifyDocsPaths` as a reusable helper around the
  existing docs classifier.
- Anchor: `classifyDocsPaths`
- On conflict: Keep this helper a pure classifier with no filesystem reads.

### src/cli.ts

- What changed: Adds `ledger docs classify [path...] [--json]` under the docs
  command group.
- Anchor: `docsClassifyCommand`
- On conflict: Preserve the no-path behavior as docs-root discovery and the
  explicit-path behavior as pure classification.

### test/docs.test.ts

- What changed: Adds coverage for explicit path-list classification.
- Anchor: `classifyDocsPaths`
- On conflict: Keep tests focused on classification semantics, not CLI output
  formatting.

### README.md and docs/*

- What changed: Documents the classify command and its routing use case.
- Anchor: `ledger docs classify`
- On conflict: Keep classify described as read-only routing context, not a docs
  migration or rewrite command.

## Behavior And UX Impact

Users and agents can classify docs paths directly without generating a full
audit report. The command supports JSON output for future editor, MCP, and CI
integrations.

## Invariants

- `ledger docs classify` is read-only.
- Explicit paths are classified without requiring the files to exist.
- No-path mode uses the configured docs root.
- JSON output preserves the same file shape used by docs audit.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js docs classify`
- `node dist/cli.js docs classify docs/ARCHITECTURE.md docs/llm/START_HERE.md --json`

## Notes

Later docs migration reports can reuse the same classifier as their first pass.
