---
id: "0165"
kind: "change"
title: "Extend an existing release record with release --update"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "src/release.ts"
  - "src/operations/definitions/authoring.ts"
  - "test/release.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
  - "README.md"
symbols:
  - "applyRelease"
  - "ApplyReleaseOptions"
  - "ApplyReleaseResult"
  - "extendReleaseRecord"
  - "releaseOperation"
docs:
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc, the release steps in CONTRIBUTING, and the README command table describe --update and when --assign writes."
  docs:
    - "docs/ARCHITECTURE.md"
    - "CONTRIBUTING.md"
    - "README.md"
commits: []
related:
  - "0043"
  - "0047"
  - "0155"
---

# 0165: Extend An Existing Release Record With Release --update

## Summary

`ledger release <version> --update` adds the selected entries that an
existing release record does not list. Their ids join `entries`, their lines
join `## Changes`, and `updated` moves to today. The summary, public notes,
verification, and known issues stay as written. With `--include-unreleased`
and `--assign`, one transaction adds a receipt that landed after the record
was written and assigns it. Without `--include-unreleased`, `--update` adds
entries already assigned to the version that the record misses. `--write`
and `--update` cannot be combined, and `--update` without a record is an
error. The help now says `--assign` writes to entries with or without
`--write`.

## Why

Every late receipt in the 0.8 releases (0142 to 0148, 0149 to 0157) needed
`--assign` without `--write` and then a hand edit of the release record,
because `--write` refuses an existing record. That workaround sat in the
handoff as a debt. Making `--write` merge into an existing record was
rejected: 0047's invariant keeps `--write` from ever touching an existing
file, and the public notes in a record are written by hand. Making `--assign`
a preview without `--write` was also rejected, because scripts and the
documented flow rely on it writing.

## Changed Files

### Release records

- Files: `src/release.ts`
- Changed: `ApplyReleaseOptions` gained `update`, and `ApplyReleaseResult`
  gained `updated` with the record path and the added ids.
  `extendReleaseRecord` reads the existing record from the catalog, appends
  the missing ids and change lines (dropping the empty placeholder line), and
  sets `updated`. It plans the write against the record's hash, so an edit in
  between fails the transaction.
- Anchor: `extendReleaseRecord`, `ApplyReleaseOptions`, `applyRelease`
- On conflict: Never let `--update` touch Summary, Public Notes,
  Verification, or Known Issues, and keep `--write` refusing existing
  records.

### Operation

- Files: `src/operations/definitions/authoring.ts`,
  `test/fixtures/operations-contract.json`
- Changed: `release` takes `update` and returns `updated`. The usage shows
  `[--write | --update]`, the help explains both and the late-receipt
  command, and the text output names the added ids with a reminder to write
  their public notes. The contract gains the optional input and output
  fields.
- Anchor: `releaseOperation`
- On conflict: Regenerate the contract with
  `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`.

### Docs and tests

- Files: `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `README.md`,
  `test/release.test.ts`
- Changed: the architecture doc and CONTRIBUTING's release steps describe
  `--update`, and the README command table has a row for it. A test covers
  the missing-record error, the refused `--write --update`, an added receipt
  with hand-written notes kept and its release assigned, and a second run
  that changes nothing.
- Anchor: `ledger release <version>`,
  `A receipt that lands after the record exists`
- On conflict: Keep the late-receipt command in CONTRIBUTING in step with
  the help text.

## Behavior And UX Impact

Adding a late receipt to a release takes one command, followed by its
public note. Nothing changes for `--write`, and `--assign` still writes
whenever it is passed.

## Invariants

- `--update` never changes a release record's Summary, Public Notes,
  Verification, or Known Issues.
- `--write` never overwrites an existing release record, and cannot be
  combined with `--update`.
- An entry already listed by the record is never added twice.

## Verification

- `npx vitest run test/release.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `npm run typecheck`
- `node dist/cli.js ready 0165`
- `npm run ci`

## Notes

The handoff's debt about adding receipts to an existing record is resolved
by this command. Its note that `--assign` writes without `--write` now lives
in the help text.
