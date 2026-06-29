---
id: "B004"
kind: "backlog"
title: "Managed docs plane"
date: "2026-06-29"
updated: "2026-06-29"
status: "accepted"
areas: ["docs", "cli", "agents"]
---

# B004: Managed Docs Plane

## Problem

Projects often let `docs/` become a mix of durable documentation, scratchpads,
generated artifacts, routing manifests, stale plans, and backlog notes. Agents
then struggle to determine which docs describe current truth and which docs are
historical or temporary.

## Desired Outcome

Ledger can initialize and manage a professional docs structure that communicates
with `.ledger/`. Every meaningful change can declare docs impact, and Ledger
can audit whether durable docs, agent routing files, and change records agree.

## Scope

Included:

- `ledger init --with-docs`
- docs directory conventions
- docs-impact declarations
- stale docs reports
- scratchpad lifecycle
- optional `docs/llm` routing generation

Excluded:

- hosted docs service
- rich text editor
- renderer-specific artifact generation
- replacing all durable docs with Ledger records

## Acceptance Checks

- A new project can scaffold `.ledger/` plus `docs/`.
- `ledger docs audit` classifies durable docs, scratchpads, generated outputs,
  and routing files.
- A change entry can declare docs affected by the change.
- Ledger can report when changed source areas likely require docs updates.

## Risks

- The feature could expand into a generic docs platform.
- Automatic docs updates could create low-quality prose if not review-gated.
- Projects with existing docs layouts need incremental adoption rather than a
  forced migration.

## Promotion Notes

Promote after the core parser, validator, indexer, and `explain` workflow are
stable. The first slice should audit and report before it rewrites anything.
