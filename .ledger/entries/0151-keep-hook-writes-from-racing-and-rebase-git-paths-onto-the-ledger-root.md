---
id: "0151"
kind: "change"
title: "Keep hook writes from racing and rebase Git paths onto the Ledger root"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "hooks"
  - "git"
  - "sessions"
files:
  - "src/fileTransaction.ts"
  - "src/git.ts"
  - "src/hooks.ts"
  - "src/sessions.ts"
  - "src/newEntry.ts"
  - "test/fileTransaction.test.ts"
  - "test/git.test.ts"
  - "test/hooks.test.ts"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "acquireLock"
  - "relativeToProject"
  - "withFreshCatalog"
  - "pendingWorkingTreeChanges"
docs:
  - "docs/ARCHITECTURE.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's hook section says Git paths are rebased onto a project root inside the repository, how drafts are announced, and that Cursor learns about drafts at the next session start; the README panel says the same for Cursor."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
related:
  - "0133"
  - "0142"
  - "0081"
---

# 0151: Keep Hook Writes From Racing And Rebase Git Paths Onto The Ledger Root

## Summary

Hooks for parallel tool calls no longer lose edited paths. The workspace
write lock now waits with jittered backoff, up to five seconds, while another
live process holds it, instead of failing at once, and the hook dispatcher
re-reads the catalog and retries a touch or draft whose plan went stale while
it waited. Git paths are rebased onto the Ledger project root: `git status`
and `git diff` report paths from the repository root, so a `.ledger/` inside
`packages/app` saw repository paths that matched none of its session's files
and drafted nothing. `getChangedFileDetails` now strips the `--show-prefix`
offset and drops paths outside the project, which fixes coverage, docs
impact, `verify`, and `new --from-diff` in the same layout. The stop and
session-end hooks reuse one Git listing for the draft, session-end reads the
catalog twice instead of three times, and a draft falls back to the touched
paths only when Git cannot answer, instead of swallowing every error.

## Why

The 0.8.0 audit ran six `post-tool-use` hooks at once, as Claude Code does
for parallel edits, and five of them printed "workspace is locked" and
exited 0, so the session record kept one path in six and the Stop draft
missed the rest. The same audit put a Ledger root in a subdirectory and
watched the Stop hook print `{}` while pre-compact recorded the session
record's own repository path. Both break the capture promise silently. A
write that waits and re-plans was chosen over a longer lock hold because
hooks are short and independent; the wait stays inside every host timeout.

## Changed Files

### Write lock and hook retries

- Files: `src/fileTransaction.ts`, `src/hooks.ts`
- Changed: `acquireLock` loops until `lockWaitMs` with jittered backoff
  between `lockRetryBaseMs` and `lockRetryMaxMs`, removing a stale lock once;
  `withFreshCatalog` re-reads the catalog and retries a write up to
  `concurrentWriteAttempts` times on `concurrent-file-change`, and the
  post-tool-use, stop, and session-end cases run through it; session-end
  closes the session from the catalog it already read.
- Anchor: `acquireLock`, `lockWaitMs`, `withFreshCatalog`
- On conflict: Keep the wait bounded below the shortest host timeout, and
  keep a hook exiting 0 with `{}` when the wait gives up.

### Git paths

- Files: `src/git.ts`
- Changed: `getChangedFileDetails` lists changes relative to the repository
  with `--porcelain=v1`, then `relativeToProject` rebases them onto the
  directory Ledger runs in and drops the rest.
- Anchor: `relativeToProject`, `repositoryChangedFiles`
- On conflict: Every caller receives project-relative paths; never compare a
  raw Git path with a record's `files`.

### Drafting

- Files: `src/sessions.ts`, `src/newEntry.ts`
- Changed: `pendingWorkingTreeChanges` returns the Git listing, which
  `draftSessionReceipt` passes to `draftChangeEntry` through the new
  `changedFiles` option so the draft does not ask Git again; without Git the
  draft is built from the touched paths directly.
- Anchor: `pendingWorkingTreeChanges`, `changedFiles`
- On conflict: Keep one Git listing per stop.

### Tests and docs

- Files: `test/fileTransaction.test.ts`, `test/git.test.ts`,
  `test/hooks.test.ts`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: five concurrent transactions all succeed; a locked workspace still
  rejects, after the wait; a nested project root sees `src/a.ts` for a range
  and for the working tree; six parallel post-tool-use hooks record six
  paths; a Stop hook under `packages/app` drafts a receipt with
  project-relative files. The docs describe the rebasing, the notice
  lifecycle, the draft caps, and Cursor's draft signal.
- Anchor: `waits for a writer that holds the lock instead of failing`, `reports changes relative to a project root inside the repository`, `records every path when parallel tool calls run the hook at the same time`
- On conflict: Keep the parallel-hook test; it is the regression test for
  the lost paths.

## Behavior And UX Impact

An agent that edits several files in one turn sees all of them on its
session record and in the drafted receipt. A repository that keeps `.ledger/`
in a subdirectory gets drafts, coverage, and docs impact for the files under
that directory. A CLI command run while a hook holds the lock waits briefly
instead of failing.

## Invariants

- A write waits for a live lock holder before giving up, and never steals a
  live lock.
- A hook write whose plan went stale is retried from a fresh catalog read.
- Paths from Git are relative to the Ledger project root, and paths outside
  it are dropped.
- A stop hook asks Git once.

## Verification

- `npx vitest run test/git.test.ts test/fileTransaction.test.ts test/hooks.test.ts test/sessions.test.ts test/newEntry.test.ts`
- The parallel-hook test failed against the previous code with five lost
  paths and a locked-workspace message, and again with a
  `concurrent-file-change` error before the retry; it passes with both.
- `npm run typecheck`
- `npm run ci`

## Notes

Found by the 0.8.0 audit. The nested-root case was a regression from 0142,
which turned a wrong file list into no receipt at all.
