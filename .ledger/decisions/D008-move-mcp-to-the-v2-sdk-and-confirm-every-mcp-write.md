---
id: "D008"
kind: "decision"
title: "Move MCP to the v2 SDK and confirm every MCP write"
date: "2026-09-17"
updated: "2026-09-17"
status: "accepted"
areas:
  - "mcp"
related:
  - "D005"
  - "D006"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
---

# D008: Move MCP To The V2 SDK And Confirm Every MCP Write

## Context

D006 gated MCP tools that write records on multi round-trip confirmation, and
receipt 0106 kept every authoring operation off MCP until the TypeScript SDK
could provide it. MCP protocol revision 2026-07-28 added that mechanism
(`input_required` results with a sealed `requestState`), and version 2 of the
TypeScript SDK implements it. The v2 SDK shipped on 2026-07-27. Ledger was on
`@modelcontextprotocol/sdk` 1.30, which speaks only the 2025 revisions.

The move needed new production packages, which Kyle's rules ask him to
approve. He delegated the choice on 2026-09-17, asking for the best option
regardless of effort, and then asked for the work and a patch release.

Facts checked before deciding:

- The SDK README promises v1.x bug and security fixes for at least six months
  after v2's release, so into early 2027, and names v2 the stable line.
- Fresh installs measured 94 packages for SDK 1.30.0 (Express, ajv, jose, cors,
  hono, and more). `@modelcontextprotocol/server` with the Node adapter comes
  to 6, and the server package alone to 3, including zod, which Ledger
  already uses. AJV is bundled inside the server package.
- v2 serves both eras from one factory: `serveStdio` selects the era from a
  connection's opening message, and `createMcpHandler` serves 2026-07-28 per
  request and 2025-era requests statelessly, which is how Ledger's engine
  already served MCP.
- Codex clients already send 2026-07-28 requests. Claude clients still used the
  2025 handshake in mid-August 2026, with support announced as rolling out.

## Decision

Ledger depends on `@modelcontextprotocol/server` and
`@modelcontextprotocol/node` 2.x instead of `@modelcontextprotocol/sdk`, and
tests use `@modelcontextprotocol/client` as a dev dependency. `ledger mcp`
uses `serveStdio`, and the engine mounts `createMcpHandler` through
`toNodeHandler`. Both serve 2026-07-28 and the 2025 revisions. Neither ever
rejects the older clients.

Every MCP tool that writes source records asks the user to confirm first. An
operation opts in by declaring `mcp.confirm`. The first eight are new,
feedback, backlog new, decision new, promote, and session start, note, and
close. Report-writing tools such as `ci` stay as they were.

- **Mechanism.** The confirmation is a form elicitation with one required
  checkbox. Its sealed `requestState` holds the tool and a fingerprint of the
  arguments.
- **2025-era clients.** They confirm through the SDK's legacy shim, as a
  real elicitation request.
- **Clients that cannot confirm.** A client that declares no form
  elicitation gets `confirmation-unavailable`, and nothing is written.
- **The engine.** Its stateless 2025-era requests cannot carry the round
  trip, so it leaves those tools out there, and it pins writes to its own
  project.

The release is a patch, 0.9.1, per Kyle's rule since 0.9.0.

## Consequences

Ledger's production install shrinks from the v1 tree to a handful of
packages, and it follows the maintained SDK line. MCP-only clients can now
draft records, add session notes, and promote backlog items. Each write
carries a visible human confirmation that the model cannot skip or reuse
for other arguments.

The costs:

- The v2 packages were seven weeks old, with no patch releases.
- The Node adapter brings `@hono/node-server` and `hono`.
- A record created over MCP is still a template, because the authoring
  operations take no body text.
- Clients that support neither 2026-07-28 nor form elicitation cannot use
  the write tools and must use the CLI.

`runLedgerMcpTool` stays a direct, unconfirmed entry point for programs.

Rejected:

- **Staying on v1 until clients catch up.** It meant the same migration later
  against the v1 support window, and the 94-package tree meanwhile. v2 costs
  no client compatibility.
- **A hand-written Node adapter.** It would save three packages but make
  Ledger own request and stream conversion that the SDK team maintains.
- **Serving only 2026-07-28.** It would cut off Claude clients.
- **Sessionful legacy HTTP.** It would let 2025-era HTTP clients confirm, at
  the cost of per-client state in the engine. Stdio already covers those
  clients.

## Revisit Criteria

- Revisit when the SDK ends 2025-era support or Ledger drops those clients.
- Revisit if an adopter needs confirmed writes over 2025-era HTTP.
- Revisit if authoring operations gain body text, which would make MCP-only
  receipts complete and could change what the confirmation shows.
