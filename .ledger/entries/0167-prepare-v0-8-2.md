---
id: "0167"
kind: "change"
title: "Prepare v0.8.2"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.8.2.md"
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
  - "assets/readme/adopt.svg"
  - ".ledger/sessions/S0003-claude-code-session-2026-09-17.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The handoff records 0.8.2 as prepared with its decisions, the next slices, and the debts it closed; the roadmap names the patch; the README and schema pin 0.8.2."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
backlog:
  - "B010"
related:
  - "0158"
  - "0159"
  - "0162"
  - "0163"
  - "0164"
  - "0165"
  - "0166"
  - "0155"
release: "v0.8.2"
---

# 0167: Prepare V0.8.2

## Summary

Bumps the package to 0.8.2 and writes the v0.8.2 release record over the
receipts that landed after v0.8.1: the publish record (0158), the Windows test
timeout (0159), B010's closure (0162), the draft fixes (0163), the records
cleanup (0164), `release --update` (0165), the TypeScript loader and
dependency updates (0166), and this one. The README quick start, the
installed-hook note, the CI example, the `adopt` card, and the schema example
pin 0.8.2.

The handoff now describes 0.8.2 as prepared. It adds the decisions the
receipts made, drops the debts they closed, and names the next slices:
publishing, then B009 and MCP protocol 2026-07-28. It also records Kore's
OCI staging fix in kylebegeman/forge#28, and it corrects the Dossier note,
whose `next` branch is merged and whose CI was already Node 22 and 24.

## Why

Kore should run the draft fixes and the TypeScript loader fix before its next
sessions, and published 0.8.1 crashes drafts next to TypeScript 7, which is
npm's `latest`. The remaining receipts are records and tooling that belong in
the same patch.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.8.2.md`
- Changed: version 0.8.2, and the release record with a summary, Public
  Notes, and receipts 0158, 0159, and 0162 to 0167.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version, or the release
  workflow fails its version check.

### Pins

- Files: `README.md`, `docs/SCHEMA.md`, `assets/readme/adopt.svg`
- Changed: `@kylebegeman/ledger@0.8.1` and `kylebegeman/ledger@v0.8.1` became
  0.8.2; the card was regenerated with `node scripts/readme-assets.mjs`.
- Anchor: `In any other repository`, `agents.command`
- On conflict: Regenerate the card; never edit it by hand.

### Handoff, roadmap, and session

- Files: `docs/HANDOFF.md`, `docs/ROADMAP.md`,
  `.ledger/sessions/S0003-claude-code-session-2026-09-17.md`
- Changed: the product state and release table name 0.8.2. The decisions
  cover drafted symbols, mid-turn checks, `release --update`, and the
  TypeScript holds, and the next slices and debts match the new state. The
  roadmap summary names the patch, and the session record links this
  release's receipts.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Open threads and small debts`
- On conflict: Keep the handoff describing the current state; record the
  publish in a later receipt.

## Behavior And UX Impact

None beyond the receipts it releases.

## Invariants

- The package version, the release record id, and the tag agree.
- Every receipt landed since v0.8.1 is assigned to v0.8.2.

## Verification

- `node dist/cli.js ready 0167`
- `node dist/cli.js unreleased` reports no receipts after the release is
  written.
- `node dist/cli.js release notes v0.8.2`
- `npm run readme:check`
- `npm run ci`

## Notes

After the merge, the `v0.8.2` tag publishes through
`.github/workflows/release.yml`, and Kore moves its pin with the installers.
