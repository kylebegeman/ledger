<p align="center">
  <a href="https://github.com/kylebegeman/ledger">
    <img src="./assets/ledger.svg" alt="Ledger notebook icon" width="128" height="128">
  </a>
</p>

<h1 align="center">Ledger</h1>

<p align="center">
  <strong>Repo-native change memory for humans and coding agents.</strong>
</p>

<p align="center">
  Agents sign in, do the work, and leave a durable record for the next person
  or agent who touches the codebase.
</p>

<p align="center">
  <a href="https://github.com/kylebegeman/ledger/actions/workflows/ci.yml?query=branch%3Amaster">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/kylebegeman/ledger/ci.yml?branch=master&style=for-the-badge&label=CI">
  </a>
  <a href="https://github.com/kylebegeman/ledger/blob/master/package.json">
    <img alt="Version" src="https://img.shields.io/github/package-json/v/kylebegeman/ledger?style=for-the-badge&label=version">
  </a>
  <a href="https://github.com/kylebegeman/ledger/blob/master/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/kylebegeman/ledger?style=for-the-badge">
  </a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-43853D?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Markdown source" src="https://img.shields.io/badge/source-markdown-111111?style=for-the-badge&logo=markdown&logoColor=white">
</p>

---

Ledger is an agent-first CLI and TypeScript library for keeping implementation
history, backlog, durable decisions, release notes, verification records,
invariants, docs impact, and merge-conflict guidance inside your repository.

The primary design target is coding agents: compact retrieval, MCP tools,
conflict guidance, docs impact checks, and durable handoff records that survive
between sessions. Human use is fully supported through the CLI and generated
reader, but the structure is intentionally optimized so agents can read, query,
and act on the history without guessing from Git alone.

The source of truth is plain Markdown under `.ledger/`. Generated indexes,
reports, release notes, and a static reader make those records useful for
automation without making the project dependent on a hosted service.

## At A Glance

| Question | Answer |
| --- | --- |
| What is it? | A structured change memory layer for software repos. |
| Primary audience | Coding agents that need durable implementation memory. |
| Human workflow | Fully available through the CLI, Markdown records, reports, and static reader. |
| Source format | Markdown with YAML frontmatter. |
| Default root | `.ledger/` |
| Runtime | Node >=20 |
| Outputs | JSON indexes, validation reports, docs reports, release records, static HTML. |
| Product boundary | Ledger stands alone. It can later export into Dossier or other renderers. |

## Why Ledger Exists

Traditional changelogs answer what shipped. Ledger answers what future
maintainers and agents need before changing the code again:

- what changed
- why the change exists
- which files, symbols, docs, decisions, and backlog items are related
- what invariants must survive future refactors
- what verification proved the behavior
- what to preserve if the same area conflicts during a merge
- which release carried the work

Git history tells you what happened. Ledger tells you what matters.

## Five Minute Start

### Work From This Repo Today

```bash
git clone https://github.com/kylebegeman/ledger.git
cd ledger
npm ci
npm run build
npm link

ledger version
```

You can also run the CLI without linking:

```bash
node dist/cli.js version
```

### Initialize Ledger In A Project

```bash
cd /path/to/your-project
ledger init --with-docs
```

This creates:

```txt
.ledger/
  config.yaml
  entries/
  backlog/
  decisions/
  releases/
  templates/
  policies/

docs/
  README.md
  llm/
```

### Record A Change

```bash
git status --short
ledger new "Add provider reconnect guard" --from-diff --area runtime
```

Ledger drafts a Markdown entry with changed files, detected TypeScript or
Markdown symbols, inferred areas, docs impact prompts, and a per-file conflict
checklist.

Open the generated file, finish the narrative, then run:

```bash
ledger validate
ledger ci
```

### Build The Local Reader

```bash
ledger index
ledger render
open .ledger/dist/index.html
```

The static reader is a single offline HTML file. It gives humans and agents a
searchable, faceted view of entries, decisions, backlog, releases, invariants,
verification checks, relationships, and raw Markdown source.

`ledger render` also writes `.ledger/dist/search-index.json` and
`.ledger/dist/graph.json`. The reader lazy-loads the compact search index for
weighted fuzzy search, ranking exact ID, title, path, symbol, and file matches
above incidental summary or context matches. Relationship data is kept available
as a static artifact that can be hosted anywhere static files are supported.

Render output is checked against `render.budgets` in `.ledger/config.yaml`.
`ledger render` prints artifact size and write-time status, while `ledger
doctor` reports whether the generated reader is over budget.

The same weighted search model is available from the terminal:

```bash
ledger search renderer --limit 5
```

Core read, validation, index, render-model, and search latency can be checked
with:

```bash
ledger metrics
```

For local preview:

```bash
ledger serve --watch
```

### Published Package Shape

Ledger is intended to publish as the scoped public package
`@kylebegeman/ledger`. The scoped name avoids collisions with unrelated unscoped
`ledger` packages and supports direct one-off CLI usage:

```bash
pnpm dlx @kylebegeman/ledger init --with-docs
pnpm dlx @kylebegeman/ledger ci
npm exec --package @kylebegeman/ledger -- ledger init --with-docs
npx --package @kylebegeman/ledger -- ledger ci
```

For a project-local install:

```bash
npm install --save-dev @kylebegeman/ledger
npx ledger init --with-docs
npx ledger ci
```

### Library API

The package root exports the stable high-level API for agents, CLIs, and
integrations:

```ts
import {
  buildAgentPacket,
  buildStaticReaderModel,
  readLedgerDocuments,
  searchLedgerIndex,
  validateDocuments,
} from "@kylebegeman/ledger";
```

Lower-level helpers remain available from `@kylebegeman/ledger/unstable`.
Those exports are useful for experimentation and project-local tooling, but can
change between minor versions while the package is still pre-1.0.

The package builds from source during `prepare`; release checks use
`npm run release:build`.

After the Homebrew tap is published, macOS users can install with:

```bash
brew tap kylebegeman/tap
brew install ledger
```

## What Ledger Creates

| Path | Purpose |
| --- | --- |
| `.ledger/entries/` | Landed change records. |
| `.ledger/backlog/` | Accepted or proposed future work. |
| `.ledger/decisions/` | Durable project decisions. |
| `.ledger/releases/` | Release records generated from entries or maintained by hand. |
| `.ledger/templates/` | Project-local templates for new records. |
| `.ledger/policies/` | Policy files such as git coverage requirements. |
| `.ledger/indexes/` | Generated JSON indexes. |
| `.ledger/reports/` | Validation, docs, coverage, and impact reports. |
| `.ledger/dist/` | Generated static reader output. |
| `docs/` | Optional durable project docs scaffold managed alongside Ledger records. |

## Command Map

| Command | What It Does |
| --- | --- |
| `ledger init --with-docs` | Creates `.ledger/` and optional `docs/` scaffolding. |
| `ledger init --migrate` | Creates a partial-adoption scaffold for replacing an existing changelog or docs workflow. |
| `ledger adopt` | Initializes Ledger for an established repo without claiming ownership of the whole docs tree. |
| `ledger new "Title" --from-diff` | Drafts a change entry from git status. |
| `ledger feedback "Title"` | Captures dogfood or product feedback as a first-class product note. |
| `ledger validate` | Parses and validates Ledger source documents. Supports `--current-only`, `--update-baseline`, and `--no-baseline`. |
| `ledger index` | Writes JSON indexes under `.ledger/indexes/`. |
| `ledger verify-integrity` | Writes record and catalog hashes for provenance checks. |
| `ledger render` | Builds the static HTML reader plus lazy search and relationship graph JSON. |
| `ledger serve --watch` | Serves the static reader locally and rebuilds it when Ledger records change. |
| `ledger coverage --explain` | Checks that changed source paths have Ledger coverage and explains required, ignored, covered, and missing paths. |
| `ledger doctor` | Checks workspace health, Git availability, validation, docs references, index freshness, render output, performance budgets, and stale signals. |
| `ledger metrics` | Measures read, validate, index, render-model, and search latency against configured budgets. |
| `ledger stale --check` | Finds stale knowledge signals such as missing relationships, stale symbols, and release verification gaps. |
| `ledger docs audit` | Finds missing and unreferenced durable docs links. |
| `ledger docs classify <path>` | Classifies docs as durable, routing, scratch, generated, or unknown. |
| `ledger docs impact --check` | Fails when source changes lack docs impact. |
| `ledger docs reconcile` | Regenerates the docs routing manifest and `START_HERE.md` from the docs audit. |
| `ledger docs migrate` | Writes a docs migration report with cleanup guidance. |
| `ledger explain <path>` | Shows records related to a file. |
| `ledger explain <path> --agent` | Emits compact agent context for a file. |
| `ledger search <query> --limit 5` | Runs weighted fuzzy search over the same fields used by the static reader. |
| `ledger search-packet <query> --budget 1600 --limit 5` | Builds a token-budgeted agent packet from weighted search results when the exact file path is unknown. |
| `ledger packet <path> --budget 1200 --write-report` | Builds a compact token-budgeted agent handoff packet, optionally writing `.ledger/reports/packet.md`. |
| `ledger mcp` | Starts a stdio MCP server for agent tools. |
| `ledger conflict <path> --write-report` | Extracts conflict rules, invariants, and verification, optionally writing `.ledger/reports/conflict.md`. |
| `ledger query --kind change --area cli --symbol run --text retry` | Filters records by kind, area, status, release, relationship, symbol, file, doc, id, or metadata text. |
| `ledger unreleased` | Lists landed or shipped changes not assigned to a release. |
| `ledger release v0.1.1 --include-unreleased --assign --status released --write` | Assigns selected entries and writes a release record. |
| `ledger migrate changelog <dir> --rewrite-docs` | Migrates legacy Markdown changelog records into `.ledger/entries` and writes a receipt. |
| `ledger agents --role reviewer` | Prints role-specific `AGENTS.md` instructions for the configured workflow. |
| `ledger ci` | Runs validation, docs audit, coverage, and docs impact together. |

Every command has focused help:

```bash
ledger help
ledger help new
ledger docs impact --help
ledger release --help
```

Commands that support `--json` return machine-readable failures for operational
errors:

```json
{
  "ok": false,
  "error": {
    "code": "workspace-not-found",
    "message": "Could not find .ledger/config.yaml from /path/to/repo"
  }
}
```

## Adoption And Migration

Established repos can use partial docs adoption:

```bash
ledger adopt
ledger migrate changelog docs/changelog --rewrite-docs
ledger validate --current-only
```

`ledger migrate changelog <dir>` reads Markdown records, preserves IDs when
possible, writes duplicate-ID suggestions in a migration receipt, and maps
frontmatter plus body sections into Ledger change entries. `--rewrite-docs`
updates docs references from old changelog paths to the new `.ledger/entries`
paths.

For long-lived histories, mark migrated records with `status: "historical"` or
acknowledge stale paths with `staleRefs`. Historical records stay queryable but
do not flood validation with missing file warnings. Projects can also use
`ledger validate --update-baseline` to baseline known warnings and
`ledger validate --current-only` while actively changing current records.

Entry `files` can use exact paths, globs such as `src/features/**`, or explicit
`prefix:` and `glob:` patterns. `ledger new --from-diff` omits configured
generated/vendor ignores and groups very large diffs into patterns.

Dogfood findings and product observations belong in product notes:

```bash
ledger feedback "Improve changelog migration receipt" --area cli --tag dogfood
```

Project-specific metadata can be made strict with `schema.extensions` in
`.ledger/config.yaml`, for example `phaseId: string` or `productAreas:
string[]`.

## Example Change Entry

```markdown
---
id: "0020"
kind: "change"
title: "Overhaul README and prepare patch release"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "release"]
files:
  - "README.md"
  - "package.json"
symbols:
  - "ledger release"
docs:
  - "docs/PRODUCT.md"
docsImpact:
  status: "updated"
  reason: "Product docs changed with the release workflow."
  docs:
    - "docs/PRODUCT.md"
commits: []
release: "v0.1.1"
---

# 0020: Overhaul README And Prepare Patch Release

## Summary

Explain what changed.

## Why

Explain why it changed.

## Changed Files

### README.md

- What changed: Reworked the public project landing page.
- Anchor: `Five Minute Start`
- On conflict: Keep the README accurate for the current install state.

## Behavior And UX Impact

Explain what users experience differently.

## Invariants

- Markdown remains the source of truth.
- Generated outputs remain derived artifacts.

## Verification

- `npm run check`
- `node dist/cli.js ci`
```

## Agent Workflow

Ledger is designed to be useful to coding agents without special integration.

Before editing:

```bash
ledger explain path/to/file.ts --agent
ledger search "thing you need" --limit 5
ledger search-packet "thing you need" --budget 1600 --limit 5
ledger packet path/to/file.ts --budget 1200 --write-report
ledger conflict path/to/file.ts
```

`ledger packet` and `ledger search-packet` report an approximate token count,
the requested budget, and how many matching entries were omitted. This keeps
agent context bounded without requiring callers to trim output themselves.

After editing:

```bash
ledger new "Describe the change" --from-diff
ledger doctor
ledger stale
ledger ci
```

The entry should tell the next agent what changed, what must remain true, and
how to verify the behavior.

For MCP-capable agents, run Ledger as a stdio server:

```bash
ledger mcp
```

The server exposes tools for validation, query, file explanation, conflict
guidance, file-based agent packets, search-based agent packets, docs impact
checks, and integrity verification.
Each MCP response includes a compact `summary` object before detailed payload
fields so agents can decide whether to read the full result.

Use `ledger agents --role contributor`, `ledger agents --role reviewer`,
`ledger agents --role release`, `ledger agents --role migration`, or
`ledger agents --role conflict` to generate narrower operating instructions for
specialized agents.

## Release Workflow

Prepare a release record from entries already assigned to a version:

```bash
ledger release v0.1.1 --status released --date 2026-06-29 --write
```

Or preview currently unreleased work without writing:

```bash
ledger release v0.1.1 --include-unreleased --status planned
```

To promote currently unreleased landed work and write the release record in one
step:

```bash
ledger release v0.1.1 --include-unreleased --assign --status released --write
```

The generated release document includes public notes, internal entry details,
verification guidance, and known issues.

## Docs Relationship

Ledger does not replace full project documentation. It replaces the scattered
implementation memory that often grows inside `docs/` without structure.

Use:

- `.ledger/` for change records, backlog, decisions, releases, invariants,
  verification, and conflict rules
- `docs/` for durable product, architecture, operations, API, guide, reference,
  and agent routing docs

Ledger can scaffold and audit `docs/`, but it does not try to become a docs CMS.
`ledger docs reconcile` keeps agent routing files current, and
`ledger docs migrate` reports scratch, generated, unknown, missing, and
unreferenced docs that may need cleanup.

## Integrity

Use `ledger verify-integrity` to generate a deterministic SHA-256 hash for every
Ledger source record plus a catalog hash for the current record set. Ledger
writes `.ledger/indexes/integrity.json` for tools and
`.ledger/reports/integrity.md` for review.

## Library Usage

The package exports the same core primitives used by the CLI:

```ts
import {
  findWorkspace,
  readLedgerDocuments,
  validateDocuments,
  buildIndexes,
  createLedgerMcpServer,
} from "@kylebegeman/ledger";

const workspace = await findWorkspace(process.cwd());
const documents = await readLedgerDocuments(workspace);
const validation = validateDocuments(workspace, documents);
const indexes = buildIndexes(workspace, documents);
const mcpServer = createLedgerMcpServer({ cwd: process.cwd() });
```

Use the library when you want to build custom dashboards, agent context
packets, release tooling, or renderer adapters.

## Project Docs

- [Product Brief](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Schema](./docs/SCHEMA.md)
- [Ledger And Project Docs](./docs/DOCS_RELATIONSHIP.md)
- [Roadmap](./docs/ROADMAP.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)

## Development

Development happens on `next`. Stable releases are promoted to `master`.

```bash
npm ci
npm run ci
```

`npm run ci` runs typecheck, tests, build, Ledger's own CI checks, and an npm
package dry run.

Tagged releases use `.github/workflows/release.yml`. When `NPM_TOKEN` is set in
repository secrets, pushing `vX.Y.Z` publishes the verified package to npm with
provenance.

### Publishing To npm

First-time maintainers need an npm account that has permission to publish the
`@kylebegeman` scope.

1. Create an account at <https://www.npmjs.com/signup> if needed.
2. Verify the account email address in npm.
3. In this repo, run:

```bash
npm login --auth-type=web
npm whoami
npm run release:build
npm publish --access public
```

npm may open a browser authorization flow for accounts protected by passkeys or
security keys. Complete the browser prompt, return to the terminal, and continue
the publish. For unattended releases, prefer npm trusted publishing from GitHub
Actions once the package has a trusted publisher configured.

Each publish needs a new package version. If npm reports that the version was
already published, bump `package.json` and `package-lock.json`, rerun the release
checks, and publish that new version.

### Publishing To Homebrew

Homebrew needs a tap repository and a stable package URL. Publish npm first,
then update `kylebegeman/homebrew-tap` with a `Formula/ledger.rb` formula that
installs the published npm tarball for the same version.

```bash
brew tap kylebegeman/tap
brew bump-formula-pr --version <version> kylebegeman/tap/ledger
```

After the formula is pushed, users install with:

```bash
brew tap kylebegeman/tap
brew install ledger
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## Product Boundary

Ledger stands on its own. It does not depend on Dossier or any renderer to be
useful. Later, a separate adapter can export Ledger's normalized model into
Dossier or another artifact system.

## License

[MIT](./LICENSE)
