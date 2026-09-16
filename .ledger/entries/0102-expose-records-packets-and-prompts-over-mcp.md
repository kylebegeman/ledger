---
id: "0102"
kind: "change"
title: "Expose records, packets, and prompts over MCP"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "mcp"
  - "agents"
files:
  - "src/mcp.ts"
  - "test/mcpResources.test.ts"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "createLedgerMcpServer"
  - "ledgerMcpResourceUris"
  - "mcpPacketBudgetTokens"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture MCP section and the README describe the resources and prompts the server now exposes."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
  - "0099"
release: "v0.5.0"
---

# 0102: Expose Records, Packets, And Prompts Over MCP

## Summary

The MCP server registers three resources and two prompts alongside its
tools. `ledger://records/{id}` lists every record in the catalog and reads its
raw Markdown; `ledger://packet/{path}` returns a token-bounded handoff packet
for a URL-encoded project path; `ledger://contract` returns the operations
contract as JSON. The `ledger_agent_instructions` prompt renders the role
instructions from `ledger agents` for the configured project, and
`ledger_handoff` wraps the packet for a path in a message an agent can read
before editing. Both transports share the registration, so stdio clients and
engine `/mcp` clients see the same surface.

## Why

Decision D005's MCP v2 slice lists resources and prompts so agents can browse
records natively instead of calling tools for everything, and so hosts that
support prompts get Ledger's operating instructions without paste. Reads go
through the catalog cache, so listing and reading stay cheap.

## Changed Files

### MCP server

- File: `src/mcp.ts`
- Changed: `registerLedgerResources` and `registerLedgerPrompts` run inside
  `createLedgerMcpServer`; `ledgerMcpResourceUris` and
  `mcpPacketBudgetTokens` are exported.
- Anchor: `registerLedgerResources`
- On conflict: Keep resource URIs stable; record ids and packet paths are
  URL-encoded in URIs.

### Tests and docs

- Files: `test/mcpResources.test.ts`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: tests connect an SDK client over an in-memory transport and cover
  listing, reading, unknown ids, packets, the contract, and both prompts.
- Anchor: `MCP resources and prompts`
- On conflict: The packet resource uses the default budget; the handoff prompt
  accepts a string budget because MCP prompt arguments are strings.

## Behavior And UX Impact

MCP hosts can list Ledger records as resources, open one by id, fetch a
handoff packet for a file, read the operations contract, and use the two
prompts. Tools are unchanged.

## Invariants

- Resource reads never mutate records or generated files.
- The handoff prompt and the packet resource render the same packet format as
  `ledger packet`.

## Verification

- `npm test` (42 files, 235 tests)
- `npm run ci`

## Notes

Milestone four of 0.5. Multi round-trip confirmation, the Tasks extension, and
list caching TTLs wait for an SDK that implements the 2026-07-28 protocol; the
installed SDK speaks 2025-11-25.
