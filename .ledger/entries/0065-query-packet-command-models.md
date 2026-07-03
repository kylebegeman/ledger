---
id: "0065"
kind: "change"
title: "Query and packet command models"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "cli"
  - "architecture"
  - "agents"
files:
  - ".ledger/entries/0065-query-packet-command-models.md"
  - "src/cli.ts"
  - "src/commands/index.ts"
  - "src/commands/packet.ts"
  - "src/commands/query.ts"
  - "test/commands.test.ts"
symbols:
  - "runLedgerQueryCommand"
  - "formatLedgerQueryResult"
  - "runLedgerPacketCommand"
  - "formatLedgerPacketResult"
docs: []
docsImpact:
  status: "not-needed"
  reason: "Internal command extraction preserves existing CLI behavior and docs."
backlog:
  - "B005"
commits: []
---

# 0065: Query And Packet Command Models

## Summary

Extracted `ledger query` and `ledger packet` behavior into reusable command
result modules.

## Why

The CLI extraction pattern started with search and metrics. Query and packet are
the next highest-value agent retrieval paths, and moving them behind command
models reduces duplicated behavior for future CLI, MCP, and report adapters.

## Changed Files

### src/commands/query.ts and src/commands/packet.ts

- What changed: Added command runners and formatters for query and packet.
- Anchor: `runLedgerQueryCommand`, `runLedgerPacketCommand`
- On conflict: Keep command modules independent of process cwd and stdout.

### src/cli.ts and src/commands/index.ts

- What changed: Delegated query and packet CLI handlers to command modules and
  exported them through the command barrel.
- Anchor: `queryCommand`, `packetCommand`
- On conflict: Preserve existing JSON output shapes for CLI callers.

### test/commands.test.ts

- What changed: Added direct command-model tests for query and packet without
  intercepting console output.
- Anchor: `command result models`
- On conflict: Keep command tests focused on result models and leave CLI tests
  to wiring.

## Behavior And UX Impact

Users should see the same query and packet output. Internally, more CLI behavior
is now accessible as reusable command results.

## Invariants

- Query and packet CLI behavior remains compatible.
- Command modules receive an already resolved workspace.
- Packet report writing remains explicit.

## Verification

- `npm test -- --run test/commands.test.ts test/cliE2e.test.ts test/packet.test.ts`
- `npm run typecheck`

## Notes

This does not extract every CLI command. It moves the primary retrieval commands
that agents use most often.
