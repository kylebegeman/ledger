---
id: "0001"
kind: "change"
title: "Bootstrap Ledger project"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "cli", "architecture", "schema"]
files:
  - "README.md"
  - "package.json"
  - "package-lock.json"
  - "tsconfig.json"
  - "tsconfig.build.json"
  - "LICENSE"
  - ".gitignore"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/documents.ts"
  - "src/frontmatter.ts"
  - "src/git.ts"
  - "src/index.ts"
  - "src/indexer.ts"
  - "src/newEntry.ts"
  - "src/types.ts"
  - "src/validate.ts"
  - "src/workspace.ts"
  - "test/frontmatter.test.ts"
  - "test/validate.test.ts"
  - "docs/PRODUCT.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - ".ledger/config.yaml"
  - ".ledger/entries/0001-ledger-project-bootstrap.md"
  - ".ledger/backlog/B001-git-aware-entry-drafting.md"
  - ".ledger/backlog/B002-static-reader.md"
  - ".ledger/backlog/B003-agent-query-tools.md"
  - ".ledger/backlog/B004-managed-docs-plane.md"
  - ".ledger/decisions/D001-markdown-source-of-truth.md"
  - ".ledger/decisions/D002-root-changes-directory.md"
  - ".ledger/decisions/D003-dossier-independent.md"
  - ".ledger/decisions/D004-ledger-owns-docs-lifecycle.md"
symbols: []
docs:
  - "docs/PRODUCT.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: []
---

# 0001: Bootstrap Ledger Project

## Summary

Creates the standalone Ledger package concept and initial project records.
Ledger is defined as a repo-native change memory system for humans and coding
agents. The bootstrap includes product docs, architecture docs, schema docs,
roadmap docs, implementation planning, and Ledger's own `.ledger/` directory.

## Why

Lumen's fork changelog proved that one Markdown file per coherent change gives
agents and humans durable context for maintenance, upstream conflict resolution,
verification, and future planning. Extracting the concept into Ledger makes the
pattern reusable outside Lumen while keeping it independent from Dossier and
other renderer-specific products.

## Changed Files

### README.md

- What changed: Introduces Ledger, the default `.ledger/` layout, initial
  commands, and documentation entry points.
- Anchor: `# Ledger`
- On conflict: Keep the positioning sentence and the `.ledger/` source layout
  visible near the top of the README.

### package.json

- What changed: Defines the standalone Node package, `ledger` CLI binary,
  TypeScript build, typecheck, and Vitest verification commands.
- Anchor: `scripts`
- On conflict: Keep the package executable mapped to the built CLI and keep
  `npm run check` as typecheck plus tests.

### package-lock.json

- What changed: Locks the initial Node dependency graph for TypeScript, Vitest,
  and YAML parsing.
- Anchor: root package lock object
- On conflict: Regenerate with `npm install` from `package.json`.

### tsconfig.json and tsconfig.build.json

- What changed: Splits broad typechecking from package build output so tests are
  typechecked while the published `dist/` contains only source modules.
- Anchor: `compilerOptions`
- On conflict: Keep build output rooted at `dist/cli.js` and `dist/index.js`.

### src/*

- What changed: Adds the first CLI and reusable core modules for workspace
  discovery, config loading, Markdown/frontmatter parsing, document discovery,
  validation, indexing, Git changed-file lookup, and entry drafting.
- Anchor: `run`
- On conflict: Preserve the data flow of Markdown source to parsed documents to
  validation/index/query output.

### test/*

- What changed: Adds focused Vitest coverage for frontmatter parsing, validation,
  duplicate id detection, indexing, and file explanation.
- Anchor: `Ledger validation`
- On conflict: Keep tests focused on core behavior rather than renderer output.

### docs/PRODUCT.md

- What changed: Defines the product, users, workflows, non-goals, and Dossier
  boundary.
- Anchor: `# Ledger Product Brief`
- On conflict: Preserve the distinction between implementation memory and
  public release changelogs.

### docs/ARCHITECTURE.md

- What changed: Describes the CLI/core layering, parser, validator, indexer,
  query engine, Git inspector, and future adapters.
- Anchor: `# Ledger Architecture`
- On conflict: Keep the core data flow as Markdown source to normalized indexes
  to query/render/export outputs.

### docs/SCHEMA.md

- What changed: Defines the initial Markdown/frontmatter schema for change
  entries, backlog items, decisions, releases, and normalized manifests.
- Anchor: `# Ledger Schema`
- On conflict: Keep schema changes additive unless a migration path is documented.

### docs/DOCS_RELATIONSHIP.md

- What changed: Defines how Ledger relates to a project's existing `docs/`
  folder, including the two-plane model, migration path, scratchpad lifecycle,
  routing manifests, and generated output boundaries.
- Anchor: `# Ledger And Project Docs`
- On conflict: Preserve the principle that Ledger cleans up project docs by
  owning structured change memory, not by replacing every durable doc.

### docs/ROADMAP.md

- What changed: Records the build sequence from bootstrap through validation,
  Git-aware drafting, conflict assistance, releases, static rendering, CI, agent
  integrations, and integrity features.
- Anchor: `# Ledger Roadmap`
- On conflict: Preserve the product direction that Ledger remains repo-native
  and renderer-independent.

### docs/IMPLEMENTATION_PLAN.md

- What changed: Captures the first package structure, MVP commands, validation
  policy, testing strategy, dogfooding plan, and later repository setup tasks.
- Anchor: `# Ledger Implementation Plan`
- On conflict: Keep the implementation order focused on parser, validator,
  indexer, and explain/query before static rendering.

### .ledger/*

- What changed: Adds Ledger's self-hosted change records, templates, policies,
  backlog items, and decisions.
- Anchor: `.ledger/config.yaml`
- On conflict: Treat `.ledger/entries`, `.ledger/backlog`,
  `.ledger/decisions`, `.ledger/releases`, `.ledger/templates`, and
  `.ledger/policies` as source files. Treat `.ledger/indexes`,
  `.ledger/reports`, and `.ledger/dist` as generated outputs.

## Behavior And UX Impact

Ledger now has a concrete product definition and repository shape. Future work
can proceed against documented commands, schemas, and dogfood records instead
of relying on the planning conversation alone.

## Invariants

- Ledger source records live in Markdown files with YAML frontmatter.
- `.ledger/` is the default root directory for new Ledger projects.
- Generated indexes and reports are derived outputs, not source of truth.
- Ledger core remains independent from Dossier.
- Ledger complements `docs/`; it does not replace durable product,
  architecture, API, operations, or user documentation.
- Ledger can optionally manage a professional `docs/` plane, but docs lifecycle
  management stays separate from change-entry source records.
- The product optimizes for implementation memory, agent handoff, conflict
  guidance, and verification traceability.

## Verification

- The documentation and `.ledger/` source files were written in plain Markdown
  and YAML.
- The follow-up implementation must run `npm test`, `npm run typecheck`, and
  `node dist/cli.js validate` once the CLI exists.

## Notes

This bootstrap entry intentionally records the product decisions before the
implementation is complete so the first validator and indexer can dogfood real
Ledger records.
