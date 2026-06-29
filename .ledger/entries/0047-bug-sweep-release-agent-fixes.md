---
id: "0047"
kind: "change"
title: "Bug sweep release and agent integration fixes"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "mcp", "ci", "config", "tests", "docs"]
files:
  - ".ledger/config.yaml"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/ci.ts"
  - "src/cli.ts"
  - "src/mcp.ts"
  - "src/release.ts"
  - "test/cliE2e.test.ts"
  - "test/mcp.test.ts"
  - "test/release.test.ts"
  - ".ledger/entries/0047-bug-sweep-release-agent-fixes.md"
symbols:
  - "assertReleaseDocumentWritable"
  - "runLedgerMcpTool"
  - "runCiChecks"
  - "releaseCommand"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
commits: []
---

# 0047: Bug Sweep Release And Agent Integration Fixes

## Summary

Fixes safe issues found during a full bug sweep: release assignment now
preflights release-file writes before mutating entries, MCP exposes integrity
verification, CI reuses changed-file discovery, and this repo's Ledger config
ignores generated `docs/llm/START_HERE.md`.

## Why

The release assignment workflow had a partial-mutation risk when `--assign` and
`--write` were combined with an existing release file. The MCP surface also
missed the newer integrity command, which weakened the agent-first positioning.

## Changed Files

### src/release.ts and src/cli.ts

- What changed: Adds `assertReleaseDocumentWritable` and calls it before
  `release --assign --write` mutates source entries.
- Anchor: `assertReleaseDocumentWritable`
- On conflict: Preserve non-overwriting release behavior and avoid mutating
  entries when the release file cannot be written.

### src/mcp.ts

- What changed: Adds `ledger_verify_integrity` with optional generated artifact
  writing.
- Anchor: `ledger_verify_integrity`
- On conflict: Keep MCP tool behavior delegated to existing integrity helpers.

### src/ci.ts

- What changed: Reuses the coverage changed-file list for docs impact instead
  of asking Git for the same file list twice.
- Anchor: `runCiChecks`
- On conflict: Keep CI check models unchanged while avoiding redundant Git work.

### .ledger/config.yaml

- What changed: Ignores generated `docs/llm/START_HERE.md` in this repo's own
  Ledger git policy.
- Anchor: `git.ignore`
- On conflict: Keep generated docs routing outputs ignored by Ledger coverage.

### test/release.test.ts, test/cliE2e.test.ts, and test/mcp.test.ts

- What changed: Adds release preflight, CLI no-mutation regression, and MCP
  integrity coverage.
- Anchor: `release --assign --write`
- On conflict: Preserve coverage for the data-safety regression.

### README.md and docs/ARCHITECTURE.md

- What changed: Documents that MCP also exposes integrity verification.
- Anchor: `MCP`
- On conflict: Keep the public agent-tool list aligned with the implementation.

## Behavior And UX Impact

Release assignment is safer, MCP agents can request integrity data, and CI does
less redundant Git work.

## Invariants

- `release --assign --write` must not mutate entries when the release file
  already exists.
- MCP integrity output remains derived from Ledger source records.
- Generated docs routing outputs remain ignored.
- CI output shape remains stable.

## Verification

- `npm run typecheck`
- `npx vitest run test/release.test.ts test/cliE2e.test.ts test/mcp.test.ts test/ci.test.ts`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js verify-integrity --json`

## Notes

No product-direction items were changed during this sweep.
