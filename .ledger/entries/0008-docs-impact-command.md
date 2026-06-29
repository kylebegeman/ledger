---
id: "0008"
kind: "change"
title: "Add docs impact command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "docs", "impact", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/docsImpact.ts"
  - "src/index.ts"
  - "src/types.ts"
  - "test/docsImpact.test.ts"
symbols:
  - "buildDocsImpact"
  - "formatDocsImpactReport"
  - "docsImpactCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
release: "v0.1.1"
commits: ["9ad3073"]
---

# 0008: Add Docs Impact Command

## Summary

Adds `ledger docs impact` for checking whether changed source files have an
explicit docs impact. The command reports changed source files, docs files,
Ledger files, changed Ledger entries, docs referenced by those entries, and
source files that still lack any docs impact.

## Why

Ledger should help teams keep durable docs aligned with implementation changes
without pretending it can automatically rewrite every doc correctly. A docs
impact command gives agents and CI a concrete guard: source changes should be
paired with a changed docs file or a changed Ledger entry that explains the docs
relationship.

## Changed Files

### src/docsImpact.ts

- What changed: Adds changed-file classification, changed-entry docs reference
  collection, missing-impact detection, and Markdown report rendering.
- Anchor: `buildDocsImpact`
- On conflict: Keep the first strict rule simple and deterministic. Source
  changes need a docs file change or a changed Ledger entry that references
  docs.

### src/cli.ts

- What changed: Adds `ledger docs impact [--staged] [--check] [--json]` under
  the existing docs command group.
- Anchor: `docsImpactCommand`
- On conflict: Preserve the default as report-only. Only `--check` should make
  missing docs impact fail the command.

### src/types.ts

- What changed: Adds the shared `LedgerDocsImpact` result model.
- Anchor: `LedgerDocsImpact`
- On conflict: Keep this model stable enough for CI, MCP tools, and editor
  integrations to consume.

### src/index.ts

- What changed: Exports the docs impact helper API from the library entrypoint.
- Anchor: `export * from "./docsImpact.js"`
- On conflict: Keep docs lifecycle helpers importable without reaching into
  private module paths.

### test/docsImpact.test.ts

- What changed: Adds unit coverage for accepted docs impact, missing docs
  impact, direct docs changes, and report formatting.
- Anchor: `buildDocsImpact`
- On conflict: Keep the strict rule fixture-based and independent from the
  current repository status.

### README.md and docs/*

- What changed: Documents the docs impact command, flags, and product boundary.
- Anchor: `ledger docs impact`
- On conflict: Keep the command described as a reporting and guard tool, not an
  automatic docs writer.

## Behavior And UX Impact

Users can run `ledger docs impact` during development to see whether source
changes have been paired with docs work. CI or agents can use `--check` for a
non-zero exit when source files lack docs impact, while humans can use the
default report mode during active work.

## Invariants

- `ledger docs impact` is read-only except for writing its generated report.
- `--check` is the only mode that fails on missing docs impact.
- Direct docs changes satisfy the docs impact requirement for changed source
  files.
- Changed Ledger entries can satisfy the requirement by referencing docs in
  frontmatter `docs` or `files`.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js docs impact`
- `node dist/cli.js docs impact --json`
- `node dist/cli.js docs impact --check`

## Notes

Later versions can add per-area docs policies, suggested doc targets, and
integration with generated static reports.
