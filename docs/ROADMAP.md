# Ledger Roadmap

Ledger should grow from a useful CLI into a durable change-memory protocol.

## Phase 0: Bootstrap

Status: in progress

Goals:

- create the standalone package
- document the product, architecture, schema, and roadmap
- dogfood `.ledger/`
- implement the first CLI
- validate and index the new project's own Ledger records

Initial commands:

- `ledger init`
- `ledger validate`
- `ledger index`
- `ledger explain`
- `ledger new`

## Phase 1: Reliable Core

Goals:

- strict YAML frontmatter parsing
- robust section parsing
- duplicate id detection
- required section policies
- generated JSON indexes
- stable exit codes
- focused unit tests

Deliverables:

- public TypeScript API
- CLI help output
- useful validation report
- first dogfood entry fully validated

## Phase 2: Git-Aware Drafting

Goals:

- `ledger new --from-diff`
- changed file detection
- staged vs unstaged modes
- commit metadata capture
- draft changed-file sections
- coverage checks for paths that require entries

Deliverables:

- `ledger coverage`
- `ledger new --from-diff --staged`
- initial symbol extraction for TypeScript and Markdown headings

## Phase 3: Explain And Query

Goals:

- make `ledger explain <path>` excellent
- query by file, area, status, release, decision, backlog item, and symbol
- compact agent-oriented output
- JSON output mode

Deliverables:

- `ledger query`
- `ledger explain --json`
- `ledger explain --agent`
- richer by-file and by-symbol indexes

## Phase 3.5: Docs Lifecycle Cleanup

Goals:

- make Ledger useful for projects with crowded `docs/` folders
- distinguish durable docs from change memory, scratchpads, generated outputs,
  and agent routing files
- index links between `.ledger/` records and existing docs
- provide migration guidance without requiring a big-bang docs reorganization

Deliverables:

- `ledger docs audit`
- `ledger docs classify`
- optional `.ledger/scratch/` lifecycle support
- optional `.ledger/routing/` support
- warnings for stale scratchpads and generated files committed as source
- docs-to-Ledger migration report

## Phase 3.6: Managed Docs Plane

Goals:

- let projects opt into a professional `docs/` structure managed by Ledger
- keep durable docs and change records independent but cross-linked
- validate docs-impact declarations on change entries
- generate agent routing docs from Ledger indexes when configured

Deliverables:

- `ledger init --with-docs`
- `ledger docs impact --from-diff`
- `ledger docs reconcile` for `docs/llm/manifest.json` and `docs/llm/START_HERE.md`
- `ledger docs migrate`
- docs frontmatter conventions for durable docs
- generated docs coverage report
- optional docs migration reports

## Phase 4: Conflict Assistant

Goals:

- surface relevant history during merge conflicts
- extract `On conflict` lines from changed-file sections
- show invariants and verification commands for conflicted paths

Deliverables:

- `ledger conflict <path...>`
- optional Git merge hook helper
- conflict report Markdown

## Phase 5: Release Workflow

Goals:

- group entries by release
- generate public release notes from internal entries
- preserve internal detail separately from external copy
- detect unreleased landed entries

Deliverables:

- `ledger release vX.Y.Z`
- `ledger unreleased`
- release Markdown templates

## Phase 6: Static Reader

Goals:

- local static HTML output independent of Dossier
- filter and search entries
- browse by file, area, release, decision, and backlog item
- include Markdown source access

Deliverables:

- `ledger render`
- `.ledger/dist/index.html`
- embedded manifest JSON

## Phase 7: CI And GitHub

Goals:

- GitHub Action
- PR coverage comments
- validation summaries
- missing-entry detection
- stale file and stale symbol warnings

Deliverables:

- `ledger/action`
- `ledger ci`
- pull request annotations

## Phase 8: Agent Integrations

Status: first MCP slice landed

Goals:

- MCP server
- editor integration
- compact retrieval packets
- agent handoff helpers

Deliverables:

- `ledger mcp` with read-oriented validation, query, explain, conflict, packet,
  and docs-impact tools
- VS Code extension prototype
- `ledger packet`

## Phase 9: Integrity And Evidence

Status: first integrity slice landed

Goals:

- optional signed records
- generated index integrity hashes
- verification artifact references
- provenance metadata

Deliverables:

- `ledger verify-integrity`
- optional record hash chains
- evidence references in entries and releases

## Long-Term Product Direction

Ledger should remain:

- repo-native
- source-control friendly
- useful without a hosted service
- optimized for human and agent collaboration
- independent from specific renderers

The product should avoid becoming a generic project management suite. Its center
of gravity is durable implementation memory.
