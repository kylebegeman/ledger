---
id: "0191"
kind: "change"
title: "Prepare v0.9.3"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - ".ledger/releases/v0.9.3.md"
  - ".ledger/sessions/S0006-claude-code-session-2026-09-17.md"
  - "README.md"
  - "assets/readme/adopt.svg"
  - "assets/readme/changelog.png"
  - "assets/readme/hero.png"
  - "assets/readme/palette.png"
  - "docs/HANDOFF.md"
  - "docs/PUBLISHING.md"
  - "docs/ROADMAP.md"
  - "docs/SCHEMA.md"
  - "package-lock.json"
  - "package.json"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/PUBLISHING.md"
  - "docs/ROADMAP.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The handoff and roadmap describe 0.9.3 with its decision and next slices; the README, schema, and publishing guide pin 0.9.3."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
related:
  - "0188"
  - "0189"
  - "0190"
  - "S0006"
release: "v0.9.3"
---

# 0191: Prepare v0.9.3

## Summary

Bumps the package to 0.9.3 and writes the v0.9.3 release record over the
receipts landed since v0.9.2, 0188 to 0191.

- **Pins.** The README quick start, the installed-hook note, the CI example,
  the `adopt` card, the schema example, and the publishing workflow pin
  0.9.3. The quick start for other repositories installs the Codex hooks
  with `--launcher`.
- **Screenshots.** The README screenshots are recaptured with
  `scripts/readme-screenshots.mjs`, so the changelog shows v0.9.3 first and
  the library shows this release's receipts.
- **Handoff and roadmap.** Both describe 0.9.3. The handoff lists the
  release, records the launcher decision, drops the finished product note
  from the next slices, and orders the release table.

## Why

After trusting Kore's changed Codex hooks by hand again, Kyle asked whether
this step could be streamlined, then chose to build the launcher as the next
patch release. Since 0.9.0, releases are patches unless he asks otherwise.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.3.md`
- Changed: The version is 0.9.3. The release record has a summary, Public
  Notes, and receipts 0188 to 0191.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version, or the release
  workflow fails its version check.

### Pins and images

- Files: `README.md`, `docs/SCHEMA.md`, `docs/PUBLISHING.md`,
  `assets/readme/adopt.svg`, `assets/readme/hero.png`,
  `assets/readme/palette.png`, `assets/readme/changelog.png`
- Changed:
  - `@kylebegeman/ledger@0.9.2` and `kylebegeman/ledger@v0.9.2` became
    0.9.3.
  - The card was regenerated with `node scripts/readme-assets.mjs`.
  - The screenshots were recaptured with
    `node scripts/readme-screenshots.mjs`; the demo receipt came out
    unchanged.
- Anchor: `In any other repository`, `agents.command`
- On conflict: Regenerate the card and the screenshots; never edit them by
  hand.

### Handoff, roadmap, and session

- Files: `docs/HANDOFF.md`, `docs/ROADMAP.md`,
  `.ledger/sessions/S0006-claude-code-session-2026-09-17.md`
- Changed:
  - The handoff's release table lists 0.9.1 before 0.9.2 and adds 0.9.3.
  - The handoff records the launcher decision and counts twelve resolved
    product notes.
  - Its next slices end with one last approval of Kore's hooks and the
    features left out on purpose.
  - The roadmap's memory engine status includes 0.9.3.
  - The session record for this work is committed with it.
- Anchor: `What shipped this cycle`, `Next slices, in order`
- On conflict: Keep the handoff describing the current state; record the
  publish in a later receipt.

## Behavior And UX Impact

None beyond the receipts it releases.

## Invariants

- The package version, the release record id, and the tag agree.
- Every receipt landed since v0.9.2 is assigned to v0.9.3.

## Verification

- `node dist/cli.js ready 0191`
- `node dist/cli.js unreleased` reports no receipts once the release is
  written.
- `node dist/cli.js release notes v0.9.3`
- `npm run readme:check`
- `npm run ci`

## Notes

After the merge, the `v0.9.3` tag publishes through
`.github/workflows/release.yml`. Kore then moves to 0.9.3 with
`--launcher`, and Kyle approves its Codex hooks one last time.
