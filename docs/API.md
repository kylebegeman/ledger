# Ledger API

Ledger is both a CLI and a TypeScript library. The library API should expose
high-level workflows that are useful to agents, custom dashboards, release
tooling, and renderer adapters without making every internal helper part of the
package contract.

## Import Paths

Use the package root for stable workflows:

```ts
import {
  buildAgentPacket,
  buildSearchAgentPacket,
  buildStaticReaderModel,
  readLedgerDocuments,
  searchLedgerIndex,
  validateDocuments,
} from "@kylebegeman/ledger";
```

Use the unstable entrypoint for project-local experiments that intentionally
depend on implementation details:

```ts
import {
  parseMarkdownWithFrontmatter,
  staticReaderRuntime,
} from "@kylebegeman/ledger/unstable";
```

The unstable entrypoint can change between minor versions while Ledger is
pre-1.0. Promote a helper to the package root only when it is useful outside the
repo and has focused tests that describe the expected contract.

## Stable Surface

The package root should stay focused on:

- workspace discovery and initialization
- config parsing and migration
- document reading and normalization
- validation, CI, docs impact, stale checks, and doctor results
- index, integrity, render, search, and graph model generation
- release generation
- agent packets, including file-first and search-first workflows
- command result models for reusable CLI behavior
- MCP server construction and direct tool execution

Avoid exporting low-level parser, git, template, runtime asset, and migration
helpers from the root unless they become a deliberate integration point.

## Command Result Models

New CLI behavior should prefer a reusable command result module under
`src/commands/` when the behavior is also useful to tests, MCP, automation, or
other library consumers. The CLI should parse arguments, call the command model,
and format the result.

Good candidates:

- search, query, metrics, packets, release summaries, and diagnostics
- anything that returns structured data or supports `--json`
- behavior that an MCP tool may need later

Small one-off commands can stay in `src/cli.ts` until reuse is clear.

## Token Boundaries

Agent-facing APIs should avoid forcing consumers to load the full ledger when a
bounded result is enough. Prefer:

- `searchLedgerIndex` over scanning raw Markdown in integrations
- `buildAgentPacket` for known file paths
- `buildSearchAgentPacket` for topic-first context retrieval
- `runLedgerSearchPacketCommand` when CLI-compatible result formatting is useful

Packet APIs should continue to expose approximate token counts, requested
budgets, truncation state, and omitted entry counts.

## Compatibility Rules

Before changing a root export:

1. Update `test/publicApi.test.ts`.
2. Update this document and README examples.
3. Keep a compatibility re-export when practical.
4. Move experimental or low-level behavior to `@kylebegeman/ledger/unstable`.
5. Run `npm run ci` and `npm run release:build`.

For pre-1.0 releases, breaking root API changes are allowed when needed, but
they should be explicit in release notes and tied to a Ledger receipt.
