---
id: "0115"
kind: "change"
title: "Run verification commands and record evidence"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "verification"
  - "trust"
  - "cli"
files:
  - "src/verify.ts"
  - "src/operations/definitions/verify.ts"
  - "src/git.ts"
  - "src/types.ts"
  - "src/config.ts"
  - "src/workspace.ts"
  - "src/stale.ts"
  - "src/doctor.ts"
  - "src/retrieval.ts"
  - "src/packet.ts"
  - "src/commands/packet.ts"
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "src/engine.ts"
  - "src/operations/definitions/retrieval.ts"
  - "src/operations/definitions/records.ts"
  - "src/operations/definitions/server.ts"
  - "src/operations/registry.ts"
  - "src/index.ts"
  - "test/verify.test.ts"
  - "test/doctor.test.ts"
  - "test/fixtures/operations-contract.json"
  - ".ledger/config.yaml"
  - ".ledger/reports/evidence.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "runVerification"
  - "parseVerificationBullet"
  - "isAllowedCommand"
  - "evidenceFreshness"
  - "readEvidence"
  - "writeEvidence"
  - "verifyOperation"
  - "getHeadCommit"
  - "verificationCheck"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema gains a Verification Config section and a note on runnable bullets; the architecture doc gains a Verification Evidence section; the README documents ledger verify --run in the command map and the after-editing loop."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D001"
  - "D005"
related:
  - "0114"
release: "v0.7.0"
---

# 0115: Run Verification Commands And Record Evidence

## Summary

`ledger verify` reads the Verification section of change entries and parses
each bullet that starts with a backticked command into an environment prefix
and argv. `--run` executes the commands that match the `verification.allow`
patterns from the project root, under a timeout and output cap, and writes
`.ledger/reports/evidence.json`: per entry, the commands with exit status and
duration, the HEAD commit, a dirty-tree flag, and the run time. Prose,
bullets with shell operators, and unlisted commands are listed as skipped,
never failed. `evidenceFreshness` turns the sidecar into `fresh`, `stale`,
`failed`, or `none`, and that state now appears in `ledger stale` (as
`stale-verification`), a `doctor` `verification` check, `explain` records,
`packet` entries, and the reader's Verification panel heading, which says
when and at which commit an entry was last proven.

## Why

B008's evidence item (D3): verification was prose with no proof it still
held. Almost every receipt in this repository lists runnable commands, so
executing them is cheap and the shape was already there. The allowlist
protects against running write commands or arbitrary shell from a record
someone else authored, and the sidecar stays derived under D001: no record
changes when evidence is recorded, and `ready` does not require evidence.
Evidence is written under `.ledger/reports/`, which is committed, so pull
requests carry it, unlike the regenerable indexes.

## Changed Files

### Verification module and operation

- Files: `src/verify.ts`, `src/operations/definitions/verify.ts`, `src/git.ts`
- Changed: bullet parsing with a quote-aware splitter, allowlist matching,
  command execution, the validated evidence index, freshness, selection by
  ids, `--all`, or the working-tree change set, the report formatter, and a
  `getHeadCommit` helper.
- Anchor: `runVerification`
- On conflict: Commands run with `execFile` and no shell except on Windows,
  where `.cmd` shims require it; the operator rejection must stay, and
  the `LEDGER_VERIFY_NESTED` guard must stay so a bullet cannot recurse.

### Config

- Files: `src/types.ts`, `src/config.ts`, `src/workspace.ts`, `.ledger/config.yaml`
- Changed: the `verification` block with `allow`, `evidence`, `maxAgeDays`,
  and `timeoutMs`, validation, path safety, normalization, and the init
  serialization.
- Anchor: `verification`
- On conflict: The default allowlist contains only test, build, and Ledger
  check commands; never add publish or release commands to it.

### Surfacing

- Files: `src/stale.ts`, `src/doctor.ts`, `src/retrieval.ts`, `src/packet.ts`,
  `src/commands/packet.ts`, `src/render.ts`, `src/renderHtml.ts`,
  `src/engine.ts`, `src/operations/definitions/retrieval.ts`,
  `src/operations/definitions/records.ts`,
  `src/operations/definitions/server.ts`
- Changed: `stale-verification`, the doctor check, optional evidence on the
  retrieval contract and packet entries, the reader model fields and panel
  heading, and evidence loading in the render, serve, and engine paths.
- Anchor: `evidenceFreshness`
- On conflict: `retrieveByPath` stays synchronous; callers pass the evidence
  index in through options.

### Registry, tests, docs, and dogfood

- Files: `src/operations/registry.ts`, `src/index.ts`, `test/verify.test.ts`,
  `test/doctor.test.ts`, `test/fixtures/operations-contract.json`,
  `.ledger/reports/evidence.json`, `README.md`, `docs/ARCHITECTURE.md`,
  `docs/SCHEMA.md`
- Changed: registration and exports; parsing, allowlist, freshness, run,
  sidecar validation, stale, doctor, packet, reader, and CLI tests; the
  doctor check list; regenerated contract; the first evidence run for this
  receipt; docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

`ledger verify --run` after finishing a receipt proves its commands and
leaves evidence the next reader can trust or see age out. Doctor gains one
line; stale gains a signal after thirty days; packets and explain show
`Verified: fresh (date)` when evidence exists.

## Invariants

- Only commands matching `verification.allow` ever execute.
- Evidence never mutates a record and `ready` does not require it.
- A failed run makes `verify` exit 1 and the entry `failed` until rerun.
- A command started by `verify --run` cannot start another `verify --run`.

## Verification

- `npm run typecheck`
- `npx vitest run` (282 tests, including `test/verify.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js verify 0115` lists this receipt's runnable commands; the evidence for it was recorded with `--run` from the shell, which a Verification bullet must never do itself
- `npm run ci`

## Notes

Milestone four of 0.7 trust (B008). Next: freshness of referenced files and
anchors against the code tree.
