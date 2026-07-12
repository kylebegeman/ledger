# Ledger Product Brief

Ledger is a repo-native work record for software projects maintained by humans
and coding agents. It gives every meaningful change a durable, structured home
inside the repository.

## Positioning

Ledger is not a normal release changelog. It is an implementation memory layer.

Release changelogs answer:

- What changed for users?
- Which version contains it?

Ledger answers:

- What changed in the codebase?
- Why was this shape chosen?
- Which files, symbols, contracts, migrations, tests, and docs are involved?
- What should an agent know before touching this area again?
- What invariants must survive refactors and upstream merges?
- How does this work relate to backlog items, decisions, releases, and future
  follow-ups?

The short product sentence:

> Ledger is a repo-native change memory system for humans and coding agents.

## Core Idea

Agents sign in, do work, and leave a structured record before signing out.

The hotel register metaphor is useful: every meaningful visitor to the codebase
records who came through, why they were there, what they touched, and what the
next visitor must know. The project can then answer "why is this here?" from
local records instead of relying on oral history, stale issue threads, or a
large Git archaeology session.

## Source Of Truth

Ledger uses plain Markdown with frontmatter.

Markdown is intentionally the source format because it is:

- durable across tools and hosting providers
- readable in code review
- easy for agents to consume
- diff-friendly
- editable without a special app
- compatible with static renderers and search indexes

Generated files are allowed, but they are derived from the Markdown source.

## Relationship To docs/

Ledger does not replace all project documentation. It replaces the unstructured
project-memory layer that often accumulates inside `docs/`.

Durable product specs, architecture docs, API docs, operator runbooks, and user
guides can stay in `docs/`. Ledger owns the structured records that explain how
the project changed and what future agents must preserve:

- change entries
- backlog items
- decisions
- release groupings
- invariants
- conflict rules
- verification records
- docs impact declarations
- generated indexes and reports

The clean model is:

```txt
docs/       # durable explanatory documentation
.ledger/  # structured change memory and agent-readable routing
```

See [Ledger And Project Docs](./DOCS_RELATIONSHIP.md) for the migration model.

Ledger can optionally initialize and manage a `docs/` structure. That capability
belongs in Ledger because documentation freshness depends on the change records,
decisions, backlog state, and verification metadata Ledger already owns. The
boundary is still important: Ledger manages docs lifecycle and traceability; it
does not become a generic docs CMS.

## Default Repository Layout

Ledger's default root directory is `.ledger/`:

```txt
.ledger/
  config.yaml
  README.md

  entries/
    0001-bootstrap.md

  backlog/
    B001-git-aware-drafts.md

  decisions/
    D001-markdown-is-source-of-truth.md

  releases/
    v0.1.0.md

  templates/
    change.md
    backlog.md
    decision.md
    release.md

  policies/
    coverage.yaml
    verification.yaml

  indexes/
    manifest.json
    by-file.json
    by-area.json
    by-release.json
    by-symbol.json

  reports/
    latest-validation.md
    missing-coverage.md
    stale-anchors.md

  dist/
    index.html
    public/
      index.html
```

The directory makes the system visible at the root of a project without taking
over normal docs folders.

## Document Types

### Change Entries

Change entries record coherent landed work. They are the primary Ledger unit.

Examples:

- a feature
- a bug fix
- a refactor with behavior impact
- a dependency migration
- an upstream port
- an infrastructure change
- a documentation batch that changes project routing or process

Each entry should describe intent, changed files, conflict rules, invariants,
behavior impact, and verification.

### Backlog Items

Backlog items capture accepted or proposed work that has not landed yet. A
backlog item can later be promoted into one or more change entries.

Useful backlog fields:

- problem
- scope
- desired outcome
- acceptance checks
- risks
- dependencies
- promotion criteria

### Decisions

Decisions record stable choices that should guide future work.

Examples:

- Markdown remains the source of truth.
- `.ledger/` is the default root directory.
- Generated HTML is optional output, not the canonical record.
- Dossier integration stays outside Ledger core.

### Releases

Release documents group change entries into a public or internal release
narrative. Ledger can generate release notes from entries, but projects can also
maintain hand-edited release records.

## Primary Users

### Maintainers

Maintainers use Ledger to remember why the codebase is shaped the way it is.
They can inspect the record before approving a refactor, release, merge, or
automation-generated pull request.

### Coding Agents

Agents use Ledger to understand project history before editing files. They can
query by file, symbol, area, decision, release, or invariant.

### Reviewers

Reviewers use Ledger to check whether a pull request has sufficient context,
verification, and future maintenance guidance.

### Fork Maintainers

Fork maintainers use Ledger as divergence memory. When upstream changes collide
with fork-specific behavior, Ledger tells the agent which fork behavior matters
and how to reapply it.

## High-Value Workflows

### New Change

```bash
ledger new "Add provider reconnect guard" --from-diff
ledger validate
ledger index
```

The draft entry should include touched files, likely areas, changed symbols when
available, and a verification checklist.

### Legacy Changelog Adoption

```bash
ledger adopt
ledger migrate changelog docs/changelog --rewrite-docs
ledger validate --current-only
```

Ledger should preserve useful historical context while reducing validation
noise from old file references.

### Product Feedback

```bash
ledger feedback "Improve migration receipt" --area cli --tag dogfood
```

Dogfood findings should be captured as product-note records, separate from
normal change receipts.

### Explain A File

```bash
ledger explain apps/server/src/ws.ts
```

The output should show:

- entries that touched the file
- related decisions
- related backlog items
- invariants
- conflict rules
- verification commands

### Resolve A Merge Conflict

```bash
ledger conflict apps/server/src/ws.ts
```

The output should show the relevant entries, file anchors, before/after snippets,
and `On conflict` instructions.

### Promote Backlog

```bash
ledger new "Implement git-aware entry drafting" --from-diff
```

Backlog promotion is currently explicit: add `backlog: ["B001"]` to the new
change entry and preserve the relevant acceptance checks in its implementation
and verification sections. A dedicated `ledger promote` convenience command is
a future workflow, not part of the current CLI.

### Prepare Release Notes

```bash
ledger release v0.3.0
```

The release command should collect entries for a release, create internal notes,
and optionally emit public-facing summaries.

## What Makes Ledger Different

Ledger is not only chronological. It is relational.

Entries can be looked up by:

- file
- symbol
- area
- release
- phase or milestone
- decision
- backlog item
- commit
- pull request
- invariant

Ledger is not only human-readable. It is agent-readable.

Generated indexes are designed for tools that need compact context without
loading every Markdown file.

Ledger is not only a renderer. It is a project memory protocol.

HTML, JSON, SQLite, search indexes, and MCP tools are optional projections over
the same source documents.

## Non-Goals

Ledger should not become:

- a full issue tracker
- a public-only changelog generator
- a project management SaaS
- a replacement for Git
- a replacement for every project doc
- a renderer-specific document product
- a system that requires a database to read source records

## Dossier Boundary

Ledger and Dossier should remain independent products.

Ledger owns change memory, validation, indexing, Git relationships, and agent
query workflows.

Dossier owns polished review artifacts and reader experiences.

If both products are present, Ledger can later export a normalized model that
Dossier can render. That integration should live in an adapter, not in Ledger
core.
