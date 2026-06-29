# Ledger Implementation Plan

This plan captures the initial build sequence for the standalone Ledger package.

## Initial Repository

Location:

```txt
/Users/kyle/Developer/packages/ledger
```

Initial stack:

- TypeScript
- Node.js CLI
- Vitest
- YAML frontmatter parsing
- plain Markdown source documents

The package starts as a CLI and library in one project. It can split into
workspace packages later if the API surface grows.

## Initial File Set

```txt
README.md
package.json
tsconfig.json
src/
  cli.ts
  config.ts
  conflict.ts
  coverage.ts
  documents.ts
  docs.ts
  docsImpact.ts
  frontmatter.ts
  indexer.ts
  query.ts
  release.ts
  validate.ts
  workspace.ts
test/
  conflict.test.ts
  coverage.test.ts
  docs.test.ts
  docsImpact.test.ts
  frontmatter.test.ts
  query.test.ts
  release.test.ts
  validate.test.ts
docs/
  PRODUCT.md
  ARCHITECTURE.md
  SCHEMA.md
  ROADMAP.md
  IMPLEMENTATION_PLAN.md
.ledger/
  config.yaml
  entries/
  backlog/
  decisions/
  releases/
  templates/
  policies/
  indexes/
  reports/
  dist/
docs/
  product/
  architecture/
  operations/
  api/
  guides/
  reference/
  llm/
```

## MVP Commands

### `ledger init`

Creates `.ledger/` if missing.

With `--with-docs`, also creates a visible durable `docs/` plane with product,
architecture, operations, API, guides, reference, and LLM routing directories.

Should be idempotent:

- create missing directories
- create missing templates
- avoid overwriting hand-edited files unless `--force`

### `ledger validate`

Reads `.ledger/` and validates:

- required frontmatter
- duplicate ids
- required sections
- known document kinds
- source directory readability

### `ledger index`

Writes:

- `.ledger/indexes/manifest.json`
- `.ledger/indexes/by-file.json`
- `.ledger/indexes/by-area.json`
- `.ledger/indexes/by-release.json`
- `.ledger/indexes/by-symbol.json`

### `ledger coverage`

Reads changed files from Git and checks whether files matching
`git.requireEntryFor` are mentioned by at least one Ledger entry. `--staged`
uses the staged diff, and `--json` emits the raw result for CI or agent tools.

### `ledger conflict <path...>`

Shows merge-conflict guidance for one or more files by finding Ledger entries
that mention each target path. Human output includes the matching entries,
changed-file match, conflict rules, invariants, and verification commands.
`--json` emits the same model for agent workflows and merge tooling.

### `ledger docs audit`

Classifies the configured docs root, reports Ledger-to-doc references, and
writes `.ledger/reports/docs-audit.md`.

### `ledger docs check`

Runs the docs audit and exits non-zero only when Ledger references docs that do
not exist.

### `ledger docs classify`

Classifies docs paths as durable, routing, scratch, generated, or unknown. With
explicit paths, it classifies only those paths. Without paths, it classifies the
configured docs root using the same discovery path as `ledger docs audit`.
`--json` emits the raw file list for agents and routing tools.

### `ledger docs impact`

Reads changed files from Git, classifies source files, docs files, and changed
Ledger entries, then reports whether source changes have an explicit docs
impact. A docs impact exists when a docs file changed directly or when a changed
Ledger entry references docs. `--staged` inspects the staged diff, `--json`
emits the raw model, and `--check` exits non-zero when source files lack docs
impact.

### `ledger explain <path>`

Reads indexes if present, falls back to source parsing, and prints entries that
mention the file path.

Supports:

- `--json` for machine-readable output.
- `--agent` for compact invariants and verification context.

### `ledger query`

Filters Ledger records by kind, status, and area.

```bash
ledger query --kind change --status landed --area cli
ledger query --area docs --json
```

### `ledger unreleased`

Lists landed or shipped change entries that do not have a `release` assignment.
`--json` emits normalized records for automation.

### `ledger release <version>`

Builds a valid Ledger release document for a version. By default it selects
change entries whose `release` field matches the version. With
`--include-unreleased`, it selects currently unreleased landed or shipped change
entries. With `--write`, it writes `.ledger/releases/<version>.md` and refuses
to overwrite an existing release file. `--json` emits the rendered document and
selected entries.

### `ledger new <title>`

Creates the next numbered change entry from the template.

Initial support:

- `--from-diff` to include changed files from Git
- `--area <area>`
- `--status <status>`

## Validation Policy

The first validator should be useful without being overbearing.

Errors:

- missing `.ledger/config.yaml`
- malformed frontmatter
- missing id
- missing title
- missing date
- missing status
- duplicate id
- missing required sections for known document kinds

Warnings:

- missing updated date
- missing areas
- missing verification detail
- file references that do not exist
- unknown fields

## Testing Strategy

Focused tests first:

- frontmatter parsing
- Markdown section parsing
- document discovery
- duplicate id validation
- index grouping
- `explain` lookup behavior

End-to-end tests can use temporary directories and the CLI later.

## Dogfooding

Ledger should use its own `.ledger/` directory from the beginning.

The bootstrap entry records the initial package scaffold. Decisions record the
source-of-truth and product-boundary choices. Backlog items capture the next
major features.

## Later Repository Setup

GitHub setup can happen after the local implementation is useful.

Future repository tasks:

- initialize Git if needed
- add license
- add GitHub Actions
- add release workflow
- add package publishing workflow if publishing becomes a goal
- add issue templates
- add pull request template

## Open Questions

- Whether the npm package can use the exact name `ledger`.
- Whether the first public release should ship only the CLI or a documented
  library API too.
- Whether static HTML rendering belongs in the core CLI or a sibling package.
- Whether symbol extraction should use language-specific parsers or begin with
  explicit frontmatter only.
