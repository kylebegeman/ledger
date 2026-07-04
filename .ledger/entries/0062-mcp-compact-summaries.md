---
id: "0062"
kind: "change"
title: "MCP compact summaries"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "mcp"
  - "agents"
  - "token-efficiency"
files:
  - ".ledger/entries/0062-mcp-compact-summaries.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/mcp.ts"
  - "test/mcp.test.ts"
symbols:
  - "runLedgerMcpTool"
  - "summary"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Documented compact MCP response summaries for agent token efficiency."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0062: MCP Compact Summaries

## Summary

Added top-level `summary` objects to all MCP tool JSON payloads while preserving
existing detailed fields.

## Why

B005 prioritizes short JSON summaries for MCP calls before full Markdown or
detailed payloads. Agents should be able to inspect counts, status, budget, and
write-output metadata before deciding whether to spend context on full results.

## Changed Files

### src/mcp.ts

- What changed: Added compact summary metadata to validation, query, explain,
  conflict, packet, docs-impact, and integrity MCP payloads.
- Anchor: `runLedgerMcpTool`
- On conflict: Preserve existing top-level detailed fields for compatibility.

### test/mcp.test.ts

- What changed: Asserted summary metadata alongside existing detailed payload
  assertions.
- Anchor: `payload.summary`
- On conflict: Keep tests proving old detailed fields remain available.

### README.md and docs/ARCHITECTURE.md

- What changed: Documented the MCP summary contract.
- Anchor: `MCP`
- On conflict: Keep agent-facing docs focused on token-efficient inspection.

## Behavior And UX Impact

MCP clients receive compact summary metadata first while keeping the same full
payload fields they had before. This helps agents decide when to stop after a
count/status signal and when to inspect details.

## Invariants

- Existing MCP detailed fields remain available.
- Every MCP tool payload includes a top-level `summary` object.
- Packet summaries include token budget and truncation metadata.

## Verification

- `npm test -- --run test/mcp.test.ts`
- `npm run typecheck`

## Notes

This is an additive payload change. A future MCP version could expose explicit
summary-only flags if clients need even smaller payloads.
