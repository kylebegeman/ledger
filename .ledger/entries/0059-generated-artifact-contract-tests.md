---
id: "0059"
kind: "change"
title: "Generated artifact contract tests"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "tests"
  - "architecture"
files:
  - ".ledger/entries/0059-generated-artifact-contract-tests.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "test/generatedArtifacts.test.ts"
symbols:
  - "generated artifact contracts"
  - "buildStaticReaderModel"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
docsImpact:
  status: "updated"
  reason: "Documented generated search-index and graph sidecars as tested transport contracts."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/IMPLEMENTATION_PLAN.md"
backlog:
  - "B005"
  - "B006"
commits: []
---

# 0059: Generated Artifact Contract Tests

## Summary

Added golden-style tests for deterministic generated search-index and graph
artifact projections.

## Why

The static reader and future hosted readers depend on sidecar JSON contracts.
Structural render tests prove files exist, but they do not pin the fielded
search data or graph node and edge shape that agents and hosted readers consume.

## Changed Files

### test/generatedArtifacts.test.ts

- What changed: Added exact artifact projection tests for search-index fields
  and graph nodes/edges.
- Anchor: `generated artifact contracts`
- On conflict: Keep these tests focused on deterministic JSON sidecars rather
  than full HTML output.

### docs/ARCHITECTURE.md and docs/IMPLEMENTATION_PLAN.md

- What changed: Documented the tested artifact-contract boundary.
- Anchor: `search-index`, `graph`
- On conflict: Keep docs clear that HTML can evolve while JSON sidecars are the
  transport contract.

## Behavior And UX Impact

Users should not see behavior changes. Maintainers now get earlier failures
when generated search or graph artifacts drift in ways that would affect hosted
readers or agent tooling.

## Invariants

- Search-index field names and graph node/edge shapes should change only with
  deliberate test updates.
- Generated JSON sidecars remain deterministic for a fixed source catalog.

## Verification

- `npm test -- --run test/generatedArtifacts.test.ts test/render.test.ts`

## Notes

Full HTML golden tests are intentionally avoided for now because the HTML shell,
styles, and browser runtime still need to be split before exact snapshots would
be low-noise.
