---
id: "0036"
kind: "change"
title: "Prepare v0.1.4 release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "package"]
files:
  - "package.json"
  - "package-lock.json"
  - ".ledger/entries/0035-mcp-agent-integration.md"
  - ".ledger/entries/0036-prepare-v0-1-4-release.md"
  - ".ledger/releases/v0.1.4.md"
symbols:
  - "v0.1.4"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits:
  - "07a92de"
release: "v0.1.4"
---

# 0036: Prepare v0.1.4 Release

## Summary

Bumps the package to `0.1.4`, assigns the MCP integration work to `v0.1.4`, and
generates the release record.

## Why

The MCP integration is intentionally released as its own patch so the agent
integration work is easy to identify and verify independently from the
open-source packaging release.

## Changed Files

### package.json and package-lock.json

- What changed: Bumps the package version to `0.1.4`.
- Anchor: `version`
- On conflict: Keep package metadata aligned with the `v0.1.4` tag.

### .ledger/entries/0035-mcp-agent-integration.md and .ledger/entries/0036-prepare-v0-1-4-release.md

- What changed: Records commit and release metadata for the MCP patch.
- Anchor: `release`
- On conflict: Preserve `v0.1.4` assignment for the MCP slice.

### .ledger/releases/v0.1.4.md

- What changed: Adds the generated release document for `v0.1.4`.
- Anchor: `v0.1.4`
- On conflict: Regenerate with `ledger release v0.1.4 --status released
  --date 2026-06-29 --write` after resolving entry metadata.

## Behavior And UX Impact

Users can install the patch release to access `ledger mcp` and the exported MCP
helpers.

## Invariants

- Package version, release record, and Git tag must agree.
- `v0.1.4` should contain the MCP patch and release prep only.
- `ledger unreleased` should be empty after release prep.

## Verification

- `npm run ci`
- `node dist/cli.js unreleased`

## Notes

This patch release keeps MCP integration separate from the prior packaging
release.
