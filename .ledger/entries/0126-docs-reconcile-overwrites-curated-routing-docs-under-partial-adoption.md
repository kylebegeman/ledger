---
id: "0126"
kind: "product-note"
title: "Docs reconcile overwrites curated routing docs under partial adoption"
date: "2026-09-16"
updated: "2026-09-16"
status: "resolved"
areas:
  - "docs"
  - "adoption"
tags:
  - "dogfood"
  - "data-safety"
---

# 0126: Docs Reconcile Overwrites Curated Routing Docs Under Partial Adoption

## Context

Found while configuring Ledger 0.7.0 in Kore, whose `docs/llm/START_HERE.md`
and `docs/llm/manifest.json` are hand-maintained agent routing documents that
Kore's `AGENTS.md` tells every agent to read first.

## Finding

`adopt` leaves `docs.routing.startHere` and `docs.routing.manifest` pointing at
those two paths. `adopt` itself only writes them when missing, but
`ledger docs reconcile` replaces both files unconditionally in one
transaction, whatever they contain. It checks neither `docs.adoption: partial`
nor whether Ledger generated the existing file, although Ledger's own manifest
carries `generatedBy: "ledger"`. One run would have replaced Kore's curated
router with a generated listing.

In Kore the routing paths now point at `.ledger/reports/docs-start-here.md`
and `.ledger/indexes/docs-routing.json`, which are derived and git-ignored.
A reconcile run afterwards left both curated files byte-identical.

## Impact

Partial adoption promises not to own the docs tree, and the routing files are
the most valuable docs an agent-maintained repository has. The command is
listed in the README, so a person or agent can run it in good faith. Git
history makes the loss recoverable, but only if someone notices before
committing.

## Recommendation

`docs reconcile` should refuse to replace a routing file that Ledger did not
generate (a manifest without `generatedBy: "ledger"`, a START_HERE without a
Ledger marker) unless `--force` is passed, and report what it would write.
`adopt` should detect existing routing files and point `docs.routing` at
Ledger-owned paths, as was done by hand in Kore.

## Follow-ups

- Guard `docs reconcile` against replacing files Ledger did not generate, with
  a test that a curated START_HERE survives.
- Detect existing routing files in `adopt` and choose Ledger-owned paths.
- Resolved: 0131 guards `docs reconcile` and points `adopt` at Ledger-owned
  routing paths when curated routing files exist.
