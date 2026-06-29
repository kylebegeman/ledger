---
id: "0002"
kind: "change"
title: "Use .ledger root and add docs lifecycle audit"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "docs", "architecture", "tests"]
files:
  - "README.md"
  - "package.json"
  - ".gitignore"
  - ".ledger/config.yaml"
  - ".ledger/README.md"
  - ".ledger/entries/0002-ledger-root-and-docs-lifecycle.md"
  - ".ledger/decisions/D002-root-changes-directory.md"
  - ".ledger/decisions/D004-ledger-owns-docs-lifecycle.md"
  - ".ledger/backlog/B004-managed-docs-plane.md"
  - "docs/PRODUCT.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/docs.ts"
  - "src/index.ts"
  - "src/types.ts"
  - "src/workspace.ts"
  - "test/docs.test.ts"
  - "test/validate.test.ts"
symbols:
  - "auditDocs"
  - "classifyDocsFile"
  - "initWorkspace"
  - "run"
docs:
  - "docs/PRODUCT.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/ROADMAP.md"
release: "v0.1.1"
commits: ["355b63b"]
---

# 0002: Use .ledger Root And Add Docs Lifecycle Audit

## Summary

Renames Ledger's default project directory from `.changes/` to `.ledger/` so the
on-disk structure matches the product and SDK name. Adds the first managed-docs
lifecycle slice: `ledger init --with-docs`, `ledger docs audit`, and
`ledger docs check`. The docs feature starts as scaffold, audit, report, and
strict broken-reference checking rather than automatic prose rewriting.

## Why

The product root should be named after the product. `.ledger/` is clearer than
`.changes/` because Ledger is broader than changelog entries: it also owns
backlog items, decisions, releases, validation reports, indexes, and agent
routing. The docs feature belongs in Ledger because docs freshness depends on
the records Ledger already manages, but it needs guardrails so Ledger does not
turn into a generic docs CMS.

## Changed Files

### src/workspace.ts

- What changed: Uses `.ledger/config.yaml` for discovery, exposes
  `ledgerRoot`, and adds `initWorkspace(..., { withDocs: true })` to scaffold a
  conventional `docs/` tree and agent routing starter files.
- Anchor: `initWorkspace`
- On conflict: Preserve `.ledger/` as the default root. Keep docs scaffolding
  optional and idempotent.

### src/docs.ts

- What changed: Adds docs audit primitives that classify docs as durable,
  routing, scratch, generated, or unknown; collect Ledger-to-doc references; and
  write `.ledger/reports/docs-audit.md`.
- Anchor: `auditDocs`
- On conflict: Keep audit/report behavior non-mutating. Future reconcile
  commands may propose patches, but audit must remain read-only.

### src/cli.ts

- What changed: Adds `init --with-docs`, `docs audit`, and `docs check`.
  `docs check` exits non-zero only for missing Ledger-referenced docs.
- Anchor: `run`
- On conflict: Keep docs commands grouped under `ledger docs` and avoid
  automatic docs rewriting from these commands.

### src/config.ts and src/types.ts

- What changed: Adds docs config (`root`, `managed`, routing paths), renames the
  workspace root field to `ledgerRoot`, and adds docs audit types.
- Anchor: `LedgerConfig`
- On conflict: Keep `docs.root` defaulting to visible `docs/`, with Ledger
  control data under `.ledger/`.

### docs/*

- What changed: Documents the managed-docs plane, docs impact workflow, why this
  belongs in Ledger, and the roadmap phases for docs lifecycle and managed docs.
- Anchor: `Managed Docs Plane`
- On conflict: Preserve the boundary: Ledger may scaffold, classify, validate,
  and cross-link docs, but it is not a hosted docs CMS or renderer.

### .ledger/*

- What changed: Moves the product source directory to `.ledger/`, updates config
  and ignored generated outputs, and records the managed-docs decision/backlog.
- Anchor: `.ledger/config.yaml`
- On conflict: Treat `.ledger/entries`, `.ledger/backlog`,
  `.ledger/decisions`, `.ledger/releases`, `.ledger/templates`, and
  `.ledger/policies` as source. Regenerate `.ledger/indexes` and
  `.ledger/reports`.

### test/docs.test.ts and test/validate.test.ts

- What changed: Adds docs classification/audit coverage and updates fixtures for
  `ledgerRoot`.
- Anchor: `docs audit`
- On conflict: Preserve tests proving missing doc references are detected
  without treating unreferenced durable docs as validation errors.

## Behavior And UX Impact

New projects initialize `.ledger/` instead of `.changes/`. Projects can opt into
a visible durable docs tree with `ledger init --with-docs`. Users can run
`ledger docs audit` for a report or `ledger docs check` in CI when they want
broken Ledger-to-doc references to fail.

## Invariants

- `.ledger/` is the canonical Ledger root.
- Durable docs stay in visible `docs/` by default.
- `ledger docs audit` is read-only.
- `ledger docs check` fails only on missing Ledger-referenced docs in the first
  slice.
- Generated indexes and reports remain reproducible derived outputs.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs audit`
- `node dist/cli.js docs check`
- `node dist/cli.js explain docs/DOCS_RELATIONSHIP.md`
- Temporary-directory smoke for executable `dist/cli.js init --with-docs`
- `npm pack --dry-run`

## Notes

Future docs lifecycle work should add docs-impact declarations and
review-gated reconcile plans before any automatic documentation edits.
