---
id: "0075"
kind: "change"
title: "Make source mutations recoverable and concurrency safe"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["reliability", "security", "cli"]
files:
  - ".gitignore"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/RELEASE_PREP.md"
  - "src/cli.ts"
  - "src/docs.ts"
  - "src/doctor.ts"
  - "src/fileTransaction.ts"
  - "src/migrate.ts"
  - "src/newEntry.ts"
  - "src/release.ts"
  - "src/unstable.ts"
  - "src/validate.ts"
  - "test/doctor.test.ts"
  - "test/fileTransaction.test.ts"
  - "test/release.test.ts"
symbols:
  - "applyFileTransaction"
  - "recoverInterruptedTransactions"
  - "inspectWorkspaceWriteState"
  - "applyRelease"
  - "WorkspaceWriteLockedError"
  - "ConcurrentFileChangeError"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/RELEASE_PREP.md"
docsImpact:
  status: "updated"
  reason: "Architecture, release, and public workflow docs now describe journaled source mutations and concurrency behavior."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/RELEASE_PREP.md"
commits: []
---

# 0075: Make Source Mutations Recoverable And Concurrency Safe

## Summary

Ledger source mutations now use a shared journaled file transaction with a
workspace lock, optimistic source hashes, staged replacements, rollback copies,
and interrupted-operation recovery. Release assignment and release creation now
commit together, while entry creation, migrations, docs routing, and validation
baseline updates use the same boundary.

## Why

Sequential writes could leave partially assigned releases, half-migrated docs,
or truncated source when a process failed. They could also overwrite a file
edited after an operation was planned. Per-file exclusive creation prevented a
few collisions but could not provide multi-file recovery or consistent
concurrency behavior.

## Changed Files

### Transaction engine

- Files: `src/fileTransaction.ts`, `src/unstable.ts`, `.gitignore`
- Rule: Mutations hold `.ledger/write.lock`, persist a content-free journal,
  verify expected hashes, stage and sync content, keep rollback copies until
  commit, and recover interrupted applying transactions before the next write.
- On conflict: Never store record contents or secrets in transaction journals,
  and never remove a target changed by an external editor during recovery.

### Mutating workflows

- Files: `src/newEntry.ts`, `src/release.ts`, `src/migrate.ts`, `src/docs.ts`,
  `src/validate.ts`, `src/cli.ts`
- Rule: New records use expected-absent writes. Existing source uses its parsed
  SHA-256 hash as an optimistic precondition. Release entries and the release
  document are one transaction.
- On conflict: Preserve the single transaction around every logically unified
  source mutation.

### Health, tests, and docs

- Files: `src/doctor.ts`, `test/fileTransaction.test.ts`,
  `test/release.test.ts`, `test/doctor.test.ts`, `README.md`,
  `docs/ARCHITECTURE.md`, `docs/RELEASE_PREP.md`
- Rule: Doctor exposes write state; tests cover multi-file commits, active
  locks, optimistic conflicts, recovery rollback, and release all-or-nothing
  behavior.
- On conflict: Pending transaction journals remain a failing health signal.

## Behavior And UX Impact

Concurrent Ledger writes now fail with lock context. Files changed by an editor
after planning invalidate the operation rather than being overwritten. A later
mutation automatically rolls back a safely recoverable interrupted transaction,
and `ledger doctor` makes pending recovery state visible.

## Invariants

- Markdown remains the source of truth.
- A logical multi-file mutation either commits completely or retains enough
  local evidence to roll back safely.
- Recovery never overwrites content whose hash differs from the planned next
  content.
- Transaction journals contain metadata and hashes, not source contents.
- An active same-host writer lock is never stolen based only on age.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js new "Make source mutations recoverable and concurrency safe" --from-diff --area reliability`

## Notes

The new-entry command successfully created this receipt through the transaction
layer, providing a direct dogfood check in addition to the focused tests.
