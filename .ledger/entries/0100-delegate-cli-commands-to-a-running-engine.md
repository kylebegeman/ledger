---
id: "0100"
kind: "change"
title: "Delegate CLI commands to a running engine"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "cli"
  - "server"
  - "performance"
files:
  - "src/daemon.ts"
  - "src/engine.ts"
  - "src/operations/delegate.ts"
  - "src/operations/runtime.ts"
  - "src/doctor.ts"
  - "src/index.ts"
  - "src/unstable.ts"
  - "test/delegation.test.ts"
  - "test/engine.test.ts"
  - "test/doctor.test.ts"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "delegateOperation"
  - "isDelegatable"
  - "probeEngine"
  - "readDaemonRecord"
  - "runLedgerCli"
  - "runDoctor"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture engine section describes delegation, its guards, and the escape hatches; the README explains that commands delegate transparently."
  docs:
    - "docs/ARCHITECTURE.md"
decisions:
  - "D005"
commits: []
related:
  - "0099"
release: "v0.5.0"
---

# 0100: Delegate CLI Commands To A Running Engine

## Summary

When `ledger serve --api` is running for a project, CLI commands that work
inside that workspace now run inside the engine instead of parsing the catalog
themselves. `src/operations/delegate.ts` reads `.ledger/daemon.json` for the
project containing the current directory, probes the engine's health with a
400 ms timeout, requires the pid and project root to match, posts the validated
input to `/api/v1/operations/{name}`, and returns the envelope and exit code.
The runtime prints the result exactly as a local run would. Any failure before
the engine answers falls back to running locally. `--local` on any command or
`LEDGER_NO_DAEMON=1` skips delegation. The daemon record helpers moved into
`src/daemon.ts` with `probeEngine`, the engine counts operations served in its
health payload, and `ledger doctor` gains an `engine` check that reports a
running engine or a stale record.

## Why

Decision D005 chose an explicit `ledger serve --api` process with opportunistic
CLI delegation over an auto-spawned daemon: deterministic lifecycle, no
orphaned processes, and the existing loopback hardening unchanged. With the
engine (0099) holding a warm catalog cache, delegation is the largest latency
win available to agents that call the CLI repeatedly, and it costs nothing when
no engine is running.

## Changed Files

### Daemon record and probe

- File: `src/daemon.ts`
- Changed: `readDaemonRecord`, `writeDaemonRecord`, `removeDaemonRecord`,
  `probeEngine`, `engineAuthHeaders`, and the shared constants moved here from
  the engine so the client side does not import the server.
- Anchor: `probeEngine`
- On conflict: The record never contains a token; the probe must check pid and
  API version.

### Delegation client and runtime

- Files: `src/operations/delegate.ts`, `src/operations/runtime.ts`
- Changed: `delegateOperation` decides and performs delegation;
  `runLedgerCli` calls it after local validation and before building a
  context, honoring `--local` as a global flag.
- Anchor: `delegateOperation`
- On conflict: Delegation applies only to `workspace: "required"`,
  non-interactive operations, and every failure path returns undefined so the
  local path runs.

### Engine and doctor

- Files: `src/engine.ts`, `src/doctor.ts`
- Changed: the engine uses the shared daemon helpers and reports
  `operationsServed`; doctor adds the `engine` check.
- Anchor: `engineCheck`
- On conflict: Keep the doctor check list order pinned by `test/doctor.test.ts`.

### Tests and docs

- Files: `test/delegation.test.ts`, `test/engine.test.ts`,
  `test/doctor.test.ts`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: delegation tests cover classification, engine round-trips with
  exit codes, the no-daemon environment variable, stale records, transparent
  CLI delegation, `--local`, and the doctor check. The engine health assertion
  accepts either cache backend because Node 24.15 runners select sqlite.
- Anchor: `engine delegation`
- On conflict: Tests must reset `LEDGER_NO_DAEMON` after use.

## Behavior And UX Impact

- With an engine running, commands answer from its warm cache; output and exit
  codes are unchanged.
- `ledger doctor` shows `engine (running at ...)` or a stale-record warning.
- `ledger <command> --local` and `LEDGER_NO_DAEMON=1` force in-process runs.

## Invariants

- Delegated and local runs print the same envelope and human output for the
  same input.
- A stale or unreachable engine never fails a command; it falls back.
- Interactive and scaffolding commands never delegate.

## Verification

- `npm run typecheck`
- `npm test` (41 files, 232 tests)
- `npm run ci`

## Notes

Milestone two of 0.5. Next: live reload in the reader from the event stream.
