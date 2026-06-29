---
id: "0006"
kind: "change"
title: "Add conflict assistant command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "conflict", "agents", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/conflict.ts"
  - "src/index.ts"
  - "test/conflict.test.ts"
symbols:
  - "buildConflictTargets"
  - "extractConflictRules"
  - "conflictCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0006: Add Conflict Assistant Command

## Summary

Adds `ledger conflict <path...>` for retrieving merge-conflict guidance tied to
the files a user or agent is resolving. The command can print human-readable
guidance or emit JSON for merge tooling and agent workflows.

## Why

Ledger entries already capture `On conflict` notes, invariants, and verification
commands, but those details were only useful if someone manually opened the
right entry. A dedicated command turns that history into a targeted assistant
view during rebases, upstream merges, and conflict repair.

## Changed Files

### src/conflict.ts

- What changed: Adds conflict-target construction and extraction for wrapped
  `On conflict` notes from changed-file bullets.
- Anchor: `buildConflictTargets`
- On conflict: Keep this module free of CLI formatting so MCP tools, editor
  integrations, and future merge drivers can reuse the same model.

### src/cli.ts

- What changed: Adds `ledger conflict <path...> [--json]` and human output that
  includes matching entries, matched files, conflict rules, invariants, and
  verification.
- Anchor: `conflictCommand`
- On conflict: Preserve the read-only behavior and keep missing matches as a
  successful empty result, not a validation failure.

### src/index.ts

- What changed: Exports the conflict helper API from the library entrypoint.
- Anchor: `export * from "./conflict.js"`
- On conflict: Keep public exports explicit so downstream tools can import the
  conflict model without reaching into private paths.

### test/conflict.test.ts

- What changed: Adds unit coverage for wrapped rule extraction and conflict
  target assembly.
- Anchor: `extractConflictRules`
- On conflict: Keep tests fixture-based and independent from a real Git repo.

### README.md and docs/*

- What changed: Documents the conflict command in first-run examples,
  architecture notes, and the implementation plan.
- Anchor: `ledger conflict`
- On conflict: Keep the command framed as file-specific merge guidance, not a
  generic documentation search command.

## Behavior And UX Impact

Users and agents can ask Ledger what to preserve for a conflicted path before
editing it. JSON output gives future automation a stable shape for merge tools
without changing the Markdown source format.

## Invariants

- `ledger conflict` is read-only.
- Missing matches exit successfully and report an empty guidance set.
- Conflict guidance comes from source Ledger documents and remains useful when
  generated indexes are absent.
- The same conflict model is available from the library export.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js conflict src/cli.ts`
- `node dist/cli.js conflict src/cli.ts --json`

## Notes

Later versions can index conflict rules directly and add merge-driver or editor
integrations on top of the same normalized model.
