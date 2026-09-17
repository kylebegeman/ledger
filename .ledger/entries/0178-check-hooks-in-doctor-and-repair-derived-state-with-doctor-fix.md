---
id: "0178"
kind: "change"
title: "Check hooks in doctor and repair derived state with doctor --fix"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "doctor"
  - "hooks"
files:
  - "src/doctor.ts"
  - "src/hooks.ts"
  - "src/daemon.ts"
  - "src/operations/definitions/health.ts"
  - "test/doctor.test.ts"
  - "test/cliHelp.test.ts"
  - "test/mcpWriteTools.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "hooksCheck"
  - "repairDerivedState"
  - "ledgerHookCommandPrefix"
  - "removeStaleDaemonRecord"
  - "doctorOperation"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes the hooks check and what doctor --fix repairs and leaves alone; the README names both."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
decisions:
  - "D006"
related:
  - "0176"
  - "0177"
---

# 0178: Check hooks in doctor and repair derived state with doctor --fix

## Summary

`ledger doctor` gains a `hooks` check and a `--fix` flag.

- **The hooks check.** It finds Ledger's entries in the Claude Code, Codex,
  and Cursor hook files and warns when:
  - an entry runs a command other than `agents.command`
  - `<agents.command> version` fails or times out
  - the command prints no Ledger version, as when another program owns the
    name
  - it reports a different Ledger than the one running doctor
- **`--fix`.** It first repairs derived and runtime state, then checks
  again:
  - interrupted transactions, and a stale lock
  - a stale engine record, after a second probe
  - a stale catalog cache
  - missing or stale indexes, and a missing reader, when records validate

  It reports each repair and never edits records or committed
  configuration.

## Why

D006 reshaped self-healing maintenance into `doctor --fix` on top of the
catalog cache, and it was still unbuilt.

The hooks check comes from this session. Uninstalling the old MCP SDK left
`dist/` importing a removed package, and every Claude Code hook in this
repository failed without a message until the next build. Codex and Cursor
behave the same way. Nothing reported the lost capture.

Rejected:

- **Reinstalling drifted hooks in `--fix`.** Hook files are committed
  configuration that Codex re-approves, so doctor reports them instead.
- **Clearing the cache to fix it.** That also deletes the hook notice store.
  Reading the catalog rebuilds the cache.

## Changed Files

### Doctor

- Files: `src/doctor.ts`, `src/hooks.ts`, `src/daemon.ts`
- Changed:
  - `hooksCheck` walks each host hook file for Ledger commands with the new
    `ledgerHookCommandPrefix`.
  - It runs the version command without a shell, under a timeout, and
    compares the output with `RunDoctorOptions.version`.
  - `repairDerivedState` applies the fixes, and `formatDoctorResult` lists
    them before the checks.
  - `removeStaleDaemonRecord` probes the engine again before deleting its
    record. The existing `removeDaemonRecord` only removes this process's
    own record.
- Anchor: `hooksCheck`, `repairDerivedState`, `ledgerHookCommandPrefix`,
  `removeStaleDaemonRecord`
- On conflict: `--fix` must stay limited to derived and runtime state.

### Operation, tests, contract, and docs

- Files: `src/operations/definitions/health.ts`, `test/doctor.test.ts`,
  `test/cliHelp.test.ts`, `test/mcpWriteTools.test.ts`,
  `test/fixtures/operations-contract.json`, `docs/ARCHITECTURE.md`,
  `README.md`
- Changed:
  - `doctor` takes `fix`, passes the running version, and re-runs the
    checks after repairs.
  - It is marked as mutating, because `--fix` writes derived files, and
    the MCP tool list counts it among the report writers.
  - New tests cover:
    - the hooks check passing, a version mismatch, and a drifted Cursor
      file
    - a failing command, and a program that is not Ledger
    - `--fix` repairing an engine record, indexes, and the reader, then
      finding nothing
    - `--fix` refusing while records do not validate
  - The help test pins the new usage line.
  - The architecture doc and the README describe both.
- Anchor: `doctor hooks check`, `doctor --fix`
- On conflict: Keep the test that `--fix` leaves an invalid record
  untouched.

## Behavior And UX Impact

- `ledger doctor` prints a `hooks` line and runs the hook command once,
  which through npx can take a second.
- `ledger doctor --fix` repairs what it can and says what it did.
- The `ledger_doctor` MCP tool accepts `fix`.

## Invariants

- `doctor --fix` never writes a source record or a hook file.
- A daemon record is removed only after a failed second probe.
- The hooks check runs `agents.command` only when Ledger hooks are
  installed, never through a shell, and never for longer than 20 seconds.

## Verification

- `npx vitest run test/doctor.test.ts test/delegation.test.ts test/mcpWriteTools.test.ts`
- `npm run typecheck`
- `npm run ci`
- `node dist/cli.js doctor`

## Notes

Running `node dist/cli.js doctor --fix` here regenerated the ignored index
files, and every check passed.
