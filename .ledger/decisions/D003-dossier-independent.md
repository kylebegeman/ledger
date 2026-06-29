---
id: "D003"
kind: "decision"
title: "Keep Ledger independent from Dossier"
date: "2026-06-29"
updated: "2026-06-29"
status: "accepted"
areas: ["architecture", "integration"]
---

# D003: Keep Ledger Independent From Dossier

## Context

Dossier can render polished review artifacts, and Ledger records could make good
source material for Dossier. However, Ledger's core value is change memory,
validation, indexing, and agent retrieval. It should not require any particular
renderer.

## Decision

Ledger stands alone. Dossier integration is out of Ledger core. A future adapter
can translate Ledger's normalized JSON model into a Dossier artifact when both
products are present.

## Consequences

Ledger remains useful in terminals, CI, GitHub Actions, editor integrations, and
agent tools. Dossier remains a separate product. Integration work can evolve
without coupling either product's release cycle.

## Revisit Criteria

Revisit only if both products intentionally move toward a shared protocol and
the shared layer is stable enough to live outside both cores.
