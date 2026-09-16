---
id: "0118"
kind: "change"
title: "Derive a typed API client from the operation registry"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "api"
  - "engine"
  - "trust"
files:
  - "src/client.ts"
  - "src/operations/registry.ts"
  - "src/operations/delegate.ts"
  - "src/operations/definitions/agents.ts"
  - "src/operations/definitions/authoring.ts"
  - "src/operations/definitions/cache.ts"
  - "src/operations/definitions/changes.ts"
  - "src/operations/definitions/docs.ts"
  - "src/operations/definitions/health.ts"
  - "src/operations/definitions/hooks.ts"
  - "src/operations/definitions/readiness.ts"
  - "src/operations/definitions/records.ts"
  - "src/operations/definitions/retrieval.ts"
  - "src/operations/definitions/server.ts"
  - "src/operations/definitions/sessions.ts"
  - "src/operations/definitions/skills.ts"
  - "src/operations/definitions/verify.ts"
  - "src/index.ts"
  - "test/client.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
symbols:
  - "ledgerOperationTable"
  - "LedgerOperationName"
  - "LedgerOperationInput"
  - "LedgerOperationOutput"
  - "createLedgerClient"
  - "connectLedgerClient"
  - "delegateOperation"
docs:
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The API doc gains a Typed API Client section with usage and the derivation guarantee; the architecture engine section notes the table and the D007 boundary discipline; the README shows the client in the agent workflow."
  docs:
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
  - "D007"
related:
  - "0099"
  - "0100"
release: "v0.7.0"
---

# 0118: Derive A Typed API Client From The Operation Registry

## Summary

The registry is now `ledgerOperationTable`, an object keyed by machine name
whose value types are the concrete operation definitions; `ledgerOperations`
is derived from it in help order. Three types follow from the table:
`LedgerOperationName`, `LedgerOperationInput<K>`, and
`LedgerOperationOutput<K>`. `createLedgerClient({ url })` uses them so
`run(name, input)` only accepts a registered name with that operation's
declared input and returns the machine envelope typed with its output, the
exit code from the `ledger-exit-code` header, and the HTTP status; `health()`
and `operations()` read the other two API routes. `connectLedgerClient`
finds the engine through the daemon record and health probe, and CLI
delegation now runs through the same client instead of a hand-rolled fetch.

## Why

B008 asks for a typed client generated from the operations contract,
borrowing Kore's compile-time boundary discipline (D007). Deriving the types
from the registry rather than from generated code keeps one source: the
contract manifest, the CLI, the MCP tools, and now the client all come from
the same definitions, and the existing golden contract test pins the surface.
Exporting the definition interfaces was required for declaration emit; they
were already part of the public JSON Schema contract.

## Changed Files

### Registry and client

- Files: `src/operations/registry.ts`, `src/client.ts`, `src/operations/delegate.ts`
- Changed: the typed table and derived types; the client with envelope
  validation, transport errors as `operational-error`, and daemon discovery;
  delegation through the client.
- Anchor: `ledgerOperationTable`
- On conflict: The table's keys must equal each operation's `name`; a test
  asserts it, and insertion order is the help order.

### Definition modules, exports, tests, and docs

- Files: `src/operations/definitions/*.ts`, `src/index.ts`,
  `test/client.test.ts`, `test/fixtures/operations-contract.json`,
  `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`
- Changed: exported input and output interfaces; client exports; table,
  type-level, live engine, and transport failure tests; regenerated contract;
  docs.
- Anchor: `createLedgerClient`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Library consumers get a compile-time checked client for the engine. CLI
delegation behaves as before. No CLI output changed.

## Invariants

- Every table key equals its operation's name, and the table order is the
  help order.
- A call that does not typecheck cannot be sent; a call that reaches the
  engine returns a validated envelope or throws `operational-error`.

## Verification

- `npm run typecheck`
- `npx vitest run` (292 tests, including `test/client.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `npm run ci`

## Notes

Milestone seven of 0.7 trust (B008). Next: the typed, bundled, browser-tested
reader runtime.
