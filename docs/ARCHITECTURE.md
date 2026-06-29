# Ledger Architecture

Ledger is built as a small CLI plus a reusable core library. The CLI manages
files and workflows. The core library parses, validates, indexes, and queries
Ledger documents.

## Layers

```txt
CLI commands
  -> workspace discovery
  -> document parser
  -> schema validator
  -> index builder
  -> query engine
  -> git inspector
  -> render/export adapters
```

## Core Modules

### Workspace Discovery

Workspace discovery finds the Ledger root for a project.

Rules:

1. If `--root` is supplied, use it.
2. If the current directory or an ancestor has `.ledger/config.yaml`, use that
   project root.
3. For `init`, create `.ledger/` under the current working directory.

The default source directories are:

- `.ledger/entries`
- `.ledger/backlog`
- `.ledger/decisions`
- `.ledger/releases`

### Config

Config lives at `.ledger/config.yaml`.

The config chooses:

- document directories
- id formatting
- required sections
- required metadata
- git coverage rules
- generated output paths
- enabled experimental features
- optional links to existing project docs and routing manifests

The first implementation supports a conservative subset. It can expand without
breaking existing projects because the Markdown files remain portable.

### Parser

The parser reads Markdown files with YAML frontmatter.

It returns:

- file path
- raw Markdown
- parsed frontmatter
- heading map
- section bodies
- code fences
- links

The parser should be strict enough to catch malformed entries but not so strict
that older records become unusable.

### Schema Validator

Validation checks document-level expectations.

For change entries, validation should require:

- `id`
- `title`
- `date`
- `status`
- `areas`
- `## Summary`
- `## Why`
- `## Verification`

Project policies can require additional sections:

- `## Changed Files`
- `## Behavior And UX Impact`
- `## Invariants`
- `## Conflict Rules`
- `## Follow-ups`

Validation output should distinguish errors from warnings.

Errors block generated indexes. Warnings guide cleanup.

### Index Builder

The index builder converts Markdown into machine-readable JSON.

Initial indexes:

- `manifest.json`: all parsed documents
- `by-file.json`: file path to related entries
- `by-area.json`: area tag to entries
- `by-release.json`: release to entries
- `by-symbol.json`: symbol to entries, initially from explicit frontmatter
- `by-decision.json`: decision id to entries
- `by-backlog.json`: backlog id to entries

Later indexes:

- `by-invariant.json`
- `search.sqlite`
- static HTML data model

### Query Engine

The query engine answers questions from indexes and source documents.

Important queries:

- explain a file
- find entries by area
- find entries by release
- list invariants for a path
- find conflict rules for a path
- show backlog items related to an entry

CLI query output has two audiences. Human output should be short and scannable.
`--json` output should be stable for tools. `--agent` output should optimize for
compact context by showing the exact entries, invariants, and verification
commands most relevant to the target.

Conflict guidance is a focused query mode for merge resolution. It scans entries
that mention the target path, extracts `On conflict` notes from `## Changed
Files`, and includes the related invariants and verification checks so an agent
can preserve the historical contract while resolving a file-level conflict.

### Git Inspector

The Git inspector is optional but high-value.

It should support:

- changed file detection
- staged diff summaries
- commit metadata
- pull request metadata where available
- `--from-diff` entry drafting
- coverage checks that decide whether a Ledger entry is required

The first coverage command is intentionally path based: files matching
`git.requireEntryFor` must be referenced by a Ledger entry unless they match
`git.ignore`. This gives CI a deterministic guard before semantic symbol
coverage exists.

Drafting from Git diffs stays conservative. Ledger can infer areas from changed
paths, extract TypeScript and Markdown anchors, and add docs-impact prompts, but
generated prose remains marked as TODO so agents must still verify and finish
the entry before landing it.

### CI Summary

`ledger ci` composes validation, docs audit, coverage, and docs impact into one
result. It does not replace the individual commands; it packages their current
state for CI, local preflight checks, and agent automation. Human output is
compact, while JSON output preserves the nested results for tools.

### Integrity

`ledger verify-integrity` hashes each source Markdown record with SHA-256 and
combines those hashes into a deterministic catalog hash. It writes a JSON index
for tooling and a Markdown report for review. This is not signing or tamper
proofing by itself; it gives releases, agents, and CI a stable provenance
artifact to compare over time.

### Release Workflow

Release generation can either render records already assigned to a version or
select currently unreleased landed work. With `--assign`, Ledger writes the
selected release version back to the selected change entries before writing the
release record. This keeps the release document and source entries in sync while
still making metadata mutation explicit.

### MCP Server

`ledger mcp` starts a local stdio Model Context Protocol server. The MCP surface
is intentionally read-oriented so agents can retrieve Ledger context without
mutating source records unless a specific write flag is requested for generated
reports.

The first server exposes tools for:

- validation
- query
- file explanation
- conflict guidance
- agent packets
- docs impact
- integrity verification

Each tool returns a JSON text payload derived from the same core functions used
by the CLI. The MCP layer should stay thin; command behavior belongs in the
library modules so the CLI, tests, and MCP server remain consistent.

### Render And Export Adapters

Ledger core should provide normalized exports, not own every presentation.

Useful outputs:

- Markdown indexes
- JSON manifests
- static HTML
- release notes
- compact agent packets
- Dossier-compatible model through a later adapter

The static HTML renderer is optional and should read from generated indexes.

The first `ledger render` implementation writes a single offline HTML file under
`.ledger/dist/index.html`. It reads source documents directly, validates before
rendering, embeds normalized JSON data, surfaces summaries, invariants, and
verification checks, and includes Markdown source access for each record. Later
renderers can consume generated indexes or emit richer multi-page output without
changing the source document model.

The static reader model includes facets for kinds, statuses, areas, and
releases so the generated page can offer quick navigation without a server.
Record cards surface relationship fields such as decisions and backlog links
alongside files, symbols, docs, invariants, and verification.

### Docs Bridge

Ledger should be able to reference existing project docs without owning them.

Projects can keep durable documentation in `docs/` and let Ledger index the
relationship:

- entries can list docs they changed in `files`
- decisions can link to architecture docs
- backlog items can link to product specs
- routing config can point at an existing `docs/llm/START_HERE.md`
- validation can warn when a source doc changed without a Ledger entry
- docs impact can check whether source changes have an explicit docs touch or a
  changed Ledger entry that references docs

This bridge keeps Ledger from becoming a docs monolith while still making docs
changes traceable.

`ledger docs reconcile` materializes the docs bridge into generated routing
files under `docs/llm/`. `ledger docs migrate` writes cleanup guidance for
scratch, generated, unknown, missing, and unreferenced docs without rewriting
durable prose.

## Command Model

### `ledger init`

Creates `.ledger/` with:

- config
- README
- templates
- policies
- source directories
- generated output directories

### `ledger new`

Creates a change entry.

Useful flags:

- `--from-diff`
- `--area`
- `--status`
- `--backlog`
- `--decision`
- `--release`

### `ledger validate`

Parses and validates source documents.

Exit codes:

- `0`: no errors
- `1`: validation errors
- `2`: operational failure, such as missing config or unreadable files

### `ledger index`

Builds JSON indexes under `.ledger/indexes`.

### `ledger render`

Builds a local static reader under `.ledger/dist/index.html`.

### `ledger ci`

Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.

### `ledger explain <path>`

Shows the Ledger history for a file or symbol.

### `ledger release <version>`

Creates or updates a release record from entries.

The first implementation is conservative. `ledger unreleased` lists landed or
shipped change entries without a `release` field. `ledger release <version>`
renders a valid release document from entries assigned to that version, or from
the unreleased set when `--include-unreleased` is supplied. Release versions must
be semver-like, optional `--status planned|released` and `--date yyyy-mm-dd`
flags control frontmatter, and `--write` creates a new file under
`.ledger/releases` without overwriting existing release records. Rendered
release Markdown separates public notes from internal Ledger entry details.

### `ledger conflict <path...>`

Shows merge-conflict guidance for files.

The first implementation reads source documents directly. A later version can
use generated indexes when conflict rules are promoted into the index model.

### `ledger docs impact`

Reports changed source files, changed docs files, changed Ledger entries, and
docs referenced by those changed entries. With `--check`, it becomes a guard for
source changes that have no visible docs impact. The command does not rewrite
documentation; it only surfaces whether docs were touched or intentionally
referenced.

### `ledger docs classify`

Classifies one or more docs paths using Ledger's docs lifecycle vocabulary:
durable, routing, scratch, generated, or unknown. Without explicit paths, it
classifies the configured docs root. This is a smaller, routing-friendly command
for agents that need to decide whether a doc is current truth, temporary work,
generated output, or agent entrypoint material.

## Data Flow

```txt
Markdown source
  -> parse
  -> validate
  -> normalize
  -> index JSON
  -> query/render/export
```

The source files stay useful even if every generated file is deleted.

## Generated Files

Generated files should include a header or metadata field that says they are
generated.

They should be reproducible from source documents.

Suggested generated paths:

```txt
.ledger/indexes/manifest.json
.ledger/indexes/by-file.json
.ledger/indexes/by-area.json
.ledger/indexes/by-release.json
.ledger/indexes/by-symbol.json
.ledger/indexes/by-decision.json
.ledger/indexes/by-backlog.json
.ledger/reports/latest-validation.md
.ledger/dist/index.html
```

## Error Philosophy

Ledger should be explicit about malformed records.

It should not silently ignore:

- missing IDs
- duplicate IDs
- invalid dates
- invalid statuses
- unreadable files
- malformed frontmatter
- broken source directories

It can warn, rather than fail, for:

- missing optional sections
- stale file references
- empty verification details
- unknown future frontmatter fields

## Extension Points

Ledger should eventually support:

- custom document kinds
- custom required sections
- custom id prefixes
- custom static renderers
- custom Git coverage policies
- docs lifecycle policies
- MCP tools
- editor integrations
- external renderer adapters

## Independence From Dossier

Ledger must not import Dossier or require Dossier output.

The clean future integration is:

```txt
Ledger Markdown
  -> Ledger normalized JSON
  -> optional adapter
  -> Dossier artifact
```

That keeps Ledger useful in terminals, CI, GitHub Actions, and agent workflows.
