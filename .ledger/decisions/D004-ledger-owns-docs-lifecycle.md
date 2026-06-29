---
id: "D004"
kind: "decision"
title: "Ledger owns optional docs lifecycle management"
date: "2026-06-29"
updated: "2026-06-29"
status: "accepted"
areas: ["docs", "architecture", "product"]
---

# D004: Ledger Owns Optional Docs Lifecycle Management

## Context

Many projects use `docs/` as a catch-all for durable docs, scratchpads, backlog
notes, decisions, generated reports, and agent routing files. That works early
but becomes hard to maintain. Ledger already tracks the records that determine
whether docs are fresh: change entries, backlog state, decisions, verification,
and file relationships.

## Decision

Ledger may scaffold and manage an optional `docs/` plane. This includes docs
classification, docs-impact checks, stale-doc reports, agent routing manifests,
and reconciliation workflows. Ledger does not replace durable docs or become a
generic docs CMS.

## Consequences

Ledger becomes a larger product, but the product remains coherent because docs
lifecycle depends on change memory. Projects can adopt only `.ledger/`, or they
can opt into `ledger init --with-docs` for a more opinionated docs structure.

## Revisit Criteria

Revisit if docs lifecycle work starts requiring renderer-specific features,
hosted collaboration, or full documentation authoring workflows that should live
in a separate product.
