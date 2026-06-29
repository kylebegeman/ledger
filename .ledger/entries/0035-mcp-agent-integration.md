---
id: "0035"
kind: "change"
title: "Add MCP agent integration"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["mcp", "agents", "cli", "docs", "tests"]
files:
  - "package.json"
  - "package-lock.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/mcp.ts"
  - "test/cliHelp.test.ts"
  - "test/mcp.test.ts"
  - ".ledger/entries/0035-mcp-agent-integration.md"
symbols:
  - "createLedgerMcpServer"
  - "startLedgerMcpServer"
  - "runLedgerMcpTool"
  - "mcpCommand"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits:
  - "18aa723"
release: "v0.1.4"
---

# 0035: Add MCP Agent Integration

## Summary

Adds `ledger mcp`, a stdio Model Context Protocol server exposing read-oriented
Ledger tools for validation, query, explain, conflict guidance, agent packets,
and docs impact.

## Why

Ledger is designed as durable implementation memory for agents. Exposing the
core retrieval paths through MCP lets compatible clients ask Ledger for context
directly instead of shelling out to CLI commands and parsing terminal output.

## Changed Files

### package.json and package-lock.json

- What changed: Adds runtime dependencies on the MCP TypeScript SDK and Zod.
- Anchor: `dependencies`
- On conflict: Keep MCP runtime dependencies explicit rather than relying on
  transitive packages.

### src/mcp.ts

- What changed: Adds the MCP server factory, stdio start helper, and reusable
  tool runner.
- Anchor: `createLedgerMcpServer`
- On conflict: Keep tool behavior delegated to Ledger core modules instead of
  duplicating CLI logic.

### src/cli.ts

- What changed: Adds the `ledger mcp` command and help output.
- Anchor: `mcpCommand`
- On conflict: Keep `ledger mcp` as a long-running stdio command that does not
  print normal CLI prose to stdout.

### src/index.ts

- What changed: Exports the MCP helpers from the public TypeScript API.
- Anchor: `./mcp.js`
- On conflict: Keep the MCP helpers importable for embedded agent adapters.

### test/mcp.test.ts and test/cliHelp.test.ts

- What changed: Adds direct MCP tool-runner coverage and help coverage for the
  new command.
- Anchor: `runLedgerMcpTool`
- On conflict: Preserve tests that validate tool payload shape without requiring
  an external MCP client.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents `ledger mcp`, the exported MCP server helper, and the
  first MCP slice in the architecture and roadmap.
- Anchor: `MCP Server`
- On conflict: Keep the docs clear that the first MCP surface is read-oriented.

## Behavior And UX Impact

MCP-capable agents can start Ledger as a local stdio server and call focused
tools for change memory, conflict guidance, and docs impact.

## Invariants

- MCP tools return JSON text payloads for compatibility with clients.
- The MCP layer stays thin and delegates behavior to existing Ledger modules.
- `ledger mcp` should not emit normal human CLI output on stdout.
- Report writing remains explicit and opt-in.

## Verification

- `npm run typecheck`
- `npx vitest run test/mcp.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js help mcp`

## Notes

Future MCP slices can add resources, prompts, richer structured content, and
write tools for drafting entries once the safety model is clear.
