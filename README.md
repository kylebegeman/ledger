<p align="center">
  <a href="https://github.com/mrbagels/ledger">
    <img src="./assets/ledger.svg" alt="Ledger" width="128" height="128">
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
  <a href="https://github.com/mrbagels/ledger/actions/workflows/ci.yml?query=branch%3Amaster">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/mrbagels/ledger/ci.yml?branch=master&style=for-the-badge&label=CI">
  </a>
  <a href="https://github.com/mrbagels/ledger/blob/master/package.json">
    <img alt="Version" src="https://img.shields.io/github/package-json/v/mrbagels/ledger?style=for-the-badge&label=version">
  </a>
  <a href="https://github.com/mrbagels/ledger/blob/master/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/mrbagels/ledger?style=for-the-badge">
  </a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-43853D?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Markdown source" src="https://img.shields.io/badge/source-markdown-111111?style=for-the-badge&logo=markdown&logoColor=white">
</p>

---

Ledger is a small CLI and TypeScript library for keeping implementation
history, backlog, durable decisions, release notes, verification records,
invariants, docs impact, and merge-conflict guidance inside your repository.

The source of truth is plain Markdown under `.ledger/`. Generated indexes,
reports, release notes, and a static reader make those records useful for
automation without making the project dependent on a hosted service.

## At A Glance

| Question | Answer |
| --- | --- |
| What is it? | A structured change memory layer for software repos. |
| Who uses it? | Maintainers, reviewers, coding agents, and fork maintainers. |
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
git clone https://github.com/mrbagels/ledger.git
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
Markdown symbols, likely docs impact, and a per-file conflict checklist.

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
searchable view of entries, decisions, backlog, releases, invariants,
verification checks, and raw Markdown source.

### Published Package Shape

Once published to npm, the intended install flow is:

```bash
npm install --save-dev ledger
npx ledger init --with-docs
npx ledger ci
```

Until then, use the source checkout or a local package link.

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
| `ledger new "Title" --from-diff` | Drafts a change entry from git status. |
| `ledger validate` | Parses and validates Ledger source documents. |
| `ledger index` | Writes JSON indexes under `.ledger/indexes/`. |
| `ledger render` | Builds the static HTML reader. |
| `ledger coverage` | Checks that changed source paths have Ledger coverage. |
| `ledger docs audit` | Finds missing and unreferenced durable docs links. |
| `ledger docs classify <path>` | Classifies docs as durable, routing, scratch, generated, or unknown. |
| `ledger docs impact --check` | Fails when source changes lack docs impact. |
| `ledger explain <path>` | Shows records related to a file. |
| `ledger explain <path> --agent` | Emits compact agent context for a file. |
| `ledger conflict <path> --write-report` | Extracts conflict rules, invariants, and verification, optionally writing `.ledger/reports/conflict.md`. |
| `ledger query --kind change --area cli --symbol run` | Filters records by kind, area, status, release, relationship, symbol, file, doc, or id. |
| `ledger unreleased` | Lists landed or shipped changes not assigned to a release. |
| `ledger release v0.1.1 --status released --write` | Writes a release record. |
| `ledger ci` | Runs validation, docs audit, coverage, and docs impact together. |

Every command has focused help:

```bash
ledger help
ledger help new
ledger docs impact --help
ledger release --help
```

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
ledger conflict path/to/file.ts
```

After editing:

```bash
ledger new "Describe the change" --from-diff
ledger ci
```

The entry should tell the next agent what changed, what must remain true, and
how to verify the behavior.

## Release Workflow

Prepare a release record from entries already assigned to a version:

```bash
ledger release v0.1.1 --status released --date 2026-06-29 --write
```

Or preview currently unreleased work without writing:

```bash
ledger release v0.1.1 --include-unreleased --status planned
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

## Library Usage

The package exports the same core primitives used by the CLI:

```ts
import {
  findWorkspace,
  readLedgerDocuments,
  validateDocuments,
  buildIndexes,
} from "ledger";

const workspace = await findWorkspace(process.cwd());
const documents = await readLedgerDocuments(workspace);
const validation = validateDocuments(workspace, documents);
const indexes = buildIndexes(workspace, documents);
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
npm run check
npm run build
node dist/cli.js ci
npm pack --dry-run
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## Product Boundary

Ledger stands on its own. It does not depend on Dossier or any renderer to be
useful. Later, a separate adapter can export Ledger's normalized model into
Dossier or another artifact system.

## License

[MIT](./LICENSE)
