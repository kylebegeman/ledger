---
id: "0055"
kind: "change"
title: "JSON operational errors"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "cli"
  - "agents"
  - "errors"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/cli.ts"
  - "test/cliE2e.test.ts"
symbols:
  - "printJsonError"
  - "errorCode"
  - "ledger --json"
staleRefs:
  - "symbols:printJsonError"
  - "symbols:errorCode"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Documented machine-readable JSON error behavior for agents."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0055: JSON Operational Errors

## Summary

Added structured JSON error output for operational CLI failures when commands
are invoked with `--json`.

## Why

Agents should not have to scrape stderr to understand why a Ledger command
failed. A small `{ ok: false, error: { code, message } }` shape lets callers
distinguish missing workspaces, invalid config, duplicate release output, and
generic operational failures.

## Changed Files

### src/cli.ts

- What changed: Added JSON error output in the top-level command catch path and
  for unknown commands under `--json`.
- Anchor: `printJsonError`, `errorCode`
- On conflict: Keep `--json` output pure JSON without appended help text.

### test/cliE2e.test.ts

- What changed: Covered workspace discovery failures and unknown commands under
  `--json`.
- Anchor: `validate --json`, `unknown-command`
- On conflict: Preserve assertions that stderr is empty for JSON errors.

### README.md and docs/ARCHITECTURE.md

- What changed: Documented the JSON operational error contract.
- Anchor: `Error Philosophy`
- On conflict: Keep the contract compact and agent-readable.

## Behavior And UX Impact

Human users still get concise stderr messages. Agents and tools using `--json`
now receive parseable failure payloads for top-level operational errors.

## Invariants

- `--json` error output must be valid JSON.
- Unknown command JSON output must not append help text.
- Human output should remain concise.

## Verification

- `npm run typecheck`
- `npx vitest run test/cliE2e.test.ts`

## Notes

This is the first operational error slice. Individual usage errors can be moved
to the same shape command by command later.
