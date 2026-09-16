---
id: "0107"
kind: "change"
title: "Add expiring session records with start, touch, note, close, prune, and promotion"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "sessions"
  - "capture"
files:
  - "src/sessions.ts"
  - "src/operations/definitions/sessions.ts"
  - "src/authoring.ts"
  - "src/frontmatterEdit.ts"
  - "src/types.ts"
  - "src/config.ts"
  - "src/workspace.ts"
  - "src/documents.ts"
  - "src/validate.ts"
  - "src/query.ts"
  - "src/catalogCache.ts"
  - "src/stale.ts"
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "src/renderAssets.ts"
  - "src/operations/definitions/retrieval.ts"
  - "src/operations/registry.ts"
  - "src/index.ts"
  - "test/sessions.test.ts"
  - "test/fixtures/operations-contract.json"
  - ".ledger/templates/session.md"
  - ".ledger/config.yaml"
  - "README.md"
  - "docs/SCHEMA.md"
symbols:
  - "startSession"
  - "touchSession"
  - "noteSession"
  - "closeSession"
  - "pruneSessions"
  - "findSession"
  - "isExpiredSession"
  - "setFrontmatterArray"
  - "sessionTemplate"
  - "promoteRecord"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema documents the session kind, its frontmatter fields, lifecycle statuses, expiry, and id config; the README lists the sessions directory and commands."
  docs:
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D005"
  - "D006"
related:
  - "S0001"
  - "0106"
release: "v0.6.0"
---

# 0107: Add Expiring Session Records With Start, Touch, Note, Close, Prune, And Promotion

## Summary

`session` is a seventh record kind stored under `.ledger/sessions/` with an
`expires` date, optional `host` and `hostSession` fields, and Summary, Learned,
and Next sections. `ledger session start` (alias `ledger scratch`) creates one
or returns the active record for the same host session; `session touch`
appends touched paths and re-infers areas; `session note` appends a bullet to
Learned, Next, or Summary; `session close` marks it closed; `session prune`
lists expired records and deletes them with `--write`. `ledger stale` reports
`expired-session` for records past their expiry that were never promoted, and
`ledger promote S0001` turns a session into a draft change entry carrying its
files and notes while linking both records through `related`. This receipt
was created by promoting the dogfood session S0001.

## Why

Backlog B007 and decision D006 replace the retired `.ledger/scratch/`
directory with a short-lived record kind that validates and indexes like every
other record so it either becomes a change entry or expires instead of rotting.
The host hooks in the next milestone need somewhere to write touched paths and
a handoff between context windows, and agents need a cheap place to record
what they learned. Sessions are ordinary Markdown records under D001, so they
appear in search, packets, the reader, and `query --kind session`, and the
expiry keeps the catalog from filling with abandoned scratch.

## Changed Files

### Session module and operations

- Files: `src/sessions.ts`, `src/operations/definitions/sessions.ts`
- Changed: start, touch, note, close, and prune with selector resolution by
  id, host session id, or most recently updated active session; the five
  operations and the `scratch` alias.
- Anchor: `findSession`
- On conflict: `touchSession` must start a session when none is active so a
  hook installed mid-session still captures paths; `startSession` must return
  the existing active record for a repeated host session id.

### Kind registration

- Files: `src/types.ts`, `src/config.ts`, `src/workspace.ts`,
  `src/documents.ts`, `src/validate.ts`, `src/query.ts`,
  `src/catalogCache.ts`, `src/operations/definitions/retrieval.ts`
- Changed: the `session` kind in every enumeration, `source.sessions`,
  `ids.sessionPrefix` and `ids.sessionWidth`, `sessions.expiresInDays`, the
  session template and its placeholders, the `expires`, `host`, and
  `hostSession` core fields, and `expires` date validation.
- Anchor: `sessionTemplate`
- On conflict: A new kind must be added to `documentKinds`, the default
  `requiredSections`, `normalizeKind`, `normalizeKindFilter`, the retrieval
  kind enum, and the cache source directory table together, or config
  validation throws.

### Promotion, expiry, and frontmatter editing

- Files: `src/authoring.ts`, `src/frontmatterEdit.ts`, `src/stale.ts`
- Changed: `promoteRecord` accepts sessions and writes Learned and Next
  bullets into Notes; `setFrontmatterArray` replaces inline or block lists;
  `isExpiredSession` and the `expired-session` stale signal.
- Anchor: `isExpiredSession`
- On conflict: Promoted sessions are never expired or pruned; only `active`
  and `closed` records past `expires` count.

### Reader, tests, and docs

- Files: `src/render.ts`, `src/renderHtml.ts`, `src/renderAssets.ts`,
  `test/sessions.test.ts`, `test/fixtures/operations-contract.json`,
  `.ledger/templates/session.md`, `.ledger/config.yaml`, `README.md`,
  `docs/SCHEMA.md`
- Changed: session filter, icon, tone, and stats in the reader; library and
  CLI tests; regenerated contract; shipped template and dogfood config.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Projects gain a `.ledger/sessions/` directory on `init`; existing projects get
it through config defaults the first time a session is written. The reader
shows sessions as a filterable kind. `doctor` warns about expired sessions
through the stale check but does not fail.

## Invariants

- Session ids are numbered per kind with the configured prefix and width.
- A session past `expires` that is not promoted is an `expired-session` stale
  signal and is the only thing `session prune --write` deletes.
- `session note` never duplicates a bullet and drops template placeholders.

## Verification

- `npm run typecheck`
- `npx vitest run` (250 tests, including `test/sessions.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `ledger scratch`, `session touch`, `session note`, `session close`, and
  `promote S0001` in this repository
- `npm run ci`

## Notes

Milestone two of 0.6 capture (B007). Next: `ledger ready`, then the Claude
Code hook installer that drives these session commands.
