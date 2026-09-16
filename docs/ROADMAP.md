# Ledger Roadmap

Ledger should grow from a useful CLI into a durable change-memory protocol.

## Phase 0: Bootstrap

Status: complete

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

Status: complete

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

Status: smarter drafting slice landed

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
- parser-backed symbol extraction for TypeScript/JavaScript with Markdown
  heading extraction and regex fallback
- inferred areas and docs-impact prompts for drafts

## Phase 3: Explain And Query

Status: complete

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

Status: core workflow shipped

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

## Phase 3.6: Partial Docs Adoption And Managed Docs Plane

Status: core workflow shipped

Goals:

- let projects opt into partial docs adoption first, then full managed docs when
  they explicitly want Ledger to own the structure
- keep durable docs and change records independent but cross-linked
- validate docs-impact declarations on change entries
- generate agent routing docs from Ledger indexes when configured

Deliverables:

- `ledger init --with-docs`
- `ledger adopt`
- `ledger docs impact` for the working tree, `--staged`, or an explicit `--base`/`--head` range
- `ledger docs reconcile` for `docs/llm/manifest.json` and `docs/llm/START_HERE.md`
- `ledger docs migrate`
- docs frontmatter conventions for durable docs
- generated docs coverage report
- optional docs migration reports

## Phase 4: Conflict Assistant

Status: core workflow shipped

Goals:

- surface relevant history during merge conflicts
- extract `On conflict` lines from changed-file sections
- show invariants and verification commands for conflicted paths

Deliverables:

- `ledger conflict <path...>`
- optional Git merge hook helper
- conflict report Markdown

## Phase 5: Release Workflow

Status: assign workflow landed

Goals:

- group entries by release
- generate public release notes from internal entries
- preserve internal detail separately from external copy
- detect unreleased landed entries

Deliverables:

- `ledger release vX.Y.Z`
- `ledger unreleased`
- release Markdown templates
- release assignment back to selected change entries

## Phase 6: Static Reader

Status: faceted reader and lazy search slice landed

Goals:

- local static HTML output independent of Dossier
- filter and search entries
- browse by file, area, release, decision, and backlog item
- include Markdown source access
- lazy-load compact fuzzy search data
- emit static relationship graph data for hosted readers

Deliverables:

- `ledger render`
- `.ledger/dist/index.html`
- `.ledger/dist/search-index.json`
- `.ledger/dist/graph.json`
- faceted browse controls for kinds, releases, and areas
- per-record agent packet digests
- `ledger serve --watch`

## Phase 7: CI And GitHub

Status: local and repository CI plus clean-checkout PR range checks shipped;
reusable actions and richer PR annotations remain future work

Goals:

- GitHub Action
- PR coverage comments
- validation summaries
- missing-entry detection
- stale file and stale symbol warnings

Deliverables:

- `ledger/action` (future reusable package)
- `ledger ci`
- `ledger doctor`
- `ledger stale`
- pull request annotations

## Phase 8: Agent Integrations

Status: first MCP slice landed

Goals:

- MCP server
- editor integration
- compact retrieval packets
- agent handoff helpers
- token-budgeted context packets

Deliverables:

- `ledger mcp` with read-oriented validation, query, explain, conflict, packet,
  search-packet, and docs-impact tools
- VS Code extension prototype
- `ledger packet --budget <tokens>`
- `ledger agents --role <role>`

## Phase 9: Integrity And Evidence

Status: hash generation and read-only baseline verification shipped

Goals:

- optional signed records
- generated index integrity hashes
- verification artifact references
- provenance metadata

Deliverables:

- `ledger verify-integrity`
- optional record hash chains
- evidence references in entries and releases

## Phase 10: 2.0 Production Hardening

Status: core hardening complete

Shipped foundations:

- project-confined paths, symlink checks, and bounded source ingestion
- journaled, optimistic, recoverable source mutations
- loopback-only serving by default with authenticated explicit network exposure
- versioned CLI and MCP machine result envelopes
- validated integrity baselines with read-only mismatch checks
- fail-closed public release-note exports
- maintained Node LTS and cross-platform CI coverage
- production dependency audit and installed-package smoke testing

Remaining slices were re-evaluated on 2026-09-15. Sharded search, richer graph
navigation, and pull request annotations continue under Phase 11. Go and HTMX
adapters and signed integrity or transparency-log records were retired by
decision D006.

## Phase 11: Local Memory Engine

Status: foundation shipped in 0.4.0 (operation registry, catalog cache, unified
retrieval contract), the engine server in 0.5.0 (`serve --api` with the JSON
API, event stream, live reload, MCP over Streamable HTTP with resources and
prompts, CLI delegation, shared search scoring), and capture in 0.6.0
(authoring commands, expiring session records, the `ready` gate, host hooks
for Claude Code, Codex, and Cursor, the shipped skill, and the managed
`AGENTS.md` block); trust next. Direction accepted in decision D005 on
2026-09-15.

The full brainstorm, including verdicts on every earlier proposal, is in
`docs/scratchpad/next-version-brainstorm-2026-09-15.md`. Retired proposals are
recorded in decision D006.

Pillars:

- Engine: a single typed operation registry that generates the CLI, MCP tools,
  HTTP routes, help, and contract tests; an incremental content-hash catalog
  cache with JSON and optional `node:sqlite` backends; shared search scoring;
  a typed, tested browser runtime; parser-backed symbols that ship
- Engine server: `ledger serve --api` hosting the reader, a versioned JSON API,
  a server-sent events stream, live reload, and MCP over Streamable HTTP, with
  opportunistic CLI delegation to the warm server
- Capture: host hook installation for Claude Code, Codex, and Cursor, a shipped
  `SKILL.md`, authoring commands for backlog, decisions, promotion, and scratch,
  a `ready` gate, and expiring session records
- Trust: current-change coverage, per-file docs impact, an allowlisted
  verification runner with evidence sidecars, freshness checks against the code
  tree, a first-party GitHub Action, and GitHub Releases from release records
- Reader and publishing: live reload, copy actions, entity navigation, chunked
  artifacts, and a publishable public changelog
- Hygiene first: publish the repository state to npm, align the Node engines
  field, retire the dead `next` branch, remove the Homebrew claim, and
  reconcile the render budget

Sequencing: hygiene, then registry and cache, then the engine server, then
capture, then trust. Releases stay on the 0.x line without a contract freeze.
Kore adoption with hooks installed is the open acceptance check for capture
(backlog B007) and shapes what trust work lands first.

## Long-Term Product Direction

Ledger should remain:

- repo-native
- source-control friendly
- useful without a hosted service
- optimized for human and agent collaboration
- independent from specific renderers

The product should avoid becoming a generic project management suite. Its center
of gravity is durable implementation memory.
