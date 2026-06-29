# Ledger

Ledger is a repo-native change memory system for humans and coding agents.

It keeps implementation history, backlog items, durable decisions, release
notes, verification records, invariants, and merge-conflict guidance in plain
Markdown files that are easy to review, diff, grep, and hand to an agent.

Ledger's default project directory is `.ledger/`.

## Why It Exists

Most changelog tools optimize for public release notes. Ledger optimizes for
the record a maintainer or coding agent needs when returning to a codebase:

- what changed
- why it changed
- which files and symbols were touched
- what tests or checks proved the work
- what invariants must remain true
- what to do if the same area conflicts during a future merge
- which backlog items, decisions, commits, pull requests, and releases are
  related

The source of truth stays in small Markdown files. Generated indexes and reports
make those files searchable and usable by automation.

## First Commands

```bash
npm install
npm run build
npm test

node dist/cli.js validate
node dist/cli.js index
node dist/cli.js coverage
node dist/cli.js conflict README.md
node dist/cli.js unreleased
node dist/cli.js release v0.1.0 --include-unreleased
node dist/cli.js explain README.md
node dist/cli.js docs audit
```

After this package is linked or published, the intended CLI shape is:

```bash
ledger init
ledger init --with-docs
ledger new "Port upstream runtime fixes" --from-diff
ledger validate
ledger index
ledger coverage
ledger docs audit
ledger conflict apps/server/src/ws.ts
ledger explain apps/server/src/ws.ts
ledger explain apps/server/src/ws.ts --agent
ledger query --kind change --area cli
ledger unreleased
ledger release v0.1.0 --include-unreleased --write
```

## Project Shape

```txt
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

`.ledger/entries`, `.ledger/backlog`, `.ledger/decisions`, and
`.ledger/releases` are hand-authored source documents. `.ledger/indexes`,
`.ledger/reports`, and `.ledger/dist` are generated or derived outputs.
`docs/` is optional durable project documentation that Ledger can scaffold,
classify, and audit.

## Documentation

- [Product Brief](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Schema](./docs/SCHEMA.md)
- [Docs Relationship](./docs/DOCS_RELATIONSHIP.md)
- [Roadmap](./docs/ROADMAP.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)

## Product Boundary

Ledger stands on its own. It does not depend on Dossier or any renderer to be
useful. Later, a separate adapter can export Ledger's normalized model into
Dossier or any other review artifact system.
