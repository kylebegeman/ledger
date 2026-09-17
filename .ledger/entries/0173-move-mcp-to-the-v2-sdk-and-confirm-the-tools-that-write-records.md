---
id: "0173"
kind: "change"
title: "Move MCP to the v2 SDK and confirm the tools that write records"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "mcp"
  - "engine"
  - "dependencies"
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
  - "test/mcpWriteTools.test.ts"
  - "test/engine.test.ts"
  - "test/mcpResources.test.ts"
  - "test/publicApi.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
  - "docs/ROADMAP.md"
  - "README.md"
  - ".ledger/decisions/D008-move-mcp-to-the-v2-sdk-and-confirm-every-mcp-write.md"
symbols:
  - "createLedgerMcpServer"
  - "createLedgerMcpHttpHandler"
  - "serveLedgerMcpStdio"
  - "runConfirmedLedgerMcpTool"
  - "confirmationFingerprint"
  - "LedgerOperationMcp"
  - "buildOperationsContract"
  - "handleMcp"
  - "quoteForConfirmation"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
  - "docs/ROADMAP.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes both protocol eras, the confirmation flow, cache hints, and the engine's /mcp; the API doc covers the new serving entry points and error codes; the README lists the confirmed tools; the roadmap marks the MCP phase."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/API.md"
    - "docs/ROADMAP.md"
    - "README.md"
commits: []
decisions:
  - "D006"
  - "D008"
related:
  - "0035"
  - "0102"
  - "0106"
  - "0172"
---

# 0173: Move MCP To The V2 SDK And Confirm The Tools That Write Records

## Summary

Ledger's MCP server now runs on version 2 of the TypeScript SDK
(`@modelcontextprotocol/server` and `@modelcontextprotocol/node` in place of
`@modelcontextprotocol/sdk` 1.30). It speaks protocol revision 2026-07-28 and
the 2025 revisions from one set of definitions. `ledger mcp` serves through
`serveStdio`, where the client's opening message picks the revision. The
engine's `/mcp` serves through `createMcpHandler`: 2026-07-28 per request,
and 2025-era requests statelessly, as before.

Eight operations that write records became MCP tools that ask the user
first: `ledger_new`, `ledger_feedback`, `ledger_backlog_new`,
`ledger_decision_new`, `ledger_promote`, and `ledger_session_start`,
`ledger_session_note`, and `ledger_session_close`.

- **The flow.** The first call returns an `input_required` form with one
  required checkbox, whose message names the action, the project, and its
  root. Only an accepted, checked answer runs the operation. Anything else
  returns `confirmation-declined` and writes nothing.
- **Older clients.** 2025-era clients confirm through a real
  `elicitation/create` request.
- **Clients that cannot confirm.** A client that declares no form
  elicitation gets `confirmation-unavailable` before anything is asked.
- **Cache hints.** List results carry one-hour cache hints on 2026-07-28.
- **Change notices.** The engine tells `subscriptions/listen` streams when
  records change.

## Why

D006 gated MCP writes on multi round-trip confirmation, which the 2026-07-28
revision and the v2 SDK now provide. Kyle delegated the dependency choice,
and D008 records it: v1 gets fixes only for about six months after v2's
release. The v2 server packages also replace a 94-package install with six.
Serving both eras keeps Claude clients, which still spoke the 2025 handshake
in August, working next to Codex clients, which already send 2026-07-28.

The confirmation is bound to its call: the sealed `requestState` holds the
tool name and a fingerprint of the arguments. A client cannot reuse one
answer for different arguments or for another tool. The engine leaves the
write tools out of stateless 2025-era requests, which cannot carry the round
trip. It also pins writes to its own project, as its JSON API already does.

Rejected alternatives are in D008.

## Changed Files

### Dependencies

- Files: `package.json`, `package-lock.json`
- Changed: `@modelcontextprotocol/sdk` is gone.
  `@modelcontextprotocol/server` and `@modelcontextprotocol/node` 2.0.0 are
  production dependencies. `@modelcontextprotocol/client` 2.0.0 is a dev
  dependency for tests. The install removed 92 packages and added 5.
- Anchor: `dependencies`
- On conflict: Keep one SDK line. Do not add `@modelcontextprotocol/sdk`
  back beside v2.

### MCP server

- Files: `src/mcp.ts`, `src/index.ts`, `src/machine.ts`
- Changed:
  - `createLedgerMcpServer` builds a v2 `McpServer` with cache hints and the
    requestState verifier. It registers zod object schemas, and skips the
    confirmed tools when `writeTools` is false.
  - `serveLedgerMcpStdio` and `createLedgerMcpHttpHandler` are the new
    serving entry points, exported from the package root.
    `startLedgerMcpServer` uses the stdio one.
  - `runConfirmedLedgerMcpTool` runs the confirmation:
    - It checks the write root and the client's form elicitation support.
    - It asks through `inputRequired.elicit`, with state sealed by one
      per-process `createRequestStateCodec` key.
    - It runs the operation only for an accepted `confirm: true`.
  - `confirmationFingerprint` hashes the arguments with sorted keys.
    `runLedgerMcpTool` also enforces `writeRoot` for confirmed tools.
  - The confirmation message collapses the action sentence to one line, so
    argument text cannot pose as the project line.
  - Two error codes join `LedgerErrorCode`: `confirmation-declined` and
    `confirmation-unavailable`.
  - `ledgerMcpProtocolVersions` lists 2026-07-28 and the SDK's 2025
    versions.
- Anchor: `createLedgerMcpServer`, `runConfirmedLedgerMcpTool`,
  `confirmationFingerprint`, `createLedgerMcpHttpHandler`,
  `serveLedgerMcpStdio`
- On conflict: Never run a confirmed tool's operation without an accepted,
  checked answer whose sealed state matches the call. Keep both eras served.

### Engine

- Files: `src/engine.ts`
- Changed:
  - One `createLedgerMcpHttpHandler` per engine, mounted with
    `toNodeHandler` behind the existing request guard, with a write root at
    the engine's project.
  - The engine closes the handler on shutdown and publishes
    `resourcesChanged` when watched records change.
  - The server card lists protocol versions and marks the confirmed tools.
- Anchor: `handleMcp`, `serverCard`
- On conflict: Keep the handler per engine, not per request, so a
  confirmation round reaches the same verification key.

### Registry and operations

- Files: `src/operations/types.ts`, `src/operations/registry.ts`,
  `src/operations/shared.ts`, `src/operations/definitions/authoring.ts`,
  `src/operations/definitions/sessions.ts`,
  `src/operations/definitions/server.ts`
- Changed:
  - `LedgerOperationMcp` takes the input type and an optional `confirm`
    sentence builder.
  - The eight operations declare MCP metadata with `confirm`.
  - `quoteForConfirmation` puts user text on one quoted line of at most 200
    characters.
  - The contract marks confirmed tools with `confirms: true`.
  - The `mcp` help names the confirmed tools and the protocol revisions.
- Anchor: `LedgerOperationMcp`, `buildOperationsContract`,
  `quoteForConfirmation`
- On conflict: An MCP tool whose operation writes source records must
  declare `confirm`. Report writers such as `ci` stay unconfirmed.

### Tests and fixture

- Files: `test/mcpWriteTools.test.ts`, `test/engine.test.ts`,
  `test/mcpResources.test.ts`, `test/publicApi.test.ts`,
  `test/fixtures/operations-contract.json`
- Changed:
  - New tests cover:
    - the confirmed tool list
    - an accepted write over 2026-07-28 HTTP, and declined, cancelled, and
      unchecked answers
    - a client without elicitation, and the missing tools on stateless
      2025-era HTTP
    - the write root, and a replayed confirmation with different arguments
    - both eras over stdio, including the 2025-era elicitation, and a
      2025-era stdio client without elicitation
    - fingerprint stability
    - a confirmation message whose arguments carry line breaks
  - The engine test negotiates 2026-07-28 automatically over real HTTP,
    writes after confirmation, and refuses another project.
  - Imports moved to `@modelcontextprotocol/client`.
  - The public API test pins the two new exports.
  - The contract gained eight `mcp` entries and lost nothing.
- Anchor: `MCP write tools`,
  `confirms MCP writes for 2026-07-28 clients and keeps them in the engine's project`
- On conflict: Keep the replay test and a test for each era.

### Docs and decision

- Files: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/ROADMAP.md`,
  `README.md`,
  `.ledger/decisions/D008-move-mcp-to-the-v2-sdk-and-confirm-every-mcp-write.md`
- Changed:
  - The MCP and engine sections describe the eras, the confirmation flow,
    the cache hints, and the change notices.
  - The API doc has an MCP Server section.
  - The README names the confirmed tools, and the roadmap marks Phase 8.
  - D008 records the decision.
- Anchor: `MCP Server`, `D008`
- On conflict: Keep the docs naming the same eight tools as the registry.

## Behavior And UX Impact

MCP clients see 28 tools instead of 20. A write tool shows a confirmation in
clients that support elicitation and writes nothing unless the user accepts
with the box checked. Clients on the 2025 revisions keep working. Over the
engine's HTTP endpoint, they see only the read tools. On `/mcp`, GET used
to open an event stream that never carried a message, and DELETE answered
200 without effect. Both now answer 405, which the 2025 transport allows for
a server without sessions. The installed package is much smaller.

## Invariants

- A confirmed tool runs its operation only after an accepted `confirm: true`
  answer whose sealed state names the same tool and argument fingerprint.
- Declined, cancelled, unchecked, missing, and unavailable confirmations
  write nothing.
- Both `ledger mcp` and `/mcp` serve 2026-07-28 and the 2025 revisions.
- The engine's confirmed writes stay in its own project.
- A confirmation message has exactly two lines: the action, then the
  project.
- `runLedgerMcpTool` never asks for confirmation.

## Verification

- `npx vitest run test/mcpWriteTools.test.ts test/engine.test.ts test/mcpResources.test.ts test/mcp.test.ts test/operations.test.ts test/publicApi.test.ts`
- `npm run typecheck`
- `npm run ci`
- The built `node dist/cli.js mcp` was smoke-tested through the SDK's own
  `StdioClientTransport`. Automatic negotiation selected 2026-07-28, and a
  2025-era client confirmed through `elicitation/create`. Both writes landed
  only after the confirmation.

## Notes

Resolves the gate in D006 and the deferral in 0106 and 0102. Records created
over MCP are still templates, because the authoring operations take no body
text. D008 lists that as a revisit criterion.
