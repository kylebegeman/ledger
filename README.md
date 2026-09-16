<p align="center">
  <a href="https://github.com/kylebegeman/ledger">
    <img src="./assets/ledger.svg" alt="Ledger logo" width="128" height="128">
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
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D22-43853D?style=for-the-badge&logo=node.js&logoColor=white">
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
| Runtime | Node >=22, tested on maintained Node 22 and Node 24 LTS lines. |
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
checklist. Diffs over 40 files are grouped into path patterns and skip automatic
symbol collection so the receipt remains bounded and reviewable.

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

The static reader is a self-contained offline bundle. It gives humans and agents
a searchable, faceted view of entries, decisions, backlog, releases, invariants,
verification checks, relationships, source paths, and agent-ready retrieval
commands without embedding every raw Markdown document into the initial page.

`ledger render` also writes `.ledger/dist/search-index.json` and
`.ledger/dist/graph.json`. The reader lazy-loads the compact search index for
weighted fuzzy search, ranking exact ID, title, path, symbol, and file matches
above incidental summary or context matches. Relationship data is kept available
as a static artifact that can be hosted anywhere static files are supported. The
reader offers a keyboard search palette, shareable filter URLs, light and dark
themes, dropdown filter pills, pagination with a configurable page size,
compact and expanded result densities, and ranked search results. The visual
shell is a flat editorial layout: records read as a hairline-divided list,
and the few remaining container surfaces use a thin stroke outline instead of
fills, shadows, or ornamental edge strokes.

Render output is checked against `render.budgets` in `.ledger/config.yaml`.
`ledger render` prints artifact size and write-time status, while `ledger
doctor` reports whether the generated reader is over budget.

The same weighted search model is available from the terminal:

```bash
ledger search renderer --limit 5
```

Ledger keeps a derived catalog cache under `.ledger/cache/` so repeated
commands and agent calls parse only the records that changed. The JSON backend
works everywhere; on Node 24.15 or newer the built-in sqlite backend is chosen
automatically. Set `cache.backend` in `.ledger/config.yaml` to `json`,
`sqlite`, or `none` to override. Core read, validation, index, render-model,
and search latency can be checked with:

```bash
ledger metrics
```

For local preview:

```bash
ledger serve --watch
ledger serve --profile public --watch
```

For the engine, which adds a JSON API, an event stream, and MCP over HTTP on
the same loopback port:

```bash
ledger serve --api
curl -s http://127.0.0.1:4173/api/v1/health
curl -s -X POST http://127.0.0.1:4173/api/v1/operations/explain \\
  -H "content-type: application/json" -d '{"path":"src/cli.ts"}'
```

Every operation that runs inside a workspace is available as
`POST /api/v1/operations/<name>` with its input as the JSON body and the same
machine envelope as `--json`. MCP clients connect to `/mcp`.

While the engine runs, the reader open in your browser reloads itself after
every rebuild, and CLI commands in the same project delegate to the engine and
answer from its warm cache; nothing changes in how you call them. Pass
`--local` on any command, or set `LEDGER_NO_DAEMON=1`, to run in-process. If
the engine is gone, commands fall back to running locally on their own.

The default server binds only to loopback, validates the request host, serves
only `GET` and `HEAD`, and sends no-store plus browser security headers. The
optional public profile renders and serves the isolated public release-notes
output instead of the internal reader. To bind to a network interface, opt in
explicitly and provide a token through the environment:

```bash
LEDGER_SERVE_TOKEN="use-a-random-token-at-least-24-characters" \
  ledger serve --expose --host 0.0.0.0
```

Network mode accepts HTTP Basic authentication with user `ledger` or a Bearer
token. Prefer a TLS reverse proxy when traffic leaves the local machine.

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

See [Ledger API](./docs/API.md) for promotion rules, compatibility expectations,
and token-bounded agent retrieval APIs.

The package builds from source during `prepare`; release checks use
`npm run release:build`. See [Release Prep](./docs/RELEASE_PREP.md) for the
full local verification and publishing checklist.

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
| `.ledger/dist/` | Generated internal reader output, with sanitized public output under `.ledger/dist/public/`. |
| `docs/` | Optional durable project docs scaffold managed alongside Ledger records. |

## Command Map

| Command | What It Does |
| --- | --- |
| `ledger init --with-docs` | Creates `.ledger/` and optional `docs/` scaffolding. |
| `ledger init --migrate` | Creates a partial-adoption scaffold for replacing an existing changelog or docs workflow. |
| `ledger adopt` | Initializes Ledger for an established repo without claiming ownership of the whole docs tree. |
| `ledger new "Title" --from-diff` | Drafts a change entry from git status. |
| `ledger feedback "Title"` | Captures dogfood or product feedback as a first-class product note. |
| `ledger backlog new "Title" --area cli --decision D001` | Creates the next numbered backlog item from the template. |
| `ledger decision new "Title" --area architecture` | Creates the next numbered decision record from the template. |
| `ledger promote B001 --from-diff` | Creates a draft change entry linked to a backlog item, carrying its acceptance checks, and marks the item in-progress in one transaction. |
| `ledger validate` | Parses and validates Ledger source documents. Supports `--current-only`, `--update-baseline`, and `--no-baseline`. |
| `ledger index` | Validates records and writes JSON indexes under `.ledger/indexes/`. |
| `ledger verify-integrity` | Writes record and catalog hashes for provenance checks. Use `--check` to compare without replacing the baseline. |
| `ledger render` | Builds the internal static reader. Use `--profile public` for released public notes only. |
| `ledger serve --watch` | Serves the static reader on loopback and rebuilds it when Ledger records change. Use `--profile public` to preview only the isolated public output. |
| `ledger serve --api` | Starts the engine: the reader plus a JSON API at `/api/v1`, an event stream at `/events`, MCP over Streamable HTTP at `/mcp`, and a daemon record for CLI delegation. |
| `ledger coverage --explain` | Checks working-tree paths, or an explicit `--base`/`--head` range, and explains required, ignored, covered, and missing coverage. |
| `ledger doctor` | Checks workspace health, Git availability, write transaction state, validation, docs references, index freshness, render output, performance budgets, and stale signals. |
| `ledger metrics` | Measures cold read, warm cached read, validate, index, render-model, and search latency against configured budgets. |
| `ledger cache status` | Reports the catalog cache backend, size, and freshness. Use `cache warm` to prefill it and `cache clear` to delete it. |
| `ledger stale --check` | Finds stale knowledge signals such as missing relationships, stale symbols, and release verification gaps. |
| `ledger docs audit` | Finds missing and unreferenced durable docs links. |
| `ledger docs classify <path>` | Classifies docs as durable, routing, scratch, generated, or unknown. |
| `ledger docs impact --check` | Fails when working-tree or explicit `--base`/`--head` source changes lack docs impact. |
| `ledger docs reconcile` | Regenerates the docs routing manifest and `START_HERE.md` from the docs audit. |
| `ledger docs migrate` | Writes a docs migration report with cleanup guidance. |
| `ledger explain <path>` | Shows records that mention a file plus the decisions, backlog items, and superseding records one hop away. |
| `ledger explain <path> --agent` | Emits compact agent context for a file. |
| `ledger search <query> --limit 5` | Runs weighted fuzzy search over the same fields used by the static reader. |
| `ledger search-packet <query> --budget 1600 --limit 5` | Builds a token-budgeted agent packet from weighted search results when the exact file path is unknown. |
| `ledger packet <path> --budget 1200 --write-report` | Builds a compact token-budgeted agent handoff packet, optionally writing `.ledger/reports/packet.md`. |
| `ledger mcp` | Starts a stdio MCP server exposing every registry operation with MCP metadata. |
| `ledger conflict <path> --write-report` | Extracts conflict rules, invariants, and verification, optionally writing `.ledger/reports/conflict.md`. |
| `ledger query --kind change --area cli --symbol run --text retry` | Filters records by kind, area, status, release, relationship, symbol, file, doc, id, or metadata text. |
| `ledger unreleased` | Lists landed or shipped changes not assigned to a release. |
| `ledger release v0.1.1 --include-unreleased --assign --status released --write` | Assigns selected entries and writes a release record. |
| `ledger release notes v0.1.1` | Prints the Public Notes of a release record for GitHub Releases or changelogs. |
| `ledger migrate changelog <dir> --rewrite-docs` | Migrates legacy Markdown changelog records into `.ledger/entries` and writes a receipt. |
| `ledger agents --role reviewer` | Prints role-specific `AGENTS.md` instructions for the configured workflow. |
| `ledger ci` | Runs validation, docs audit, coverage, and docs impact together; accepts `--base` and `--head` for clean PR checkouts. |

Every command has focused help:

```bash
ledger help
ledger help new
ledger docs impact --help
ledger release --help
```

Every command except `serve` and `mcp` supports `--json` and returns a versioned
envelope for both success and failure. MCP tools use the same envelope:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "validate",
  "error": {
    "code": "workspace-not-found",
    "message": "Could not find .ledger/config.yaml from /path/to/repo",
    "details": {
      "startDir": "/path/to/repo"
    }
  }
}
```

Successful envelopes place command-specific output under `data`. Error codes
come from typed boundaries; human message wording is not used to classify
failures.

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

In a clean pull-request checkout, pass the compared revisions so coverage and
docs impact inspect committed changes rather than an empty working tree:

```bash
ledger ci --base <base-revision> --head <head-revision>
```

Ledger compares the merge-base range. `--staged` and `--base`/`--head` are
mutually exclusive, and Git inspection failures are reported as operational
errors instead of being treated as zero changed files.

The entry should tell the next agent what changed, what must remain true, and
how to verify the behavior.

For MCP-capable agents, run Ledger as a stdio server:

```bash
ledger mcp
```

The server exposes every registry operation with MCP metadata: validate, query,
search, explain, conflict, packet, search-packet, coverage, ci, doctor, metrics,
stale, unreleased, docs audit, docs classify, docs impact, and integrity
verification. Tools declare input and output schemas and return the machine
envelope as structured content. Each response includes a compact `summary`
object before detailed payload fields so agents can decide whether to read the
full result. Records are also available as resources (`ledger://records/{id}`,
`ledger://packet/{path}`, `ledger://contract`), and the
`ledger_agent_instructions` and `ledger_handoff` prompts give agents role
instructions and a pre-edit handoff for a file. The same server runs over HTTP
at `/mcp` under `ledger serve --api`.

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

Assignment and release-file creation commit through one journaled transaction.
If an entry changes after planning, Ledger stops without overwriting the newer
content or creating a partial release.

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

Use `ledger verify-integrity --check` in CI or release verification when a
previously generated integrity index has been preserved as the expected
baseline. Check mode never replaces that baseline and reports added, removed,
and changed records.

## Public Reader Export

`ledger render --profile public` writes a separate reader to
`.ledger/dist/public/`. The public profile is fail-closed: it includes only
release records whose status is `released`, and only their explicit
`Public Notes` content. It removes raw Markdown, repository paths, files,
symbols, internal relationships, validation issues, invariants, and verification
details from the HTML and JSON artifacts. Review public notes before publishing
the generated directory.

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
- [API](./docs/API.md)
- [Schema](./docs/SCHEMA.md)
- [Ledger And Project Docs](./docs/DOCS_RELATIONSHIP.md)
- [Release Prep](./docs/RELEASE_PREP.md)
- [Roadmap](./docs/ROADMAP.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)

## Development

Development happens on short-lived branches merged into `master` through pull
requests. Releases are tagged from `master`.

```bash
npm ci
npm run ci
```

`npm run ci` runs typecheck, tests, build, Ledger's own CI checks, and an npm
package dry run.

Tagged releases use `.github/workflows/release.yml`. Pushing `vX.Y.Z` runs the
full verification, publishes the package to npm through trusted publishing with
provenance (an `NPM_TOKEN` secret is accepted as a fallback), and creates a
GitHub Release from the matching `.ledger/releases/` record.

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## Product Boundary

Ledger stands on its own. It does not depend on Dossier or any renderer to be
useful. Later, a separate adapter can export Ledger's normalized model into
Dossier or another artifact system.

## License

[MIT](./LICENSE)
