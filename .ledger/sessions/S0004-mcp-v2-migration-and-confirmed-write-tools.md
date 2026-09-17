---
id: "S0004"
kind: "session"
title: "MCP v2 migration and confirmed write tools"
date: "2026-09-17"
updated: "2026-09-17"
status: "closed"
expires: "2026-09-24"
areas:
  - "assets"
  - "docs"
  - "engine"
  - "hooks"
  - "index"
  - "machine"
  - "mcp"
  - "operations"
  - "tests"
files:
  - "package.json"
  - "package-lock.json"
  - "src/mcp.ts"
  - "src/engine.ts"
  - "src/index.ts"
  - "src/machine.ts"
  - "src/operations/types.ts"
  - "src/operations/registry.ts"
  - "src/operations/shared.ts"
  - "src/operations/definitions/authoring.ts"
  - "src/operations/definitions/sessions.ts"
  - "src/operations/definitions/server.ts"
  - "src/hooks.ts"
  - "test/hooks.test.ts"
  - "test/mcpWriteTools.test.ts"
  - "test/engine.test.ts"
  - "test/mcpResources.test.ts"
  - "test/publicApi.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
  - "docs/ROADMAP.md"
  - "docs/SCHEMA.md"
  - "docs/HANDOFF.md"
  - "README.md"
  - "assets/readme/adopt.svg"
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
related:
  - "0171"
  - "0172"
  - "0173"
  - "0174"
  - "D008"
---

# S0004: MCP v2 migration and confirmed write tools

## Summary

- Continued the 2026-09-17 session after S0003 closed. Kyle deleted Dossier's merged next branch and found that the Codex app treats /hooks as a message, so 0172 (kylebegeman/ledger#28) names the app's Hooks page in the Codex installer hint. Kyle then delegated the MCP dependency choice: D008 moves MCP to the v2 SDK, serving 2026-07-28 and the 2025 revisions, and 0173 adds eight MCP tools that write records only after the user confirms. 0174 prepares v0.9.1.

## Learned

- The Codex desktop app sends /hooks to the model as plain text; hooks are trusted on the Hooks page of the app's settings, and /hooks works only in the Codex CLI.
- The hooks run node dist/cli.js, so uninstalling a package the old build imports breaks every hook until npm run build runs again, and the hooks fail without a message.
- The PostToolUse hook ignores paths under .ledger/, so a turn that writes only records never starts a session record.
- The v2 MCP SDK serves both protocol eras from one factory: serveStdio pins the era per connection, and createMcpHandler classifies each request. A pair of StdioServerTransport instances over PassThrough streams tests stdio in-process, including version negotiation.
- The published v2 types erase the request envelope to an empty object; read the client capabilities through CLIENT_CAPABILITIES_META_KEY.

## Next

- Publish 0.9.1, move Kore to it with the installers, name the Codex app's Hooks page in Kore's docs/PLAN.md, and record both in the handoff.
- Kyle trusts Kore's changed Codex hooks on the Hooks page of the Codex app's settings after the bump.
