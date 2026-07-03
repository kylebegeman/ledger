---
id: "0064"
kind: "change"
title: "Graph invariant and verification nodes"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "render"
  - "graph"
  - "agents"
files:
  - ".ledger/entries/0064-graph-invariant-verification-nodes.md"
  - "docs/ARCHITECTURE.md"
  - "src/render.ts"
  - "test/generatedArtifacts.test.ts"
symbols:
  - "LedgerGraphNode"
  - "LedgerGraphEdge"
  - "buildRelationshipGraph"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Documented invariant and verification nodes in the generated graph sidecar."
  docs:
    - "docs/ARCHITECTURE.md"
backlog:
  - "B005"
  - "B006"
commits: []
---

# 0064: Graph Invariant And Verification Nodes

## Summary

Extended the generated relationship graph with invariant and verification nodes
attached to each source record.

## Why

B005 calls for a normalized record graph that includes files, docs, decisions,
backlog, releases, symbols, invariants, and verification. The graph sidecar
already covered metadata relationships, but agents still had to parse Markdown
to traverse behavioral contracts and verification commands.

## Changed Files

### src/render.ts

- What changed: Added `invariant` and `verification` node and edge types to the
  generated graph and emitted deterministic nodes for each bullet.
- Anchor: `buildRelationshipGraph`
- On conflict: Keep node ids stable as `invariant:<record-id>:<ordinal>` and
  `verification:<record-id>:<ordinal>`.

### test/generatedArtifacts.test.ts

- What changed: Extended the graph artifact contract test to pin invariant and
  verification nodes and edges.
- Anchor: `generated artifact contracts`
- On conflict: Update this test intentionally when graph schema changes.

### docs/ARCHITECTURE.md

- What changed: Documented invariants and verification as first-class graph
  nodes.
- Anchor: `graph sidecar`
- On conflict: Keep docs aligned with the static JSON graph schema.

## Behavior And UX Impact

Static graph consumers can now traverse from a record to its invariants and
verification commands without reading full Markdown source. The static reader UI
continues to render the same card content.

## Invariants

- Graph node and edge ordering remains deterministic.
- Existing graph relationships remain intact.
- Invariant and verification labels come from extracted bullet text.

## Verification

- `npm test -- --run test/generatedArtifacts.test.ts test/render.test.ts`
- `npm run typecheck`

## Notes

This changes the generated `graph.json` schema additively by introducing new
node and edge types.
