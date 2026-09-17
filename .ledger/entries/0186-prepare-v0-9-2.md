---
id: "0186"
kind: "change"
title: "Prepare v0.9.2"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.9.2.md"
  - "README.md"
  - "docs/SCHEMA.md"
  - "assets/readme/adopt.svg"
  - "assets/readme/hero.png"
  - "assets/readme/palette.png"
  - "assets/readme/changelog.png"
  - "assets/readme/receipt.png"
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
  - ".ledger/sessions/S0005-claude-code-session-2026-09-17.md"
  - "test/commandReference.test.ts"
  - "test/commands.test.ts"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/ROADMAP.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The handoff and roadmap describe 0.9.2 with its decisions and next slices; the README and schema pin 0.9.2."
  docs:
    - "docs/HANDOFF.md"
    - "docs/ROADMAP.md"
commits: []
related:
  - "0175"
  - "0176"
  - "0177"
  - "0178"
  - "0179"
  - "0180"
  - "0181"
  - "0182"
  - "0183"
  - "0184"
  - "0185"
release: "v0.9.2"
---

# 0186: Prepare v0.9.2

## Summary

Bumps the package to 0.9.2 and writes the v0.9.2 release record over the
receipts landed since v0.9.1, 0175 to 0186.

- **Pins.** The README quick start, the installed-hook note, the CI example,
  the `adopt` card, and the schema example pin 0.9.2.
- **Screenshots.** The four README screenshots are recaptured with
  `scripts/readme-screenshots.mjs`. They show the reader's copy buttons, the
  titled relationship in the demo receipt, and v0.9.2 at the top of the
  changelog.
- **Handoff and roadmap.** Both describe 0.9.2. The handoff records this
  release's decisions, the next slices, and the new threads. The session
  record for this work is committed with it.

## Why

Kyle asked for every remaining 0.9.x item as the next patch release, and
since 0.9.0 releases are patches unless he asks otherwise.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.2.md`
- Changed: The version is 0.9.2. The release record has a summary, Public
  Notes, and receipts 0175 to 0186.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version, or the release
  workflow fails its version check.

### Pins and images

- Files: `README.md`, `docs/SCHEMA.md`, `assets/readme/adopt.svg`,
  `assets/readme/hero.png`, `assets/readme/palette.png`,
  `assets/readme/changelog.png`, `assets/readme/receipt.png`
- Changed:
  - `@kylebegeman/ledger@0.9.1` and `kylebegeman/ledger@v0.9.1` became
    0.9.2.
  - The card was regenerated with `node scripts/readme-assets.mjs`.
  - The screenshots were recaptured with
    `node scripts/readme-screenshots.mjs`.
- Anchor: `In any other repository`, `agents.command`
- On conflict: Regenerate the card and the screenshots; never edit them by
  hand.

### Handoff, roadmap, and session

- Files: `docs/HANDOFF.md`, `docs/ROADMAP.md`,
  `.ledger/sessions/S0005-claude-code-session-2026-09-17.md`
- Changed:
  - The handoff names 0.9.2 in the product state and the release table. It
    records the decisions from 0176 to 0185, the next slices, and the new
    threads.
  - The roadmap statuses for drafting, the reader, agent integrations, and
    the memory engine include 0.9.2.
  - The session record lists the work, its lessons, and the receipts, and it
    is closed.
- Anchor: `Where the product stands`, `Next slices, in order`
- On conflict: Keep the handoff describing the current state; record the
  publish in a later receipt.

### Windows CI

- Files: `test/commandReference.test.ts`, `test/commands.test.ts`
- Changed:
  - The reference test normalizes CRLF line endings, as the contract test
    does, because Windows checkouts convert `docs/COMMANDS.md`.
  - The metrics test gives its fixture generous latency budgets. It checks
    the command's result, and a shared Windows runner once took longer than
    the default one-second step budget.
- Anchor: `matches the committed docs/COMMANDS.md`,
  `runs metrics without intercepting console output`
- On conflict: Keep timing budgets out of tests that check command output.

## Behavior And UX Impact

None beyond the receipts it releases.

## Invariants

- The package version, the release record id, and the tag agree.
- Every receipt landed since v0.9.1 is assigned to v0.9.2.

## Verification

- `node dist/cli.js ready 0186`
- `node dist/cli.js unreleased` reports no receipts once the release is
  written.
- `node dist/cli.js release notes v0.9.2`
- `npm run readme:check`
- `npm run ci`
- The first CI run on the pull request failed on Windows: the reference test
  saw CRLF line endings, and on Node 24 one metrics step overran its budget.
  Both tests were fixed, and the run was repeated.

## Notes

After the merge, the `v0.9.2` tag publishes through
`.github/workflows/release.yml`. Kore then moves its pin, and Kyle trusts the
changed hooks on the Hooks page of the Codex app's settings.
