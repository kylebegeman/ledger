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

`staticReaderRuntime` and `staticReaderStyles` are the bundled reader assets
read from `dist/reader/`; run `npm run build:reader` in a source checkout
before importing them. The unstable entrypoint can change between minor
versions while Ledger is pre-1.0. Promote a helper to the package root only when it is useful outside the
repo and has focused tests that describe the expected contract.

## Stable Surface

The package root should stay focused on:

- workspace discovery and initialization
- config parsing and migration
- document reading and normalization
- validation, CI, docs impact, stale checks, and doctor results
- index, integrity, render, search, and graph model generation
- release generation and release notes
- record authoring: change entries, backlog items, decisions, and promotion
- the retrieval contract (`retrieveByPath`, `matchFilePath`, `relatedRecords`)
- agent packets, including file-first and search-first workflows
- command result models for reusable CLI behavior
- MCP server construction, stdio and HTTP serving, and direct tool execution

`serveStaticReader` defaults to local-only exposure. Library callers selecting
`mode: "network"` must provide an access token of at least 24 characters and
should terminate TLS outside the embedded development server. Use
`closeStaticReader` for bounded graceful shutdown. Set `profile: "public"` to
serve the isolated `.ledger/dist/public/` artifact set rather than the internal
reader.

`buildStaticReaderModel` accepts `profile: "internal" | "public"`. The public
profile only includes released release records and strips internal source,
path, relationship, validation, invariant, and verification data. Pair it with
`writeStaticReader` to write the isolated `.ledger/dist/public/` artifact set.

Integrity integrations can use `readIntegrityReport` and
`verifyIntegrityReport` to compare a preserved baseline with a newly built
report. Verification is read-only and returns explicit added, removed, and
changed path lists.

Avoid exporting low-level parser, git, template, runtime asset, and migration
helpers from the root unless they become a deliberate integration point.

## Operation Registry

Every CLI command and MCP tool is an operation from `ledgerOperations`
(`src/operations/registry.ts`). Each definition carries the machine name, CLI
path and flags, zod input and output schemas, the handler, the human formatter,
and optional MCP metadata. `buildOperationsContract()` renders the registry as
a JSON manifest with JSON Schema for every input and output, which is what the
golden test in `test/operations.test.ts` pins and what generated docs read.

Library consumers can run an operation directly through `findOperation(name)`
or `findOperationByTool(tool)`, or embed the whole CLI with `runLedgerCli`
from the unstable entrypoint. New commands are new definitions under
`src/operations/definitions/`; do not add parsing or formatting to `src/cli.ts`.
Reusable result models under `src/commands/` remain the right home for logic
shared by several operations.

## MCP Server

`createLedgerMcpServer(options)` builds one `McpServer` with every tool,
resource, and prompt. `serveLedgerMcpStdio(options)` serves it over stdio (or
a `transport` you pass), and `createLedgerMcpHttpHandler(options)` returns
the web-standard `{ fetch, close, notify, bus }` handler the engine mounts at
`/mcp`; wrap it with `toNodeHandler` from `@modelcontextprotocol/node` for
`node:http`. Both serve MCP 2026-07-28 and the 2025 revisions.

Tools whose operation declares `mcp.confirm` write source records and ask the
user to confirm through a form elicitation first, after `mcp.precheck` has
dry-run the write; `listLedgerMcpTools()`
reports them with `confirms: true`, and the operations contract marks their
`mcp` entry the same way. Such a tool fails with `confirmation-declined` when
the user declines, cancels, or leaves the box unchecked, and with
`confirmation-unavailable` when the client cannot show the form. Pass
`writeRoot` to keep writes in one project, and `writeTools: false` to leave
them out. `runLedgerMcpTool(name, args)` runs any tool directly without
asking; it is for programs, not for relaying a model's calls.

## Record Bodies

`new`, `feedback`, `backlog.new`, `decision.new`, `promote`, and `update` take
`sections`, an object of section bodies keyed by heading, on every surface: the
CLI (`--section Heading=text`, `--sections-file`), the JSON API, and MCP. A
heading must be one the kind's template declares (or, for `update`, one the
record already has); a body may use `###` subsections but no `#` or `##`
heading, even inside a code fence, because Ledger's section parser would split
there. `new` also takes `files`, `docs`, `symbols`, `related`, `decisions`,
`backlog`, and `docsImpact` (`status`, `reason`, optional `docs`), so one call
can write a receipt that passes `ready`. `update` replaces the lists it is
given, rewrites the `# id: title` heading with the title, and keeps the file's
path.

## Typed API Client

`createLedgerClient({ url })` returns a client for a running `ledger serve
--api` engine whose `run(name, input)` is typed from the operation registry:
`name` must be a registered operation and `input` must match that operation's
declared input, so a misspelled operation or a wrongly typed input field does
not typecheck. The engine still rejects what the types let through: an unknown
input key with status 400, and an operation it does not serve, such as `init`
or `adopt`, with status 404. The result carries the machine envelope typed with the operation's
output, the process exit code from the `ledger-exit-code` header, and the HTTP
status. `connectLedgerClient(projectRoot)` reads the workspace's daemon record
and probes the engine, returning undefined when none serves that project; CLI
delegation uses the same client.

```ts
import { connectLedgerClient } from "@kylebegeman/ledger";

const client = await connectLedgerClient(process.cwd());
const result = await client?.run("packet", { path: "src/cli.ts", budgetTokens: 1200 });
if (result?.envelope.ok) console.log(result.envelope.data.entries.length);
```

The client's name union and input types are derived from
`ledgerOperationTable`, the same object that `buildOperationsContract()`
renders, so the golden contract test also pins the client surface. Consumers
outside TypeScript read `GET /api/v1/operations` for the JSON Schemas.

## Machine Result Envelope

CLI `--json` output and MCP JSON text payloads share this top-level contract:

```ts
type LedgerMachineResult<T> =
  | { schemaVersion: 1; ok: true; command: string; data: T }
  | {
      schemaVersion: 1;
      ok: false;
      command: string;
      error: { code: string; message: string; details?: Record<string, unknown> };
    };
```

Use `machineSuccess`, `machineFailure`, and `normalizeLedgerError` when building
integrations that need the same contract. `LedgerError` carries a stable code
and optional safe details. System errors are normalized without copying
arbitrary fields from thrown objects.

## Token Boundaries

Agent-facing APIs should avoid forcing consumers to load the full ledger when a
bounded result is enough. Prefer:

- `retrieveByPath` for everything a file path is related to, including one hop
  of decisions, backlog, and supersession
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
