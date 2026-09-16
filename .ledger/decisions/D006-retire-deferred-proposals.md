---
id: "D006"
kind: "decision"
title: "Retire deferred proposals from the roadmap"
date: "2026-09-15"
updated: "2026-09-15"
status: "accepted"
areas:
  - "product"
  - "roadmap"
related:
  - "D005"
docs:
  - "docs/ROADMAP.md"
  - "docs/scratchpad/next-version-brainstorm-2026-09-15.md"
---

# D006: Retire Deferred Proposals From The Roadmap

## Context

The 2026-09-15 brainstorm cross-checked 68 proposals recorded in the roadmap,
implementation plan, product and architecture docs, the backlog, and the two
2026-08-30 scratchpad reports against the source. Fifty-two had no
implementing code. Kyle asked that the proposals dropped by that review be
recorded formally rather than left in the roadmap as implied future work.

## Decision

The following proposals are retired. They are not planned and should not be
carried forward by default.

- Go and HTMX mini-app adapters (Roadmap Phase 10). No consumer exists, and
  the JSON API planned under D005 serves any language without shipping
  adapters.
- Signed records, record hash chains, and transparency-log adapters (Roadmap
  Phases 9 and 10). No adopter needs non-repudiation; integrity hashes plus
  evidence-backed verification cover the real need.
- Dossier adapter (PRODUCT.md, ARCHITECTURE.md). Already outside core by
  D003; nothing is planned until Dossier needs it.
- Repository federation (brainstorm 2026-08-30, major item 8). Premature
  before one repository has outside users.
- A separate `.ledger/routing/` directory (Roadmap Phase 3.5). The
  `docs/llm/` routing convention already works; keep one.
- A separate `.ledger/scratch/` directory (Roadmap Phase 3.5,
  DOCS_RELATIONSHIP.md). Replaced by an expiring session record kind that
  validates and indexes like every other record.
- A standalone VS Code extension prototype (Roadmap Phase 8). Editor
  integrations become clients of the local API instead.

The following proposals are kept but reshaped, so their original entries no
longer describe the plan:

- The change-set review workbench becomes a `context` operation and API route.
- The canonical operation registry becomes the foundation every surface is
  generated from.
- The write-capable agent lifecycle is gated by MCP multi round-trip
  confirmation rather than a bespoke revision token.
- `search.sqlite` as a later index is recast as an optional derived cache
  backend, never as source.
- The Git merge hook helper folds into host hook installation.
- Self-healing maintenance becomes `doctor --fix` on top of the catalog cache.

## Consequences

`docs/ROADMAP.md` Phase 10 no longer lists the retired items as next slices,
and Phase 11 records the replacement direction. Backlog B005 is absorbed by the
operation registry work. Historical entries and the 2026-08-30 scratchpad
reports keep their text; they are history, not plans.

## Revisit Criteria

Reopen a retired item only when a named adopter needs it, or when the D005
direction ships and the item becomes cheap on top of it. Signed records are the
most likely candidate once a team adopts Ledger for release evidence.
