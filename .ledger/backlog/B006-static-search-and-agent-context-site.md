---
id: "B006"
kind: "backlog"
title: "Static Search And Agent Context Site"
date: "2026-07-03"
updated: "2026-07-12"
status: "shipped"
areas:
  - "render"
  - "search"
  - "agents"
  - "docs"
---

# B006: Static Search And Agent Context Site

## Problem

The static reader is useful, but larger ledgers need a faster, nicer hosted
surface with lazy fuzzy search, relationship browsing, stale-knowledge signals,
and agent context generation from the same records.

## Desired Outcome

`ledger render` produces a hostable static site that remains fully derived from
Markdown source. Search should be fuzzy and lazy-loaded, relationship data should
be available as static JSON, and search results should help agents jump directly
to compact context packets.

## Scope

Selected feature work:

- hosted-quality static search site
- `search-index.json` as a compact lazy-loaded search payload
- fuzzy ranking for title, id, path, symbol, area, invariant, verification, and
  body text
- agent packet generation from search results
- relationship graph data for files, docs, decisions, backlog, releases, areas,
  and symbols
- stale knowledge detection
- `ledger doctor`
- `ledger serve`
- role-specific `ledger agents` instructions

Excluded for now:

- hosted search services
- making generated HTML the source of truth
- rich text editing
- project management features unrelated to implementation memory

## Acceptance Checks

- `ledger render` writes `index.html`, `search-index.json`, and `graph.json`.
- The reader filters without a server and lazy-loads search data only when
  search is used.
- Agent packet output can be bounded with an approximate token budget.
- `ledger stale` reports stale knowledge signals without rewriting source
  records.
- `ledger doctor` gives a compact local health check.
- `ledger serve --watch` supports local preview and rebuild.

## Risks

- Search ranking can feel imprecise if all fields are weighted equally.
- Static UI scope can expand quickly; generated artifacts should stay simple and
  reproducible.
- Stale-symbol detection can produce false positives until symbol extraction is
  parser-backed and language-aware.

## Promotion Notes

The accepted slice shipped with sidecar weighted search and graph artifacts,
packet budgets, doctor and stale diagnostics, hardened local serving, public
render isolation, and role-specific agent instructions. Sharded search,
multi-page output, and richer graph navigation remain future scale work.
