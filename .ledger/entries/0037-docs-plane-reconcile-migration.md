---
id: "0037"
kind: "change"
title: "Expand docs plane reconcile and migration reports"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "cli", "reports", "tests"]
files:
  - ".gitignore"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/docs.ts"
  - "src/types.ts"
  - "test/docs.test.ts"
  - ".ledger/entries/0037-docs-plane-reconcile-migration.md"
symbols:
  - "writeDocsStartHere"
  - "writeDocsMigrationReport"
  - "docsMigrateCommand"
  - "formatDocsStartHere"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
---

# 0037: Expand Docs Plane Reconcile And Migration Reports

## Summary

Extends the managed docs plane so `ledger docs reconcile` writes both the docs
routing manifest and `docs/llm/START_HERE.md`, and adds `ledger docs migrate`
to generate cleanup guidance for docs folders.

## Why

Ledger should help maintain the agent-facing docs plane without replacing full
documentation. Generated routing and migration reports give agents and
maintainers a consistent map of durable, scratch, generated, unknown, missing,
and unreferenced docs.

## Changed Files

### src/docs.ts and src/types.ts

- What changed: Adds scratch/generated/unknown audit fields, START_HERE
  generation, and docs migration report generation.
- Anchor: `writeDocsStartHere`
- On conflict: Keep generated routing and migration artifacts derived from the
  docs audit.

### src/cli.ts

- What changed: Updates `docs reconcile` to write START_HERE and adds
  `docs migrate`.
- Anchor: `docsMigrateCommand`
- On conflict: Preserve read-only source behavior; these commands should only
  write generated routing and report files.

### test/docs.test.ts

- What changed: Adds coverage for the expanded audit fields, START_HERE output,
  and migration reports.
- Anchor: `formatDocsMigrationReport`
- On conflict: Keep fixture docs broad enough to exercise every classification.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents the docs-plane reconcile and migration workflows.
- Anchor: `Docs Relationship`
- On conflict: Keep the boundary clear that Ledger helps route and audit docs,
  not replace durable documentation.

### .gitignore

- What changed: Ignores generated `docs/llm/START_HERE.md`.
- Anchor: `docs/llm/START_HERE.md`
- On conflict: Keep generated docs routing files out of source commits.

## Behavior And UX Impact

Projects can regenerate agent routing docs and get docs cleanup guidance with
first-class commands.

## Invariants

- Durable docs prose is not rewritten by docs-plane commands.
- Generated docs routing files come from the current docs audit.
- Migration reports are advisory and non-blocking.

## Verification

- `npm run typecheck`
- `npx vitest run test/docs.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js docs reconcile`
- `node dist/cli.js docs migrate`

## Notes

Future docs work can add durable docs frontmatter conventions and stricter
policy levels for stale scratchpads.
