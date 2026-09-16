---
id: "0123"
kind: "change"
title: "Prepare v0.7.0"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
  - ".ledger/backlog/B008-trust-provenance-and-typescript-hardening.md"
  - ".ledger/entries/0122-hook-drafted-receipts-collide-with-hand-written-receipt-ids.md"
docs:
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The roadmap marks Phase 11 trust as shipped in 0.7.0; the handoff records the new state, how coverage, evidence, and the chunked reader work in this repository, the publish step, the next slices, and the open threads."
  docs:
    - "docs/ROADMAP.md"
    - "docs/HANDOFF.md"
decisions:
  - "D005"
commits: []
backlog:
  - "B008"
related:
  - "0112"
  - "0113"
  - "0114"
  - "0115"
  - "0116"
  - "0117"
  - "0118"
  - "0119"
  - "0120"
  - "0121"
  - "0122"
release: "v0.7.0"
---

# 0123: Prepare v0.7.0

## Summary

Bumps the package to 0.7.0, marks Phase 11 trust as shipped in the roadmap,
lands backlog B008 with promotion notes naming every receipt, captures the
dogfood finding about hook drafts colliding with hand-written receipts as
product note 0122, and rewrites the handoff for the next session. The v0.7.0
release record groups receipts 0112 through 0121 and this one, with Public
Notes written for readers of the GitHub Release.

## Why

Ten trust milestones landed on the `trust-0.7` branch. The version bump and
release record make the slice publishable through the tag-driven workflow, and
the handoff keeps the publish step, the historical anchor drift, the chunked
reader behavior, and the hook draft friction explicit so the next session does
not rediscover them.

## Changed Files

### Version

- Files: `package.json`, `package-lock.json`
- Changed: version 0.7.0.
- Anchor: `version`
- On conflict: The tag must match the package version or the release workflow
  fails its version check.

### Records and docs

- Files: `docs/ROADMAP.md`, `docs/HANDOFF.md`,
  `.ledger/backlog/B008-trust-provenance-and-typescript-hardening.md`,
  `.ledger/entries/0122-hook-drafted-receipts-collide-with-hand-written-receipt-ids.md`
- Changed: Phase 11 status; the handoff's state, decisions, repository
  practices, next slices, conventions, and open threads; B008 status and
  promotion notes; the product note.
- Anchor: `Phase 11: Local Memory Engine`
- On conflict: Keep the handoff as the resume point; retire sections that stop
  being true rather than appending history.

## Behavior And UX Impact

`ledger version` prints 0.7.0. No runtime behavior changes in this receipt.

## Invariants

- The release record lists every unreleased landed change entry at the time of
  the release.
- The handoff names the exact publish command for the pending tag.

## Verification

- `node dist/cli.js version`
- `node dist/cli.js release v0.7.0 --include-unreleased --assign --status released --date 2026-09-16 --write`
- `node dist/cli.js unreleased` (empty afterwards)
- `node dist/cli.js doctor`
- `npm run ci`

## Notes

Release seven of the Phase 11 sequence. The tag is applied on `master` after
the pull request merges.
