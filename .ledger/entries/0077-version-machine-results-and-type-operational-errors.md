---
id: "0077"
kind: "change"
title: "Version machine results and type operational errors"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["api", "cli", "mcp"]
files:
  - "README.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "src/cli.ts"
  - "src/commands/packet.ts"
  - "src/commands/search.ts"
  - "src/commands/searchPacket.ts"
  - "src/config.ts"
  - "src/documents.ts"
  - "src/fileTransaction.ts"
  - "src/frontmatter.ts"
  - "src/index.ts"
  - "src/machine.ts"
  - "src/mcp.ts"
  - "src/packet.ts"
  - "src/release.ts"
  - "src/serve.ts"
  - "src/unstable.ts"
  - "src/workspace.ts"
  - "test/cliE2e.test.ts"
  - "test/machine.test.ts"
  - "test/mcp.test.ts"
  - "test/publicApi.test.ts"
symbols:
  - "LedgerError"
  - "LedgerMachineResult"
  - "machineSuccess"
  - "machineFailure"
  - "normalizeLedgerError"
docs:
  - "README.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Public, API, and architecture docs now define the shared versioned CLI and MCP machine envelope."
  docs:
    - "README.md"
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
commits: []
release: "v0.2.0"
---

# 0077: Version Machine Results And Type Operational Errors

## Summary

CLI `--json` output and MCP JSON text payloads now share a versioned success and
failure envelope. Operational error codes come from typed boundary errors or a
safe system-error normalizer rather than matching human message wording.

## Why

Consumers previously had to know a different top-level shape for each command,
and CLI error classification parsed English strings. That made automation
brittle, complicated MCP adapters, and allowed copy changes to alter machine
behavior. A schema version and command discriminator provide an explicit
compatibility boundary for 2.0 integrations.

## Changed Files

### Machine contract

- Files: `src/machine.ts`, `src/index.ts`, `src/unstable.ts`
- Rule: Success is `{schemaVersion, ok, command, data}`. Failure is
  `{schemaVersion, ok, command, error}` with a typed code, message, and optional
  safe details.
- On conflict: Never copy arbitrary thrown-object fields into machine output or
  infer codes from message prose.

### CLI and MCP boundaries

- Files: `src/cli.ts`, `src/mcp.ts`
- Rule: Every supported CLI JSON path and every MCP result uses schema version
  1. Invalid arguments and operational failures produce the same failure shape
  without writing mixed human output to stdout.
- On conflict: Keep human stderr formatting independent from JSON and MCP
  serialization.

### Typed producers and verification

- Files: `src/config.ts`, `src/documents.ts`, `src/frontmatter.ts`,
  `src/fileTransaction.ts`, `src/release.ts`, `src/serve.ts`, `src/workspace.ts`,
  `src/packet.ts`, `src/commands/*.ts`, `test/machine.test.ts`,
  `test/cliE2e.test.ts`, `test/mcp.test.ts`, `test/publicApi.test.ts`
- Rule: Workspace, config, YAML, resource, release, concurrency, serving, and
  argument boundaries carry stable codes. Tests pin success and failure
  envelopes plus safe system-error details.
- On conflict: New operational boundaries should throw `LedgerError` with the
  narrowest existing code before adding a new code.

## Behavior And UX Impact

Human command output is unchanged. JSON consumers must now read command output
under `data` and can check `schemaVersion` plus `command` before interpreting
it. MCP clients receive the same envelope, with tool failures marked through
the MCP `isError` signal as well as `ok: false`.

## Invariants

- Machine result schema changes require a schema-version decision.
- Error codes are independent of human message wording.
- Failure normalization does not emit arbitrary error properties or causes.
- Commands emitting JSON do not mix human prose into stdout.
- CLI and MCP use the same envelope helpers.

## Verification

- `npm run check`
- `npm run build`
- Focused CLI success, typed failure, invalid argument, MCP success/failure,
  and system-error normalization tests.

## Notes

This is an intentional machine-contract change and should be called out in the
next release notes.
