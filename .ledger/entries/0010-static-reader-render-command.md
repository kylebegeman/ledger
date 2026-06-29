---
id: "0010"
kind: "change"
title: "Add static reader render command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "render", "html", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/render.ts"
  - "test/render.test.ts"
symbols:
  - "buildStaticReaderModel"
  - "renderStaticReaderHtml"
  - "writeStaticReader"
  - "renderCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["f5f70f6"]
---

# 0010: Add Static Reader Render Command

## Summary

Adds `ledger render` for generating `.ledger/dist/index.html`, a single-file
offline reader for Ledger source records. The reader includes catalog stats,
filters, rendered entry summaries, embedded JSON data, and Markdown source
access for every record.

## Why

Markdown remains the source of truth, but larger Ledger catalogs need a browsable
surface for humans. A static reader makes the catalog easier to inspect without
requiring Dossier, a hosted service, or a frontend build pipeline.

## Changed Files

### src/render.ts

- What changed: Adds the static reader model, HTML renderer, and file writer.
- Anchor: `renderStaticReaderHtml`
- On conflict: Keep the renderer deterministic and generated from source
  Ledger documents. Do not make `.ledger/dist/index.html` a source artifact.

### src/cli.ts

- What changed: Adds `ledger render [--json]` and validates records before
  writing the static reader.
- Anchor: `renderCommand`
- On conflict: Preserve validation-before-render so a broken catalog does not
  produce a misleading reader.

### src/index.ts

- What changed: Exports the render helper API from the library entrypoint.
- Anchor: `export * from "./render.js"`
- On conflict: Keep render helpers available to future adapters and CI tooling.

### test/render.test.ts

- What changed: Adds coverage for reader model stats and safe HTML/JSON output.
- Anchor: `buildStaticReaderModel`
- On conflict: Keep tests focused on deterministic model and escaping behavior.

### README.md and docs/*

- What changed: Documents `ledger render` as a generated offline reader.
- Anchor: `ledger render`
- On conflict: Keep the docs clear that Markdown source records remain the
  canonical data.

## Behavior And UX Impact

Users can generate a local HTML reader and open it directly from `.ledger/dist`.
The first version is intentionally static, framework-free, and offline.

## Invariants

- Source Markdown remains canonical.
- `ledger render` validates before writing.
- `.ledger/dist/index.html` is generated output.
- The reader embeds normalized data and exposes Markdown source for each record.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js render`
- `test -s .ledger/dist/index.html`
- `node dist/cli.js render --json`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`

## Notes

Later versions can add richer navigation, multi-page output, printable release
views, and index-backed rendering.
