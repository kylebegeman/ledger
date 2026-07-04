---
id: "0051"
kind: "change"
title: "Static search and token-budgeted agent context"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "agents"
  - "cli"
  - "render"
  - "search"
  - "docs"
files:
  - ".ledger/backlog/B005-architecture-and-token-efficiency-hardening.md"
  - ".ledger/backlog/B006-static-search-and-agent-context-site.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/doctor.ts"
  - "src/git.ts"
  - "src/index.ts"
  - "src/mcp.ts"
  - "src/packet.ts"
  - "src/render.ts"
  - "src/serve.ts"
  - "src/stale.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/doctor.test.ts"
  - "test/git.test.ts"
  - "test/packet.test.ts"
  - "test/render.test.ts"
  - "test/stale.test.ts"
symbols:
  - "ledger packet --budget"
  - "ledger render"
  - "ledger serve"
  - "ledger doctor"
  - "ledger stale"
  - "ledger agents --role"
  - "buildSearchIndex"
  - "buildRelationshipGraph"
  - "buildAgentPacket"
  - "inspectGit"
  - "runDoctor"
  - "detectStaleKnowledge"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
backlog:
  - "B005"
  - "B006"
commits: []
release: "v0.1.13"
---

# 0051: Static Search And Token-Budgeted Agent Context

## Summary

Accepted the architecture hardening and static search feature backlog, then
landed the first implementation slice: token-budgeted agent packets, lazy static
search and graph artifacts, local static reader serving, doctor diagnostics,
stale-knowledge detection, and role-specific agent instructions.

## Why

Ledger should help agents retrieve only the context they need. Unbounded packets,
inline search payloads, silent Git failures, and generic agent instructions all
increase token cost or diagnostic friction. This slice makes context budgets
explicit and moves the static reader toward a hostable, lazy-loaded search
surface while preserving Markdown as the source of truth.

## Changed Files

### src/packet.ts

- What changed: Added estimated token counts, budget and entry-limit options,
  truncation metadata, and bounded packet selection.
- Anchor: `buildAgentPacket`, `estimatePacketTokens`
- On conflict: Preserve transparent packet metadata so agents can see what was
  omitted instead of silently losing context.

### src/render.ts

- What changed: Added `search-index.json`, `graph.json`, lazy fuzzy search,
  relationship graph generation, and per-record agent packet digests.
- Anchor: `buildSearchIndex`, `buildRelationshipGraph`, `renderStaticReaderHtml`
- On conflict: Keep generated search and graph artifacts derived from source
  records, not hand-maintained data.

### src/doctor.ts, src/stale.ts, src/serve.ts, src/git.ts

- What changed: Added workspace health diagnostics, stale-knowledge detection,
  static reader serving, and explicit Git inspection.
- Anchor: `runDoctor`, `detectStaleKnowledge`, `serveStaticReader`, `inspectGit`
- On conflict: Keep `doctor` lightweight and keep stale signals non-blocking
  unless callers request `--check`.

### src/cli.ts, src/mcp.ts, src/index.ts

- What changed: Wired new commands and flags into CLI, MCP packet calls, help
  text, and public exports.
- Anchor: `ledger packet --budget`, `ledger doctor`, `ledger stale`,
  `ledger serve`, `ledger agents --role`
- On conflict: Keep CLI and MCP packet behavior aligned.

### README.md and docs/*.md

- What changed: Documented lazy search sidecars, graph artifacts, token-budgeted
  packets, health checks, stale detection, local serving, and role-specific
  agent instructions.
- Anchor: `Agent Workflow`, `Phase 6: Static Reader`
- On conflict: Keep docs describing generated artifacts as derived outputs.

### tests

- What changed: Added and updated tests for packet budgeting, render sidecars,
  Git inspection, stale detection, doctor output, CLI help, and E2E generated
  artifacts.
- Anchor: `test/packet.test.ts`, `test/render.test.ts`, `test/doctor.test.ts`,
  `test/stale.test.ts`
- On conflict: Preserve tests that assert generated static search and graph
  files exist after `ledger render`.

### .ledger/backlog

- What changed: Added accepted backlog records for the full architecture and
  token-efficiency hardening program plus the static search and agent context
  site program.
- Anchor: `B005`, `B006`
- On conflict: Keep the backlog scoped to implementation memory and generated
  static artifacts, not hosted project management.

## Behavior And UX Impact

Agents can request bounded context with `ledger packet <path> --budget 1200`,
MCP clients can pass packet budgets, humans can run `ledger doctor` for a compact
health check, `ledger stale` for stale knowledge signals, and `ledger serve
--watch` for local static-reader preview. The reader remains static but now has
lazy fuzzy search data and a relationship graph sidecar for richer hosted
browsing.

## Invariants

- Markdown records remain the source of truth.
- Generated search and graph files remain reproducible from Ledger source.
- Token counts are approximate and must be reported as estimates.
- Packet truncation must be visible through metadata.
- Stale knowledge signals should guide cleanup without rewriting source records.

## Verification

- `npm run typecheck`
- `npx vitest run test/packet.test.ts test/render.test.ts test/git.test.ts test/stale.test.ts test/doctor.test.ts test/cliHelp.test.ts test/cliE2e.test.ts`

## Notes

The first stale-symbol detector is intentionally simple and may produce false
positives until parser-backed symbol extraction lands. The accepted backlog
records keep that deeper improvement queued.
