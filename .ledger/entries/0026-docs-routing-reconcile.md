---
id: "0026"
kind: "change"
title: "Generate docs routing manifest"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "cli", "routing", "agents", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/docs.ts"
  - "src/types.ts"
  - "test/docs.test.ts"
  - ".ledger/entries/0026-docs-routing-reconcile.md"
symbols:
  - "buildDocsRoutingManifest"
  - "writeDocsRoutingManifest"
  - "docsReconcileCommand"
  - "LedgerDocsRoutingManifest"
docs:
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0026: Generate Docs Routing Manifest

## Summary

Adds `ledger docs reconcile`, which builds and writes the configured docs
routing manifest from the current docs audit. The generated manifest lists
non-generated docs files with their Ledger docs classifications.

## Why

The managed docs plane needs a concrete generated routing artifact, not only an
empty scaffold. A deterministic manifest gives agents and tools a compact map
of durable docs, routing files, scratchpads, and unknown docs without turning
Ledger into a docs CMS.

## Changed Files

### src/types.ts

- What changed: Adds `LedgerDocsRoute` and `LedgerDocsRoutingManifest`.
- Anchor: `LedgerDocsRoutingManifest`
- On conflict: Keep this manifest shape stable and additive for agent tooling.

### src/docs.ts

- What changed: Adds manifest build/write functions derived from `auditDocs`.
- Anchor: `buildDocsRoutingManifest`
- On conflict: Keep generated files excluded from routing manifests so derived
  artifacts do not route agents back to derived artifacts.

### src/cli.ts

- What changed: Adds `ledger docs reconcile` and help text.
- Anchor: `docsReconcileCommand`
- On conflict: Keep reconcile deterministic and limited to reports plus the
  configured manifest path.

### test/docs.test.ts

- What changed: Adds manifest build/write coverage and generated-file
  exclusion assertions.
- Anchor: `writeDocsRoutingManifest`
- On conflict: Preserve tests for both manifest route content and written path.

### README.md

- What changed: Documents `ledger docs reconcile` in the command map.
- Anchor: `Command Map`
- On conflict: Keep the command description focused on routing manifest
  generation.

## Behavior And UX Impact

Projects with managed docs can regenerate `docs/llm/manifest.json` from the
current docs layout and classifications.

## Invariants

- The docs manifest is generated output.
- Generated docs files are excluded from manifest routes.
- Reconcile should not rewrite durable prose.

## Verification

- `npm run typecheck`
- `npx vitest run test/docs.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js docs reconcile`

## Notes

Future reconcile work can also refresh `docs/llm/START_HERE.md` from indexes
when that behavior has a clear template.
