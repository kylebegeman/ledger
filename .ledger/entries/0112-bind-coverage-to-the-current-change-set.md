---
id: "0112"
kind: "change"
title: "Bind coverage to the current change set"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "git"
  - "ci"
  - "trust"
files:
  - "src/coverage.ts"
  - "src/types.ts"
  - "src/config.ts"
  - "src/workspace.ts"
  - "src/operations/definitions/changes.ts"
  - "test/coverage.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "checkCoverage"
  - "LedgerCoverageMode"
  - "LedgerCoverageFile"
  - "coverageOperation"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema's coverage config documents git.coverage and the historical status; the architecture Git section describes current-change provenance; the README coverage row names the rule."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0111"
---

# 0112: Bind Coverage To The Current Change Set

## Summary

Coverage now distinguishes a change entry that belongs to the change under
inspection from any record that happens to mention a path. Under the new
default `git.coverage: current`, a required changed path is covered only when
a change entry listing it is itself added or modified in the working tree,
staged diff, or revision range. Paths listed only by older records get the new
`historical` status and count as missing, so `ledger ci` fails a pull request
that changes source without carrying its own receipt. `git.coverage: any` and
`ledger coverage --mode any` restore the old behavior for adoption. Results
carry the mode, the current entries found in the change set, the historical
paths, and per-file `currentEntries`.

## Why

Backlog B008's first acceptance check: a pull request that changes a required
path without a current receipt must fail coverage even when an old record
mentions the path. Every receipt in this repository lists files, so any later
edit to those files was silently covered forever, and the coverage gate had
stopped meaning "this change was recorded". The change set is already known
to coverage because `.ledger/**` paths are not ignored; the fix intersects it
with the catalog the way docs impact already does, and only change entries
count so a session record that merely lists touched paths cannot satisfy the
gate.

## Changed Files

### Coverage

- Files: `src/coverage.ts`, `src/types.ts`
- Changed: `checkCoverage` reads change details, collects change entries in
  the change set, and classifies each required path as covered, historical,
  or missing under the mode; result and file types gained `mode`,
  `historicalFiles`, `currentEntries`, and the `historical` status.
- Anchor: `checkCoverage`
- On conflict: Deleted paths in the change set never count as current
  entries, and only `change` kind records count.

### Config and operation

- Files: `src/config.ts`, `src/workspace.ts`,
  `src/operations/definitions/changes.ts`
- Changed: `git.coverage` with validation and serialization; `--mode` on
  `ledger coverage`; the formatter prints the mode and a `historical` line
  naming the outside records.
- Anchor: `coverageOperation`
- On conflict: The default stays `current`; keep `any` available so adopters
  with history are not blocked.

### Tests and docs

- Files: `test/coverage.test.ts`, `test/fixtures/operations-contract.json`,
  `README.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: a range test that proves historical, any-mode acceptance, and a
  refreshed receipt turning current; regenerated contract; docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Projects upgrading to 0.7 will see `historical` coverage failures on pull
requests that edit recorded files without a new or updated receipt, which is
the intended gate. Working trees and clean checkouts behave as before when
nothing changed. `ledger ci` output is unchanged in shape; JSON gains fields.

## Invariants

- A required path is covered under `current` only through a change entry in
  the same change set.
- `historical` implies at least one record outside the change set lists the
  path.
- `--mode any` reproduces pre-0.7 results.

## Verification

- `npm run typecheck`
- `npx vitest run` (271 tests, including the new coverage range test)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js coverage --explain` in this working tree before and after
  this receipt existed (historical, then covered)
- `npm run ci`

## Notes

Milestone one of 0.7 trust (B008). Next: per-file docs impact evidence.
