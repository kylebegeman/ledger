---
id: "0104"
kind: "change"
title: "Prepare v0.5.0"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "release"
files:
  - "package.json"
  - "package-lock.json"
  - "docs/ROADMAP.md"
docs:
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The roadmap marks the Phase 11 engine server as shipped in 0.5.0 and names capture as the next slice."
  docs:
    - "docs/ROADMAP.md"
decisions:
  - "D005"
commits: []
related:
  - "0099"
  - "0100"
  - "0101"
  - "0102"
  - "0103"
release: "v0.5.0"
---

# 0104: Prepare V0.5.0

## Summary

Bumped the package to 0.5.0 and marked the roadmap's Phase 11 engine server as
shipped. The release record for v0.5.0 groups the engine server (0099), CLI
delegation (0100), live reload (0101), MCP resources and prompts (0102), and
shared search scoring (0103).

## Why

0.5 is the engine server slice of decision D005: a loopback process with a
JSON API, an event stream, live reload, and MCP over HTTP, with CLI commands
delegating to its warm cache. All five milestones merged with receipts; this
change cuts the version.

## Changed Files

### Version and roadmap

- Files: `package.json`, `package-lock.json`, `docs/ROADMAP.md`
- Changed: version 0.5.0; Phase 11 status lists the engine server as shipped
  and capture as next.
- On conflict: The tag must equal the package version.

## Behavior And UX Impact

None beyond the version. The release record's public notes summarize the
user-facing changes.

## Invariants

- The package version and the release tag agree.

## Verification

- `npm run ci`
- `ledger release v0.5.0 --include-unreleased --assign --status released --date 2026-09-16 --write`

## Notes

Milestone six of 0.5: the release itself.
