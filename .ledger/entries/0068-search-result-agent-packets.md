---
id: "0068"
kind: "change"
title: "Search result agent packets"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "agents"
  - "search"
  - "cli"
  - "mcp"
  - "docs"
files:
  - ".ledger/entries/0068-search-result-agent-packets.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/commands/index.ts"
  - "src/commands/searchPacket.ts"
  - "src/index.ts"
  - "src/mcp.ts"
  - "src/packet.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/commands.test.ts"
  - "test/mcp.test.ts"
  - "test/packet.test.ts"
  - "test/publicApi.test.ts"
symbols:
  - "buildSearchAgentPacket"
  - "runLedgerSearchPacketCommand"
  - "formatLedgerSearchPacketResult"
  - "ledger_search_packet"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "Documented search-packet CLI usage, the MCP search packet tool, and the implementation-plan command surface."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/IMPLEMENTATION_PLAN.md"
    - "docs/ROADMAP.md"
backlog:
  - "B003"
  - "B006"
commits: []
release: "v0.1.13"
---

# 0068: Search Result Agent Packets

## Summary

Added a topic-first agent packet workflow that builds token-budgeted packets
from weighted search results.

## Why

`ledger packet <path>` is efficient when an agent already knows the file path.
Many investigations start from a feature, invariant, symbol, or design concern
instead. `ledger search-packet` bridges search and packet retrieval so agents
can get compact context without first reading the whole catalog or guessing a
path.

## Changed Files

### src/packet.ts

- What changed: Added `buildSearchAgentPacket` and optional search metadata on
  packet entries.
- Anchor: `buildSearchAgentPacket`
- On conflict: Preserve `buildAgentPacket` path behavior and keep search packet
  budget handling shared through the existing packet selection path.

### src/commands/searchPacket.ts and src/cli.ts

- What changed: Added `runLedgerSearchPacketCommand`,
  `formatLedgerSearchPacketResult`, and `ledger search-packet`.
- Anchor: `searchPacketCommand`
- On conflict: Keep command output compatible with `ledger packet`, including
  `--json`, `--write-report`, `--budget`, and `--limit`.

### src/mcp.ts

- What changed: Added `ledger_search_packet` for MCP-capable agents.
- Anchor: `ledger_search_packet`
- On conflict: Keep MCP results as JSON text payloads with compact `summary`
  metadata.

### README.md and docs

- What changed: Documented the new CLI workflow, MCP tool, and implementation
  surface.
- Anchor: `ledger search-packet`
- On conflict: Keep docs aligned with CLI help and MCP tool names.

### tests

- What changed: Added primitive, command, CLI, help, and MCP coverage for search
  packets.
- Anchor: search-packet
- On conflict: Keep both path-first and topic-first packet workflows covered.

## Behavior And UX Impact

Agents can now run `ledger search-packet <query> --budget <tokens>` to receive
ranked context entries with matched fields, token estimates, invariants, and
verification checks.

## Invariants

- Search packets remain derived from Ledger Markdown and generated search model
  data.
- Token budgets and entry limits behave consistently with file-based packets.
- MCP search-packet responses include compact summary metadata before details.

## Verification

- `npm test -- --run test/packet.test.ts test/commands.test.ts test/cliE2e.test.ts test/mcp.test.ts test/cliHelp.test.ts`
- `npm run typecheck`

## Notes

Search packets do not invent path-specific conflict rules. They include search
match metadata, files, symbols, docs, invariants, and verification from matched
records.
