---
id: "0005"
kind: "change"
title: "Add query and agent explain output"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "query", "agents", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/query.ts"
  - "test/query.test.ts"
symbols:
  - "queryDocuments"
  - "getSectionBody"
  - "extractBullets"
  - "printAgentExplanation"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0005: Add Query And Agent Explain Output

## Summary

Adds `ledger query` for filtering records by kind, status, and area. Expands
`ledger explain` with `--json` for tool output and `--agent` for compact
invariants plus verification context.

## Why

Ledger needs to be useful to both humans and agents. The initial explain output
was enough to prove file lookup, but agents need compact task context and tools
need JSON. A small query layer also gives maintainers and future MCP tools a
stable way to filter the catalog without reading every Markdown file.

## Changed Files

### src/query.ts

- What changed: Adds normalized document filtering plus helpers for extracting
  section bodies and bullet lists.
- Anchor: `queryDocuments`
- On conflict: Keep query logic free of CLI formatting so it remains reusable by
  future MCP and editor integrations.

### src/cli.ts

- What changed: Adds `ledger query`, `ledger explain --json`, and
  `ledger explain --agent`.
- Anchor: `queryCommand`
- On conflict: Preserve separate human, JSON, and agent output modes.

### test/query.test.ts

- What changed: Adds focused coverage for query filtering and section helper
  behavior.
- Anchor: `queryDocuments`
- On conflict: Keep tests independent from filesystem fixtures.

### README.md and docs/*

- What changed: Documents the query command and explain output modes.
- Anchor: `ledger query`
- On conflict: Keep `--json` described as tool-oriented and `--agent` described
  as compact context, not a replacement for full records.

## Behavior And UX Impact

Users can list matching Ledger records with `ledger query`. Agents can request
focused file context with `ledger explain <path> --agent`, and automation can
use `--json`.

## Invariants

- Query filtering works by normalized Ledger metadata.
- JSON output remains parseable.
- Agent output includes invariants and verification when present.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js explain docs/DOCS_RELATIONSHIP.md --agent`
- `node dist/cli.js query --kind change --area cli --json`

## Notes

Future work should extend query filters to releases, decisions, backlog links,
and docs references.
