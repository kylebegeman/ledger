---
id: "0039"
kind: "change"
title: "Add integrity provenance report"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["integrity", "cli", "provenance", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/index.ts"
  - "src/integrity.ts"
  - "test/cliHelp.test.ts"
  - "test/integrity.test.ts"
  - ".ledger/entries/0039-integrity-provenance-report.md"
symbols:
  - "buildIntegrityReport"
  - "writeIntegrityArtifacts"
  - "verifyIntegrityCommand"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
---

# 0039: Add Integrity Provenance Report

## Summary

Adds `ledger verify-integrity`, which computes SHA-256 hashes for every Ledger
source record, combines them into a catalog hash, and writes JSON plus Markdown
integrity artifacts.

## Why

Ledger records are durable implementation memory. Integrity artifacts give
agents, maintainers, and releases a stable provenance snapshot that can be
compared over time before adding optional signing or hash chains.

## Changed Files

### src/integrity.ts

- What changed: Adds source record hashing, catalog hashing, Markdown report
  formatting, and artifact writing.
- Anchor: `buildIntegrityReport`
- On conflict: Keep hashes deterministic and based on source Markdown records.

### src/cli.ts

- What changed: Adds `ledger verify-integrity [--json]` and help output.
- Anchor: `verifyIntegrityCommand`
- On conflict: Preserve JSON output for tools and generated artifact writes for
  normal command execution.

### src/index.ts

- What changed: Exports integrity helpers from the TypeScript API.
- Anchor: `./integrity.js`
- On conflict: Keep provenance helpers available to adapters and agents.

### src/config.ts

- What changed: Adds generated `docs/llm/START_HERE.md` to the default git
  ignore policy.
- Anchor: `git.ignore`
- On conflict: Keep generated docs routing artifacts ignored by default.

### test/integrity.test.ts and test/cliHelp.test.ts

- What changed: Adds deterministic hashing, report formatting, artifact
  writing, and help coverage.
- Anchor: `buildIntegrityReport`
- On conflict: Preserve tests that verify stable hash shape and generated paths.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents integrity/provenance behavior and roadmap status.
- Anchor: `Integrity`
- On conflict: Keep docs clear that this is provenance, not signing.

## Behavior And UX Impact

Users can generate integrity artifacts for source records and catalog snapshots.

## Invariants

- Hashes use SHA-256 over source Markdown content.
- Catalog hashes are deterministic for the same set of record paths and hashes.
- Integrity artifacts remain generated outputs.
- This feature does not claim cryptographic signing or tamper-proof storage.

## Verification

- `npm run typecheck`
- `npx vitest run test/integrity.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js verify-integrity`
- `node dist/cli.js verify-integrity --json`

## Notes

Future integrity work can add signed records, hash chains, and evidence
references.
