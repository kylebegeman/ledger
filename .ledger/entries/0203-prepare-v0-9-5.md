---
id: "0203"
kind: change
title: Prepare v0.9.5
date: 2026-09-28
updated: 2026-09-28
status: draft
areas: [release]
files:
  - package.json
  - package-lock.json
  - README.md
  - docs/PUBLISHING.md
  - docs/HANDOFF.md
  - assets/readme/adopt.svg
  - scripts/readme-recordings.mjs
  - .ledger/releases/v0.9.5.md
  - .ledger/entries/0196-rebuild-the-reader-s-web-presentation.md
  - .ledger/entries/0197-rewrite-the-readme-and-publish-the-live-example.md
  - .ledger/entries/0198-elevate-the-reader-design-and-simplify-theme-preferences.md
  - .ledger/entries/0199-distill-the-reader-into-a-compact-working-archive.md
  - .ledger/entries/0200-replace-the-ledger-icon-and-wordmark.md
  - .ledger/entries/0201-refine-reader-navigation-and-adopt-a-warm-copper-palette.md
  - .ledger/entries/0202-rebuild-the-readme-around-a-recorded-tour-and-refine-both-themes.md
symbols: []
docs:
  - README.md
  - docs/PUBLISHING.md
  - docs/HANDOFF.md
docsImpact:
  status: updated
  reason: Installation pins, publishing examples, and the handoff describe v0.9.5 and the deployed reader.
  docs:
    - README.md
    - docs/PUBLISHING.md
    - docs/HANDOFF.md
related: ["0196", "0197", "0198", "0199", "0200", "0201", "0202"]
release: "v0.9.5"
commits: []
---

# 0203: Prepare v0.9.5

## Summary

Prepares v0.9.5 with the redesigned reader, new visual identity, revised README,
and recorded tour. Updates installation pins and assigns the merged redesign
receipts to the release. The live reader and public changelog deploy from master.

## Why

Kyle approved merging the redesign, deploying the live example, and tagging the
next release. PR #39 merged on 2026-09-28 after all seven CI checks passed.

## Changed Files

### Version and release metadata

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.5.md`,
  and receipts 0196 through 0202.
- Changed: package version 0.9.5, merged receipts marked landed, release
  assignment, and public notes covering the final reader and identity.
- On conflict: keep package, lockfile, release record, and tag versions aligned.

### Setup and handoff

- Files: `README.md`, `docs/PUBLISHING.md`, `docs/HANDOFF.md`, `assets/readme/adopt.svg`
- Changed: setup and action pins use 0.9.5; generated adoption artwork follows
  the version; the handoff records the merged redesign and deployment workflow.
- On conflict: regenerate artwork from its script and preserve historical versions.

### Recording failure cleanup

- File: `scripts/readme-recordings.mjs`
- Changed: frame-write failures are caught and routed through the recording's
  error and cleanup path so the browser and server do not remain orphaned.
- On conflict: errors from asynchronous event callbacks must not bypass cleanup.

## Behavior And UX Impact

The published CLI reports 0.9.5 and carries the redesigned reader. The README
links to this repository's deployed history and changelog. There are no new
production dependencies or changes to the library's exported API.

## Invariants

- The tag, package version, and release record agree.
- The release includes receipts 0196 through 0203.
- The public changelog includes only released versions and Public Notes.
- README browser media is excluded from the npm package; brand assets are included.
- Tag publication uses the existing trusted-publishing workflow.

## Verification

- `node dist/cli.js ready 0196 0197 0198 0199 0200 0201 0202` passed before
  marking the merged entries landed.
- PR #39 passed all seven remote CI checks before rebase merge.
- Initial Pages deployment from master passed and both public URLs return HTTP 200.
- `node dist/cli.js doctor` reports a passing write-state check.

- `npm run ci` exited 0: 530 tests across 63 files, typecheck, build, Ledger CI,
  and package dry run. `npm run release:build` and `npm run readme:check` passed.
- Both rendered profiles pass their budgets: about 4.08 MB internal and 383 KB
  public. The public output includes the new v0.9.5 notes; integrity covers
  259 source records.
- The recording failure was verified with an injected first-frame write error:
  exit 1, one failed write, Chromium and the server closed, temporary files
  removed, and no media published. Syntax and diff checks pass.
- `node dist/cli.js stale --check` exits 1 solely for the existing expired
  S0007 session. Doctor otherwise passes, including write-state and render budgets.
- `node dist/cli.js version` reports 0.9.5 and `unreleased` reports zero entries
  after all eight receipts are assigned.

## Notes

The release tag is applied to master after the release preparation PR merges.
The existing expired S0007 session is unrelated to the release and is retained.
