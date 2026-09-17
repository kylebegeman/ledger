---
id: "0174"
kind: "change"
title: "Prepare v0.9.1"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/releases/v0.9.1.md"
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/HANDOFF.md"
  - "assets/readme/adopt.svg"
  - ".ledger/sessions/S0004-mcp-v2-migration-and-confirmed-write-tools.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records 0.9.1 as prepared with the MCP decision, the dependency policy, the next slices, and the SDK maturity thread; the README and schema pin 0.9.1."
  docs:
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D008"
related:
  - "0170"
  - "0171"
  - "0172"
  - "0173"
release: "v0.9.1"
---

# 0174: Prepare V0.9.1

## Summary

Bumps the package to 0.9.1 and writes the v0.9.1 release record over the
receipts landed since v0.9.0:

- 0171: the publish record, resolved product notes, and the render budget
- 0172: the Codex app's hook review in the installer hint
- 0173: MCP on the v2 SDK with confirmed write tools
- this receipt

The README quick start, the installed-hook note, the CI example, the
`adopt` card, and the schema example pin 0.9.1.

The handoff now describes 0.9.1 as prepared. Its dependency policy names
the MCP server SDK, and the MCP decision replaces the old rule that kept
writes off MCP. The next slices are publishing and moving Kore, then new
features. A new thread covers the young v2 SDK line. The session record for
this part of the session is committed with it.

## Why

Kyle asked for the MCP work and a patch release, and since 0.9.0 releases
are patches unless he asks otherwise. The MCP change alters the
package's production dependencies and adds tools, which 0.x patch releases
may carry under that rule.

## Changed Files

### Version and release record

- Files: `package.json`, `package-lock.json`, `.ledger/releases/v0.9.1.md`
- Changed: version 0.9.1, and the release record with a summary, Public
  Notes, and receipts 0171 to 0174.
- Anchor: `version`, `Public Notes`
- On conflict: The tag must match the package version, or the release
  workflow fails its version check.

### Pins

- Files: `README.md`, `docs/SCHEMA.md`, `assets/readme/adopt.svg`
- Changed: `@kylebegeman/ledger@0.9.0` and `kylebegeman/ledger@v0.9.0` became
  0.9.1; the card was regenerated with `node scripts/readme-assets.mjs`.
- Anchor: `In any other repository`, `agents.command`
- On conflict: Regenerate the card; never edit it by hand.

### Handoff and session

- Files: `docs/HANDOFF.md`,
  `.ledger/sessions/S0004-mcp-v2-migration-and-confirmed-write-tools.md`
- Changed:
  - The product state and release table name 0.9.1.
  - The decisions carry the dependency policy and D008.
  - The next slices and the quick check match the new state.
  - The session record lists the paths, receipts, and lessons of the MCP
    work, and it is closed.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Open threads and small debts`
- On conflict: Keep the handoff describing the current state; record the
  publish in a later receipt.

## Behavior And UX Impact

None beyond the receipts it releases.

## Invariants

- The package version, the release record id, and the tag agree.
- Every receipt landed since v0.9.0 is assigned to v0.9.1.

## Verification

- `node dist/cli.js ready 0174`
- `node dist/cli.js unreleased` reports no receipts after the release is
  written.
- `node dist/cli.js release notes v0.9.1`
- `npm run readme:check`
- `npm run ci`

## Notes

After the merge, the `v0.9.1` tag publishes through
`.github/workflows/release.yml`. Kore then moves its pin, and Kyle trusts the
changed hooks on the Hooks page of the Codex app's settings.
