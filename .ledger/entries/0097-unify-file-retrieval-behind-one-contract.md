---
id: "0097"
kind: "change"
title: "Unify file retrieval behind one contract"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "agents"
  - "architecture"
  - "cli"
  - "mcp"
files:
  - "src/retrieval.ts"
  - "src/conflict.ts"
  - "src/indexer.ts"
  - "src/packet.ts"
  - "src/render.ts"
  - "src/index.ts"
  - "src/unstable.ts"
  - "src/operations/definitions/retrieval.ts"
  - "test/retrieval.test.ts"
  - "test/generatedArtifacts.test.ts"
  - "test/mcp.test.ts"
  - "test/operations.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
  - "README.md"
symbols:
  - "retrieveByPath"
  - "matchFilePath"
  - "relatedRecords"
  - "supersededByIndex"
  - "buildConflictTargets"
  - "explainFile"
  - "buildAgentPacket"
  - "buildSearchAgentPacket"
  - "buildRelationshipGraph"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
docsImpact:
  status: "updated"
  reason: "The architecture query engine section describes the shared retrieval contract and the API guide lists retrieveByPath as a stable export."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/API.md"
decisions:
  - "D005"
commits: []
related:
  - "0095"
  - "0096"
---

# 0097: Unify File Retrieval Behind One Contract

## Summary

Added `src/retrieval.ts` with `retrieveByPath`, the one place that decides
which records a file path is related to. It matches the target against every
record's file references with a single matcher (exact path, then coverage
patterns, then a directory suffix), returns each match with its metadata,
matched references and match kinds, `On conflict` rules from the relevant
`## Changed Files` blocks, invariants, verification, and superseding records,
resolves one relationship hop into a `related` list (decisions, backlog,
related, supersession in both directions), and reports unresolved references
as `missing`.

`explainFile`, `buildConflictTargets`, `buildAgentPacket`, the `explain`
operation, and its MCP tool now project from that result. Agent packets carry
`related` records, count them against the token budget, cap them under budget,
and print them as a Related Records section. Search packets resolve related
records for their candidates the same way. The relationship graph emits
`supersedes` edges. A golden test pins the full retrieval result for a fixture
catalog and checks that explain, conflict, and packet agree on matches and
guidance.

## Why

The August audit found that explain, conflict, packet, CLI, library, and MCP
used parallel matching code and returned different shapes, so a record found
by one surface could be missing from another and no surface followed
relationships. Decision D005 lists the unified retrieval contract among the 0.4
foundation slices because the local API and MCP resources in 0.5 need one
result model to serve. Supersession edges were the audit's finding E and the
brainstorm quick win that the graph omitted.

## Changed Files

### Retrieval contract

- File: `src/retrieval.ts`
- Changed: `matchFilePath`, `retrieveByPath`, `relatedRecords`,
  `supersededByIndex`, and the conflict-rule extractors that previously lived
  in `src/conflict.ts`.
- Anchor: `retrieveByPath`
- On conflict: Every file-oriented surface must call `retrieveByPath` or
  `matchFilePath`; do not reintroduce a second matcher.

### Projections

- Files: `src/conflict.ts`, `src/indexer.ts`, `src/packet.ts`,
  `src/operations/definitions/retrieval.ts`
- Changed: conflict targets, `explainFile`, file packets, search packets, and
  the `explain` operation are projections of the retrieval result. `explain`
  JSON data is `{ target, matches, records, related, missing }`; the earlier
  unreleased `context` field is replaced by `records`. Packets gain `related`.
- Anchor: `buildAgentPacket`
- On conflict: Keep `LedgerConflictEntry` and `LedgerPacketEntry` shapes
  stable; add fields rather than renaming.

### Graph and exports

- Files: `src/render.ts`, `src/index.ts`, `src/unstable.ts`
- Changed: `supersedes` edge type and emission; retrieval functions exported
  from the stable and unstable entrypoints.
- Anchor: `buildRelationshipGraph`
- On conflict: The graph golden test in `test/generatedArtifacts.test.ts` pins
  edge order; update it deliberately.

### Tests and docs

- Files: `test/retrieval.test.ts`, `test/generatedArtifacts.test.ts`,
  `test/mcp.test.ts`, `test/operations.test.ts`,
  `test/fixtures/operations-contract.json`, `docs/ARCHITECTURE.md`,
  `docs/API.md`, `README.md`
- Changed: retrieval golden test and consumer agreement tests; graph fixture
  gains a supersedes edge; MCP explain expects related and missing counts; the
  operations contract reflects the new explain output schema.
- Anchor: `retrieval consumers agree`
- On conflict: Regenerate the operations contract after touching the explain
  output.

## Behavior And UX Impact

- `ledger explain` lists related decisions, backlog items, and superseding
  records after the matches, and `--agent` includes conflict rules and
  supersession per record.
- `ledger packet` and `ledger search-packet` print a Related Records section
  and count it in the token estimate; under a budget at most eight related
  records are kept.
- `graph.json` contains `supersedes` edges.
- MCP `ledger_explain` summaries include `related` and `missing`; payloads gain
  `records`, `related`, and `missing`.

## Invariants

- A path matched by one of explain, conflict, or packet is matched by all of
  them with the same conflict rules.
- Related records exclude the matched records themselves and are sorted by id.
- Missing relationship targets are reported, never silently dropped.
- Packet token estimates include related records.

## Verification

- `npm run typecheck`
- `npm test` (39 files, 223 tests)
- `npm run build`, then `ledger explain src/cli.ts --agent`, `ledger packet
  src/operations/registry.ts --budget 1200 --json`, and `ledger explain
  docs/ROADMAP.md --json` on this repository
- `npm run ci`

## Notes

Milestone three of the 0.4 foundation. Remaining for 0.4: the release itself.
