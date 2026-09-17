---
id: "0155"
kind: "change"
title: "Prepare v0.8.1"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.8.1.md"
  - ".github/workflows/release.yml"
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
  - "assets/readme/adopt.svg"
  - ".ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md"
  - ".ledger/entries/0142-keep-hook-drafts-from-duplicating-receipts-written-by-hand.md"
  - "test/delegation.test.ts"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The handoff records 0.8.0 as published and 0.8.1 as prepared with the audit's fixes, decisions, and open questions; the roadmap names the patch; the README and schema pin 0.8.1."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
backlog:
  - "B010"
related:
  - "0149"
  - "0150"
  - "0151"
  - "0152"
  - "0153"
  - "0154"
  - "0141"
release: "v0.8.1"
---

# 0155: Prepare v0.8.1

## Summary

Bumps the package to 0.8.1 and writes the v0.8.1 release record over the
fixes from the audit of 0.8.0, receipts 0149 through 0154, and this one. The
release workflow now takes the GitHub Release notes from
`ledger release notes`, which prints the same text the inline script
extracted. The README quick start, CI example, and adopt card and the schema
example pin 0.8.1. The handoff records 0.8.0 as published through pull
requests #20 and #21, Kore's move to 0.8.0 in kylebegeman/forge#25, the
audit's fixes and decisions, and the questions left open; B010's pin check is
met. Receipt 0142 acknowledges the helper 0151 renamed, and the delegation
tests clear `LEDGER_NO_DAEMON` so the gate passes from a shell that exports
it.

## Why

The audit of the 0.8.0 slice found capture bugs that lose data in real
sessions: parallel tool calls dropped touched paths, and a Ledger root inside
a repository drafted nothing. Those fixes, plus the reader and trust fixes,
should reach Kore before its second live session. The inline notes script
was a listed debt now that `release notes` exists; its output was compared
line for line with the script's before the swap.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.8.1.md`
- Changed: version 0.8.1; the release record with a summary, Public Notes,
  and receipts 0149 through 0155.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version or the release
  workflow fails its version check.

### Release workflow

- Files: `.github/workflows/release.yml`
- Changed: the Create GitHub release step runs
  `node dist/cli.js release notes "$GITHUB_REF_NAME"` after the build
  instead of an inline Node script.
- Anchor: `Create GitHub release`
- On conflict: The step still skips when no release record exists and falls
  back to a pointer when the notes are empty.

### Gate fixes

- Files: `test/delegation.test.ts`,
  `.ledger/entries/0142-keep-hook-drafts-from-duplicating-receipts-written-by-hand.md`
- Changed: a `beforeEach` deletes `LEDGER_NO_DAEMON`, which made delegation
  decline when the gate ran from a shell that exported it; 0142 lists
  `staleRefs` for `pendingWorkingTreePaths`, renamed in 0151, and relates to
  0151.
- Anchor: `beforeEach`, `staleRefs`
- On conflict: The delegation tests set the variable themselves when they
  need it.

### Pins, docs, and backlog

- Files: `README.md`, `docs/SCHEMA.md`, `assets/readme/adopt.svg`,
  `docs/HANDOFF.md`, `docs/ROADMAP.md`,
  `.ledger/backlog/B010-adoption-and-capture-fixes-from-the-kore-rollout.md`
- Changed: 0.8.1 pins, regenerated with `node scripts/readme-assets.mjs`,
  which changed only the adopt card's version; the handoff's state, release
  table, decisions, next slices, and open threads; the roadmap's release
  list; B010's promotion notes.
- Anchor: `Where the product stands`, `Promotion Notes`
- On conflict: Keep the handoff as the resume point and retire what stopped
  being true.

## Behavior And UX Impact

`ledger version` prints 0.8.1. GitHub Releases carry the same notes as
before. Readers of the README copy commands pinned to the patch.

## Invariants

- The release record lists every unreleased landed change entry at the time
  of the release.
- The GitHub Release notes equal `ledger release notes <tag>`.
- README cards regenerate byte-identical apart from the pinned version.

## Verification

- `node dist/cli.js version`
- `node dist/cli.js release v0.8.1 --include-unreleased --assign --status released --write`
- `node dist/cli.js unreleased` (empty afterwards)
- `node dist/cli.js release notes v0.8.0` compared with the workflow's
  inline extraction: identical apart from the trailing newline the shell
  strips.
- `node dist/cli.js doctor` and `node dist/cli.js stale` (66 historical
  issues, none from this release)
- `LEDGER_NO_DAEMON=1 npx vitest run test/delegation.test.ts`
- `npm run ci`

## Notes

Release nine of the Phase 11 sequence. The tag is applied on `master` after
the pull request merges.
