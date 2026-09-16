---
id: "0099"
kind: "change"
title: "Add the engine server with API, events, and MCP over HTTP"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "server"
  - "api"
  - "mcp"
  - "agents"
files:
  - "src/engine.ts"
  - "src/serve.ts"
  - "src/operations/definitions/server.ts"
  - "src/index.ts"
  - "src/unstable.ts"
  - "test/engine.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "README.md"
  - ".gitignore"
symbols:
  - "startLedgerEngine"
  - "readDaemonRecord"
  - "apiOperations"
  - "guardRequest"
  - "serveStaticPath"
  - "watchLedgerSources"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture guide gains an Engine Server section listing every route and the daemon record; the README documents serve --api with curl examples."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
  - "0096"
---

# 0099: Add The Engine Server With API, Events, And MCP Over HTTP

## Summary

`ledger serve --api` starts the engine in `src/engine.ts`: one hardened
loopback HTTP server hosting the static reader, a JSON API generated from the
operation registry, a server-sent event stream, MCP over Streamable HTTP, and
a server card. `POST /api/v1/operations/{name}` runs any operation that works
inside a workspace and returns the machine envelope with the exit code in a
`Ledger-Exit-Code` header. `/events` emits `ready`, `records-changed`,
`rebuilt`, and `rebuild-failed` as watched records change. `/mcp` serves the
same tools as `ledger mcp` through the SDK's stateless Streamable HTTP
transport. While running, the engine writes `.ledger/daemon.json` with its pid,
url, port, profile, and version and removes it on shutdown.

The static server's request guards, static file handler, and source watcher
moved from private functions into exported helpers in `src/serve.ts` so both
servers share them. The existing `ledger serve` behavior is unchanged.

## Why

Decision D005 describes the local memory engine: a loopback process with a
versioned JSON API, an event stream, live reload, and MCP over HTTP, with CLI
commands delegating to its warm cache. The registry (0095) made the API a
projection rather than a second implementation, and the cache (0096) makes a
long-running process worth talking to. This change lands the process and its
routes; delegation and live reload follow in their own receipts.

## Changed Files

### Engine

- File: `src/engine.ts`
- Changed: `startLedgerEngine` renders the reader, listens, routes API, events,
  MCP, server card, and static requests, watches sources through the cache,
  broadcasts events, and writes and removes the daemon record.
  `readDaemonRecord` and `apiOperations` support delegation and the API list.
- Anchor: `startLedgerEngine`
- On conflict: Keep the route table and the envelope-plus-header response
  shape; add routes under `/api/v1` rather than changing existing ones.

### Shared server helpers

- File: `src/serve.ts`
- Changed: `guardRequest`, `serveStaticPath`, `validateExposure`,
  `securityHeaders`, `formatUrlHost`, and `watchLedgerSources` are exported;
  `serveStaticReader` composes them as before.
- Anchor: `guardRequest`
- On conflict: Both servers must apply the same guards; do not fork the
  hardening.

### Serve operation

- File: `src/operations/definitions/server.ts`
- Changed: `--api` starts the engine and prints the API, events, MCP, and
  daemon locations; the watcher moved to `src/serve.ts`.
- Anchor: `serveOperation`
- On conflict: `serve` without `--api` stays static-only.

### Tests, exports, docs

- Files: `test/engine.test.ts`, `test/fixtures/operations-contract.json`,
  `src/index.ts`, `src/unstable.ts`, `docs/ARCHITECTURE.md`, `README.md`,
  `.gitignore`
- Changed: Engine tests boot a real server on port 0 and cover the API
  description, health, operation execution with envelopes and exit codes,
  invalid and unknown requests, the event stream, the daemon record lifecycle,
  MCP over HTTP through the SDK client, the server card, and a watch-driven
  rebuild. The daemon file is ignored by Git.
- Anchor: `Ledger engine`
- On conflict: Keep the watch test's entry id unique; a duplicate id fails
  the rebuild.

## Behavior And UX Impact

- `ledger serve --api` exposes the reader plus `/api/v1`, `/events`, `/mcp`,
  and `/.well-known/mcp/server-card.json` on the same loopback port, always
  watching source records.
- `.ledger/daemon.json` exists while the engine runs.
- Shutdown cuts idle keep-alive connections after 250 ms instead of waiting
  five seconds.

## Invariants

- The API exposes only registry operations that run inside a workspace and
  return; interactive and scaffolding commands are never routable.
- API responses are the same machine envelope as `--json`, and the exit code
  travels in the `Ledger-Exit-Code` header.
- Local mode binds loopback only and validates the Host header; network mode
  requires the same token as `ledger serve`.
- The daemon record is removed on shutdown and never contains a token.

## Verification

- `npm run typecheck`
- `npm test` (40 files, 228 tests)
- `npm run build`, then a scripted engine session: watched entry creation
  produced `records-changed` and `rebuilt` events; an MCP client connected,
  listed tools, and called `ledger_validate` over HTTP in under 70 ms
- `npm run ci`

## Notes

Milestone one of 0.5. Next: CLI delegation to the running engine.
