---
id: "B002"
kind: "backlog"
title: "Standalone static reader"
date: "2026-06-29"
updated: "2026-07-12"
status: "shipped"
areas: ["render", "html", "search"]
---

# B002: Standalone Static Reader

## Problem

Markdown is the source of truth, but large Ledger catalogs need a browsable
surface for humans. This should not require Dossier or a hosted service.

## Desired Outcome

`ledger render` produces `.ledger/dist/index.html` with filters, source links,
entry pages, release views, and a compact search experience.

## Scope

Included:

- local static HTML
- embedded manifest JSON
- filters by area, file, release, status, and decision
- Markdown source access

Excluded:

- Dossier adapter
- hosted search service

## Acceptance Checks

- A project can render a useful reader offline.
- The reader is regenerated from source Markdown and generated indexes.
- The reader does not become the canonical data store.

## Risks

- Rendering can distract from the more important validation and query core.
- UI expectations can grow beyond a static artifact.

## Promotion Notes

Shipped as the internal static reader with lazy weighted search, facets,
relationship graph data, local serving, performance budgets, and a separate
sanitized public release-note profile.
