---
id: "0134"
kind: "change"
title: "Keep linked session records when pruning"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "sessions"
  - "capture"
files:
  - "src/stale.ts"
  - "src/sessions.ts"
  - "src/authoring.ts"
  - "src/operations/definitions/sessions.ts"
  - "src/workspace.ts"
  - "src/skills.ts"
  - "test/sessions.test.ts"
  - "test/stale.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
  - "README.md"
  - ".ledger/README.md"
symbols:
  - "expiredSessions"
  - "pruneSessions"
  - "PruneSessionsResult"
  - "KeptSession"
  - "nextRecordId"
  - "sessionPruneOperation"
  - "detectStaleKnowledge"
docs:
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "Session retention and the prune output changed, so the session rules in SCHEMA, the README rows, the scaffolded and this repository's .ledger README, and the ARCHITECTURE hooks section describe them."
  docs:
    - "docs/SCHEMA.md"
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
backlog:
  - "B010"
decisions:
  - "D005"
related:
  - "0129"
  - "0133"
  - "S0002"
---

# 0134: Keep Linked Session Records When Pruning

## Summary

`ledger session prune` never deletes a session record another record links:
an expired session is kept when any non-session record lists its id in
`related`, or when its own `related` names an existing record. `--write`
deletes only unlinked expired sessions and, in the same transaction, closes
kept sessions that are still active. `ledger stale` reports `expired-session`
only for sessions prune would delete, because both use the new
`expiredSessions` helper. A session id still named in any `related` list is
never reissued. Session records are documented as committed with the rest of
`.ledger/`, and the skill says so.

## Why

B010's session rule and product note 0129: pruning a session that a receipt
links left a dangling `related` id, and the next session start could reuse
that id so the old link pointed at an unrelated session. A session the Claude
desktop app never ended stayed active forever. Keeping linked sessions needs no
rewrite of landed receipts; rewriting receipts, a new status, and stripping
links on landing were rejected.

## Changed Files

### Retention and pruning

- Files: `src/stale.ts`, `src/sessions.ts`, `src/authoring.ts`
- Changed: `expiredSessions(catalog, today)` returns the prunable sessions
  and the retained ids with the records that link them;
  `detectStaleKnowledge` emits `expired-session` only for prunable sessions;
  `pruneSessions` deletes prunable documents and closes kept active ones in
  one transaction with expected hashes, matched per document;
  `nextRecordId` counts session ids still named in `related`.
- Anchor: `expiredSessions`, `pruneSessions`
- On conflict: Keep one helper shared by prune and stale; keep deletes and
  closes in a single transaction; never reissue a session id a record names.

### Operation, scaffold, and skill

- Files: `src/operations/definitions/sessions.ts`, `src/workspace.ts`,
  `src/skills.ts`, `test/fixtures/operations-contract.json`
- Changed: `session.prune` output gains `kept` with `linkedBy` and `closed`;
  help and the `--write` description explain retention; the text output
  lists kept records and prints "Nothing to delete." when only kept records
  exist; the scaffolded `.ledger/README.md` and the skill describe committed
  session records; the contract changes only in `session.prune`.
- Anchor: `sessionPruneOperation`
- On conflict: Formatting stays in the operation; never tell adopters to
  git-ignore `.ledger/sessions`.

### Tests and docs

- Files: `test/sessions.test.ts`, `test/stale.test.ts`, `docs/SCHEMA.md`,
  `docs/ARCHITECTURE.md`, `README.md`, `.ledger/README.md`
- Changed: kept, closed, deleted, and id-reuse cases; stale cases for a
  missing linked session and for linked and unlinked expired sessions; the
  session rules in SCHEMA, the hooks note in ARCHITECTURE, and the README
  rows.
- Anchor: `expiredSessions`
- On conflict: The docs must say a record linking a missing session still
  validates and passes `ready` and `ci`, while `stale` reports it.

## Behavior And UX Impact

`ledger session prune` shows which expired sessions it keeps and why, and
`--write` closes kept active ones instead of deleting them. Its JSON gains
`kept`, and `expired` no longer lists linked sessions. `ledger stale` stops
flagging linked expired sessions. Session ids referenced by receipts are not
reused.

## Invariants

- Prune never deletes a session that a non-session record links or whose own
  `related` names an existing record.
- `expiredSessions` is the single source for prune and the `expired-session`
  signal.
- `nextRecordId` never reissues a session id still referenced in `related`.
- `validate`, `ready`, and `ci` stay silent about a `related` id naming a
  missing session; `stale` reports `missing-relationship`.

## Verification

- `npx vitest run test/sessions.test.ts test/stale.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (`session.prune` only)
- `node dist/cli.js ready 0134`
- `npm run ci`

## Notes

Milestone four of B010 (release 0.8.0), run on Opus. Reviewers found that
prune selected files by id instead of per document, that the docs overclaimed
session-to-session links, a stale `--write` description, and an unwrapped
SCHEMA line; all were fixed. A session that only another session links is not
kept; that is deliberate and documented.
