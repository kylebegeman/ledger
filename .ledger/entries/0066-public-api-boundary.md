---
id: "0066"
kind: "change"
title: "Public API boundary"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "architecture"
  - "package"
  - "docs"
files:
  - ".ledger/entries/0066-public-api-boundary.md"
  - "README.md"
  - "package.json"
  - "src/index.ts"
  - "src/unstable.ts"
  - "test/publicApi.test.ts"
symbols:
  - "buildAgentPacket"
  - "buildStaticReaderModel"
  - "readLedgerDocuments"
  - "searchLedgerIndex"
  - "validateDocuments"
docs:
  - "README.md"
docsImpact:
  status: "updated"
  reason: "Documented the stable package root and unstable entrypoint for library consumers."
  docs:
    - "README.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0066: Public API Boundary

## Summary

Defined a curated stable package root and moved broad internal exports behind an
explicit unstable entrypoint.

## Why

The package was exporting almost every module from `src/index.ts`, which made
implementation details look like stable library contracts. A narrower boundary
lets integrations depend on durable APIs while still allowing advanced local
tooling to reach internals intentionally.

## Changed Files

### src/index.ts and src/unstable.ts

- What changed: Replaced the broad package root with named stable exports and
  added `@kylebegeman/ledger/unstable` for internal helpers.
- Anchor: package exports
- On conflict: Keep the root API focused on high-level workflows and move
  experimental helpers to `unstable`.

### package.json

- What changed: Added the `./unstable` subpath export with matching type output.
- Anchor: `exports`
- On conflict: Preserve the package root as the stable default import path.

### test/publicApi.test.ts

- What changed: Added tests that pin the public boundary and confirm internals
  remain available through the unstable entrypoint.
- Anchor: `public API boundary`
- On conflict: Update this intentionally when a stable API is promoted or
  removed.

### README.md

- What changed: Documented the stable package root and unstable import path.
- Anchor: `Library API`
- On conflict: Keep install docs aligned with actual `package.json` exports.

## Behavior And UX Impact

CLI behavior is unchanged. Library consumers get a cleaner import surface, and
internal helpers remain accessible through an explicit experimental path.

## Invariants

- The package root exports high-level workflows only.
- Internal parser, runtime, and asset helpers do not appear in the stable root.
- The unstable entrypoint remains available for local tooling experiments.

## Verification

- `npm test -- --run test/publicApi.test.ts`
- `npm run typecheck`

## Notes

This is a package contract change, not a runtime behavior change.
