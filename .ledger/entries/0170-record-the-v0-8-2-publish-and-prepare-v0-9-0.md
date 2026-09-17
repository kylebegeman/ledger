---
id: "0170"
kind: "change"
title: "Record the v0.8.2 publish and prepare v0.9.0"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.9.0.md"
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
  reason: "The handoff records the 0.8.2 publish, Kore's move to it, 0.9.0 as prepared with the B009 and sidecar decisions, and the new next slices and debts; the roadmap names 0.9.0; the README and schema pin 0.9.0."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
backlog:
  - "B009"
related:
  - "0158"
  - "0167"
  - "0168"
  - "0169"
release: "v0.9.0"
---

# 0170: Record The V0.8.2 Publish And Prepare V0.9.0

## Summary

Records that 0.8.2 published from kylebegeman/ledger#25 and that Kore moved
to it in kylebegeman/forge#29 (Kore receipt 0007). Then it bumps the package
to 0.9.0 and writes the v0.9.0 release record over the Dossier visual system
(0168), the compact sidecars (0169), and this receipt. The README quick
start, the installed-hook note, the CI example, the `adopt` card, and the
schema example pin 0.9.0.

The handoff now describes 0.8.2 as published and 0.9.0 as prepared. It
records the design choices Kyle left to the assistant in B009 and the
compact sidecar choice. The next slices are publishing 0.9.0 and moving
Kore, then MCP protocol 2026-07-28 once Kyle approves its new production
dependencies, then new features. The debts list drops the two Dependabot
pull requests closed as superseded and adds the token drift check against
Dossier.

## Why

B009 was the last planned slice before the MCP work, and Kyle asked for
everything left to be finished and released. The reader's appearance
changes for every adopter who renders it, so this is a minor version rather
than a patch. The sidecars parse to the same values, and no command or
record format changed.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.0.md`
- Changed: version 0.9.0, and the release record with a summary, Public
  Notes, and receipts 0168 to 0170.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version, or the release
  workflow fails its version check.

### Pins

- Files: `README.md`, `docs/SCHEMA.md`, `assets/readme/adopt.svg`
- Changed: `@kylebegeman/ledger@0.8.2` and `kylebegeman/ledger@v0.8.2` became
  0.9.0; the card was regenerated with `node scripts/readme-assets.mjs`.
- Anchor: `In any other repository`, `agents.command`
- On conflict: Regenerate the card; never edit it by hand.

### Handoff, roadmap, and session

- Files: `docs/HANDOFF.md`, `docs/ROADMAP.md`,
  `.ledger/sessions/S0003-claude-code-session-2026-09-17.md`
- Changed:
  - The product state names the 0.8.2 publish and Kore's move, and it says
    Codex asks for hook approval again after each bump.
  - The release table lists 0.8.1 before 0.8.2 and adds 0.9.0.
  - The decisions record B009's choices and the compact sidecars, and the
    merge note covers the release tags from `v0.8.0` on.
  - The next slices, the debts, and the quick check match the new state.
  - The roadmap names 0.9.0 in Phases 6 and 11, and the session record
    links this release's receipts.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Open threads and small debts`
- On conflict: Keep the handoff describing the current state; record the
  publish in a later receipt.

## Behavior And UX Impact

None beyond the receipts it releases.

## Invariants

- The package version, the release record id, and the tag agree.
- Every receipt landed since v0.8.2 is assigned to v0.9.0.

## Verification

- `node dist/cli.js ready 0170`
- `node dist/cli.js unreleased` reports no receipts after the release is
  written.
- `node dist/cli.js release notes v0.9.0`
- `npm run readme:check`
- `npm run ci`

## Notes

After the merge, the `v0.9.0` tag publishes through
`.github/workflows/release.yml`. Kore then moves its pin with the
installers, and Kyle approves the changed Codex hooks with `/hooks`.
