# Ledger And Project Docs

Ledger does not replace a project's entire `docs/` folder. It replaces the
parts of `docs/` that have become unstructured project memory.

Most active projects eventually accumulate a mix of:

- product specs
- architecture docs
- runbooks
- implementation plans
- scratchpad notes
- decision records
- changelog entries
- agent handoffs
- generated indexes
- stale plans
- release notes
- backlog lists
- roadmap fragments

Putting all of that under `docs/` is convenient at first, but it becomes hard to
tell which files are durable, which are temporary, which are generated, which
describe shipped behavior, and which should guide the next agent.

Ledger gives those project-memory documents a cleaner home.

## Two-Plane Model

Use two complementary documentation planes:

```txt
docs/
  product/
  architecture/
  operations/
  api/
  guides/

.ledger/
  entries/
  backlog/
  decisions/
  releases/
  indexes/
  reports/
```

`docs/` is for durable explanatory documentation.

`.ledger/` is for structured change memory, agent routing, validation, and
traceability.

## Managed Docs Plane

Ledger can optionally scaffold and manage a durable `docs/` plane without
turning docs into Ledger source records.

Suggested command:

```bash
ledger init --with-docs
```

Suggested generated structure:

```txt
docs/
  README.md
  product/
  architecture/
  operations/
  api/
  guides/
  reference/
  llm/
    START_HERE.md
    manifest.json
```

In this mode, Ledger provides conventions, validation, and synchronization
between `docs/` and `.ledger/`.

Ledger still treats `docs/` as durable explanatory material. `.ledger/` remains
the source of truth for change records, backlog items, decisions, releases, and
agent handoff memory.

## Docs Impact Workflow

Every change entry can declare whether it affects durable docs:

```yaml
docs:
  impacts:
    - docs/architecture/runtime.md
  required: true
  updated: true
```

Initial implementations can keep this simpler:

```yaml
docs:
  - docs/architecture/runtime.md
```

Future validation can enforce:

- if source files changed under configured product surfaces, an entry must
  declare docs impact
- if `docs.required` is true, a matching doc path must be changed or explicitly
  marked `not-needed`
- if docs changed, the entry should list the docs it changed
- if backlog or decisions changed behavior, durable docs should link back to the
  related record

Suggested commands:

```bash
ledger docs audit
ledger docs classify
ledger docs impact --from-diff
ledger docs reconcile
```

`ledger docs reconcile` should not blindly rewrite prose. It should produce a
patch plan or a focused checklist unless the project opts into generated docs.

## Features This Unlocks

A managed docs plane makes several useful workflows possible:

- **Docs impact checks:** a pull request can fail if code changed without a
  Ledger entry or docs-impact decision.
- **Stale docs reports:** Ledger can warn when docs reference superseded entries,
  old decisions, deleted files, or stale symbols.
- **Agent routing:** Ledger can generate or validate `docs/llm/START_HERE.md`
  and `docs/llm/manifest.json` from the same records agents already query.
- **Source-to-doc traceability:** a file can show which docs explain it and
  which entries changed it.
- **Docs coverage maps:** project maintainers can see important areas with no
  durable docs, no recent verification, or no owner notes.
- **Backlog promotion:** when a backlog item lands, Ledger can prompt for the
  product, architecture, operation, or API docs that need updates.
- **Release prep:** release generation can include both change entries and docs
  pages affected by the release.
- **Scratchpad cleanup:** temporary notes can be promoted or expired instead of
  lingering as false source of truth.

## Why This Belongs In Ledger

This is not a separate product because the hard part is not rendering docs. The
hard part is knowing when documentation is affected by a change, linking that
change to durable explanation, and keeping agents from treating stale plans as
truth.

Ledger already owns:

- change entries
- backlog state
- decisions
- verification
- generated indexes
- agent-readable routing

Those are the exact signals needed to keep `docs/` clean.

The product boundary remains clear:

- Ledger may scaffold, classify, validate, and cross-link docs.
- Ledger should not become a hosted docs CMS.
- Ledger should not require all docs to use one format beyond Markdown.
- Ledger should not make generated docs the source of truth.

## What Should Stay In docs/

Keep long-lived explanatory material in `docs/`:

- product specifications
- architecture explanations
- API documentation
- operator runbooks
- user guides
- diagrams
- domain references
- design rationale that is not tied to one discrete decision

These files explain the current system.

Ledger can link to them, index them, and cite them, but it should not force them
to move.

## What Should Move To .ledger/

Move structured project-memory records to `.ledger/`:

- change entries
- implementation receipts
- backlog items
- accepted decisions
- release groupings
- merge-conflict rules
- invariants
- verification receipts
- agent handoff packets
- generated project indexes
- stale-anchor reports
- missing-coverage reports

These files explain how the system changed, why it changed, and what future
agents must preserve.

## Scratchpads

Ledger should support scratch work without letting it become source of truth.

Recommended shape:

```txt
.ledger/scratch/
  2026-06-29-agent-investigation.md
```

Scratch documents are temporary. They can be promoted into:

- `.ledger/backlog/` when they describe future work
- `.ledger/decisions/` when they settle a durable choice
- `.ledger/entries/` when they describe landed work
- `docs/` when they become durable explanatory documentation

Ledger should eventually provide:

```bash
ledger scratch "Investigate provider reconnects"
ledger promote-scratch .ledger/scratch/...
ledger stale-scratch
```

## Routing Manifests

Some projects use `docs/llm/START_HERE.md`, routing manifests, or agent
playbooks to help coding agents find relevant context. Ledger should absorb the
structured parts of that pattern without requiring every project to use the same
docs layout.

Recommended shape:

```txt
.ledger/routing/
  START_HERE.md
  manifest.json
  playbooks/
```

Or, for projects that already have a docs routing system:

```yaml
docs:
  routing:
    startHere: docs/llm/START_HERE.md
    manifest: docs/llm/manifest.json
```

Ledger should be able to index those files and include them in agent packets,
but the project can keep them where they already live.

## Generated Docs And Reports

Generated outputs should not sit beside hand-authored durable docs unless the
project deliberately wants that.

Preferred Ledger output:

```txt
.ledger/indexes/
.ledger/reports/
.ledger/dist/
```

If a project wants generated HTML under `docs/`, Ledger should treat that as an
export target, not as source.

## Lifecycle Rules

Ledger should help enforce these rules:

- Source records live in Markdown.
- Generated outputs are reproducible.
- Scratchpads expire or get promoted.
- Backlog items are not treated as shipped behavior.
- Change entries are the source of truth for landed implementation memory.
- Durable product and architecture docs stay linked to the entries and decisions
  that changed them.

## Migration From A Messy docs/ Folder

A project with a crowded `docs/` folder can adopt Ledger incrementally.

Suggested migration:

1. Initialize `.ledger/`.
2. Move changelog/change-history records into `.ledger/entries/`.
3. Move accepted backlog items into `.ledger/backlog/`.
4. Move durable decisions into `.ledger/decisions/`.
5. Leave product, architecture, operations, and API docs in `docs/`.
6. Add links between Ledger records and the durable docs they affect.
7. Generate indexes and reports from Ledger.
8. Add CI validation once the structure is stable.

This keeps existing docs useful while making project memory queryable.

## Product Principle

Ledger should make project docs cleaner, not obsolete.

The best outcome is:

- `docs/` explains the current system.
- `.ledger/` explains how the system got here and what future work must know.
