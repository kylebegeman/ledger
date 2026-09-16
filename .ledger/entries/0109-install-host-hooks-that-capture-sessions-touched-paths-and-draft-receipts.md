---
id: "0109"
kind: "change"
title: "Install host hooks that capture sessions, touched paths, and draft receipts"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "capture"
  - "agents"
  - "cli"
files:
  - "src/hooks.ts"
  - "src/operations/definitions/hooks.ts"
  - "src/sessions.ts"
  - "src/operations/registry.ts"
  - "src/operations/runtime.ts"
  - "src/index.ts"
  - "test/hooks.test.ts"
  - "test/fixtures/operations-contract.json"
  - ".claude/settings.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/PRODUCT.md"
symbols:
  - "installHostHooks"
  - "renderHostHooks"
  - "normalizeHookPayload"
  - "runHookEvent"
  - "buildSessionStartContext"
  - "readStdinJson"
  - "draftSessionReceipt"
  - "hooksInstallOperation"
  - "hookOperation"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/PRODUCT.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc gains a Capture Hooks section describing the installer, the hidden hook operation, and each event; the product brief and README describe the hooked agent workflow and the command name caveat."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/PRODUCT.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D005"
  - "D007"
related:
  - "0107"
  - "0108"
---

# 0109: Install Host Hooks That Capture Sessions, Touched Paths, And Draft Receipts

## Summary

`ledger hooks install --host claude-code|codex|cursor` merges Ledger's
lifecycle hooks into the host's project hook file (`.claude/settings.json`,
`.codex/hooks.json`, `.cursor/hooks.json`), keeping every entry that is not
Ledger's and replacing earlier Ledger entries, with `--dry-run` to print the
merged file and `--command` to choose how Ledger is invoked. Each hook runs
the hidden `ledger hook <event> --host <host>` operation, which reads the
host's JSON from stdin, normalizes it (session id, source, touched paths made
project-relative, stop-hook flag), and dispatches: session start creates or
resumes the session record and injects a budgeted memory packet; every edit
records the touched path; stop and session end draft one change entry from
the touched paths and the Git diff, linked to the session, and refresh it on
later stops; pre-compaction records the working tree and writes
`.ledger/reports/handoff.md` so the post-compaction start receives the same
memory. This repository now has the Claude Code hooks installed with
`--command "node dist/cli.js"`.

## Why

B007's first acceptance check is that a fresh Claude Code session in a Ledger
project receives a packet on start and leaves a draft receipt on stop without
prompt engineering. The 0.5 engine gave agents a warm API, but nothing wrote
a record when a session ended. Hooks are the workflow layer that closes that
gap, and the session records from 0107 are where touched paths and notes
accumulate between events. Claude Code is the first host per D005; Codex and
Cursor share the dispatcher through payload normalization because their
hook contracts differ only in field names and file shapes, so the installer
already renders all three files while the acceptance run stays on Claude
Code.

## Changed Files

### Hooks module

- File: `src/hooks.ts`
- Changed: host hook file table, nested and flat hook rendering with merge,
  payload normalization for the three hosts including Codex `apply_patch`
  patch headers, the event runners, the session-start context builder with a
  token budget, and bounded stdin reading.
- Anchor: `runHookEvent`
- On conflict: Ledger entries are recognized by the `hook <event>` command
  text; keep that pattern stable or reinstalls will duplicate entries. Paths
  outside the project or under `.ledger/` are never recorded.

### Hook operations

- File: `src/operations/definitions/hooks.ts`
- Changed: `hooks.install` and the hidden, interactive, workspace-optional
  `hook` operation that always exits 0 and prints `{}` on failure.
- Anchor: `hookOperation`
- On conflict: The hook operation must stay `interactive` so it never
  delegates to the engine or appears on the HTTP API, and must never exit
  non-zero; hosts treat exit 2 as a blocking error.

### Session receipts

- File: `src/sessions.ts`
- Changed: `draftSessionReceipt` creates the draft entry linked to a session
  or refreshes the file list of the draft already linked, and leaves the
  session active.
- Anchor: `draftSessionReceipt`
- On conflict: One draft per session; a later stop must update the existing
  draft rather than create another.

### Registry, tests, docs, and dogfood

- Files: `src/operations/registry.ts`, `src/operations/runtime.ts`,
  `src/index.ts`, `test/hooks.test.ts`,
  `test/fixtures/operations-contract.json`, `.claude/settings.json`,
  `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`
- Changed: registration, help example, exports, rendering and normalization
  tests, a full Claude Code session in a temporary Git repository, a Cursor
  session, a budget test, installer CLI tests, the regenerated contract, the
  installed hooks for this repository, and docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

A Claude Code session in this repository now starts with a Ledger memory
packet and leaves a draft receipt after the first edit and stop, plus a
handoff report before compaction. Sessions and drafts appear in `query`,
`doctor`, and the reader. Users on machines where another program owns the
`ledger` name must pass `--command`; the install output says so.

## Invariants

- `hooks install` is idempotent and preserves hooks and keys it did not write.
- The hook operation exits 0 and prints a JSON object on every path.
- A session produces at most one draft receipt, refreshed on later stops.
- Injected session-start context stays within the token budget.

## Verification

- `npm run typecheck`
- `npx vitest run` (263 tests, including `test/hooks.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- Piped JSON through `node dist/cli.js hook session-start`, `post-tool-use`,
  and `stop` in a throwaway workspace; the session and draft entry appeared
- `node dist/cli.js hooks install --host claude-code --command "node dist/cli.js"`
  in this repository
- `npm run ci`

## Notes

Milestone four of 0.6 capture (B007). The acceptance run in a live Claude
Code session happens on the next session start in this repository. Next:
`skills install` and `agents --write`.
