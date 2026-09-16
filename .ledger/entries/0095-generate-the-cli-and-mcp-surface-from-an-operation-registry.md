---
id: "0095"
kind: "change"
title: "Generate the CLI and MCP surface from an operation registry"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "cli"
  - "mcp"
  - "architecture"
files:
  - "src/cli.ts"
  - "src/mcp.ts"
  - "src/index.ts"
  - "src/unstable.ts"
  - "src/operations/**"
  - "test/operations.test.ts"
  - "test/fixtures/operations-contract.json"
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
  - "README.md"
  - ".ledger/backlog/B005-architecture-and-token-efficiency-hardening.md"
symbols:
  - "ledgerOperations"
  - "defineOperation"
  - "runLedgerCli"
  - "buildOperationsContract"
  - "mcpInputSchema"
  - "runLedgerMcpTool"
  - "listLedgerMcpTools"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
docsImpact:
  status: "updated"
  reason: "The architecture command model and MCP sections and the API guide now describe the operation registry as the single source for CLI, help, MCP, and contract tests."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/API.md"
decisions:
  - "D005"
backlog:
  - "B005"
commits: []
related:
  - "0093"
release: "v0.4.0"
---

# 0095: Generate The CLI And MCP Surface From An Operation Registry

## Summary

Replaced the 1,830-line command switch in `src/cli.ts` with an operation
registry. Each of the 31 operations is defined once under
`src/operations/definitions/` with its machine name, CLI path and flags, zod
input schema, loose zod output schema, workspace requirement, mutation flag,
handler, human formatter, and optional MCP metadata. `src/operations/runtime.ts`
derives argument parsing, flag and positional validation, `--json` envelopes,
per-command help, group help, and general help from those definitions.
`src/mcp.ts` registers every operation with MCP metadata as a tool with a strict
input schema, an output schema, read-only annotations, and structured content.
`buildOperationsContract()` renders the registry as a JSON manifest with JSON
Schema for every input and output; `test/fixtures/operations-contract.json`
pins it.

Every command except `serve` and `mcp` now supports `--json`, including
`init`, `adopt`, `new`, `feedback`, `index`, `agents`, and the four `docs`
subcommands that had no envelope. The MCP server grew from 8 tools to 17
(search, coverage, ci, doctor, metrics, stale, unreleased, docs audit, and docs
classify joined the original set). `explain` output gained a `context` array
with invariants and verification per match so agent context no longer depends
on a CLI-only formatter, and `query` gained `--limit` plus `total` and
`limited` fields.

## Why

Decision D005 accepted the local memory engine direction, whose first
prerequisite is one typed operation table that every surface generates from.
The August audit and the September brainstorm both named the same drift: CLI,
MCP, library, and browser behavior lived in parallel registries, the flag
allow-list and help text were hand maintained, twelve commands lacked machine
envelopes, and MCP results were untyped JSON in a text block. The planned local
API (B1) and the MCP transport upgrade (B4) both need the registry, so it lands
first. Backlog B005's last open item, extracting command handlers out of
`src/cli.ts`, is closed by this change.

## Changed Files

### Operation model

- Files: `src/operations/types.ts`, `src/operations/shared.ts`
- Changed: `LedgerOperation` and `defineOperation` describe one operation;
  shared helpers cover loose output schemas, change-range inputs, workspace
  loading, and validation summary lines.
- Anchor: `defineOperation`
- On conflict: Keep the operation shape declarative. Handlers receive validated
  input and a context; they must not parse argv or print.

### Runtime

- File: `src/operations/runtime.ts`
- Changed: `runLedgerCli` resolves the command path (including two-level groups
  such as `docs impact`), parses flags using each operation's flag types,
  validates with the same messages the old parser used, applies defaults and
  `prepare` hooks, validates with zod, resolves the workspace per the
  operation's requirement, runs the handler, and prints either the envelope or
  the formatter output. Help text is generated from the definitions.
- Anchor: `runLedgerCli`
- On conflict: Error messages for unknown options, repeated flags, positive
  integers, positionals, and help topics are contracts pinned by
  `test/cliE2e.test.ts` and `test/cliHelp.test.ts`; keep them byte for byte.

### Definitions

- Files: `src/operations/definitions/records.ts`, `retrieval.ts`,
  `changes.ts`, `health.ts`, `authoring.ts`, `docs.ts`, `agents.ts`,
  `server.ts`, `src/operations/registry.ts`
- Changed: Every former CLI handler moved into a definition. `serve` and `mcp`
  are marked interactive and own their console output. `feedback` keeps the
  `product-note` alias. The registry lists operations in help order and builds
  the contract manifest.
- Anchor: `ledgerOperations`
- On conflict: Adding a command means one definition file plus one registry
  entry. Do not reintroduce a switch in `src/cli.ts`.

### CLI and MCP entrypoints

- Files: `src/cli.ts`, `src/mcp.ts`, `src/index.ts`, `src/unstable.ts`
- Changed: `src/cli.ts` only resolves the package version and calls the
  runtime. `src/mcp.ts` registers tools from the registry with
  `mcpInputSchema`, `mcpOutputShape`, and structured content; `LedgerMcpToolName`
  is now a string alias and `listLedgerMcpTools` enumerates tools. The stable
  entrypoint exports the registry and contract builder; the unstable entrypoint
  exports the runtime and shared helpers.
- Anchor: `createLedgerMcpServer`
- On conflict: MCP payloads keep the `summary` object first and the machine
  envelope shape; `runLedgerMcpTool` must keep returning JSON text for clients
  that ignore structured content.

### Tests and docs

- Files: `test/operations.test.ts`, `test/fixtures/operations-contract.json`,
  `docs/ARCHITECTURE.md`, `docs/API.md`, `README.md`,
  `.ledger/backlog/B005-architecture-and-token-efficiency-hardening.md`
- Changed: The contract test checks unique names and tools, usage lines against
  declared flags, flag-to-schema mapping, strict MCP schemas, the golden
  manifest, new JSON envelopes, group errors, and structured content. Docs
  describe the registry. B005 is marked shipped.
- Anchor: `matches the committed operations contract`
- On conflict: Regenerate the manifest with
  `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and review
  the diff as a contract change.

## Behavior And UX Impact

- All commands other than `serve` and `mcp` accept `--json` and return the
  versioned envelope.
- `ledger render` with validation errors now prints the error message to
  stderr instead of the validation summary line; the exit code stays 1.
- `ledger query` accepts `--limit` and its JSON data includes `total` and
  `limited`; `ledger explain` JSON includes `context`.
- `ledger help docs` and `ledger help migrate` print group usage; `ledger docs`
  alone reports the available subcommands.
- MCP clients see 17 tools with input and output schemas and structured
  content; the original 8 keep their names, inputs, and summary shapes.

## Invariants

- The registry is the only source of CLI commands, help text, and MCP tools.
- Every operation's usage line names every declared flag and nothing else, and
  every flag maps to a field its input schema accepts.
- Machine envelopes keep `schemaVersion: 1`; MCP structured content is the same
  envelope as the JSON text.
- `test/fixtures/operations-contract.json` changes only through a deliberate
  regeneration recorded in a Ledger entry.

## Verification

- `npm run typecheck`
- `npm test` (37 files, 208 tests)
- `npm run build` then a temp-project smoke run of `init --json`, `new`,
  `validate`, `index`, `docs impact --help`, `render --profle` (unknown option
  error), and `explain --agent`
- `npm run ci`

## Notes

Milestone one of the 0.4 foundation. Next: the incremental catalog cache
behind `readLedgerDocuments`, then the unified retrieval contract.
