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

Configured paths are confined to the discovered project root. Ledger rejects
absolute paths, parent traversal, and existing symlink chains that escape the
project before reading source or writing generated output. Source discovery is
also bounded by configured document-count, byte-size, aggregate-size, and
directory-depth limits.

### Catalog Cache

Every read of the source records goes through `readLedgerCatalog` in
`src/catalogCache.ts`. It stats each Markdown file and serves unchanged files
from a derived cache under `.ledger/cache/` instead of parsing them again. A
file is unchanged when its size and mtime match the cached record; a file whose
stat changed but whose SHA-256 content hash still matches is refreshed without
parsing. Files modified within two seconds of the last cache write are always
re-hashed to defeat mtime granularity races. Removed files drop out of the
cache on the next read.

Two backends implement one interface. The JSON backend writes
`catalog.json` atomically (temp file plus rename) and needs nothing beyond
Node 22. The sqlite backend stores one row per record in `catalog.sqlite`
through `node:sqlite` and is selected automatically on Node 24.15 or newer,
where the module is a release candidate and no longer warns on import. It also
keeps an FTS5 table of each record's text, updated in the same transaction as
the record rows, which `ledger search --full-text` uses to narrow candidates
before the shared scorer ranks them. Default search always scans every record,
so results never depend on which backend a Node version selects.
`cache.backend` in `.ledger/config.yaml` accepts `auto`, `json`, `sqlite`,
or `none`. The cache header carries a format version and a fingerprint of the
source directories and limits, so a config change or a format bump makes the
cache rebuild instead of serving stale records. The cache is disposable: it is
never read as source, it is written outside the transaction journal because
it is not a source mutation, and `ledger cache clear` removes it.

`ledger cache status`, `ledger cache warm`, and `ledger doctor` report the
backend, entry count, size, and freshness. `ledger metrics` times a cold read
that bypasses the cache and a warm read that uses it.

### Config

Config lives at `.ledger/config.yaml`.

The config chooses:

- document directories
- id formatting
- required sections
- required metadata
- git coverage rules
- generated output paths
- catalog cache backend and location
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

File-oriented retrieval shares one contract. `retrieveByPath` in
`src/retrieval.ts` matches a target against every record's file references
with one matcher (exact path, then coverage patterns such as `src/features/**`
or `prefix:`, then a directory suffix), and returns for each match the record
metadata, the matched references and how they matched, the `On conflict` rules
from the relevant `## Changed Files` blocks, invariants, verification, and the
records that supersede it. It then resolves one relationship hop (decisions,
backlog items, related records, supersession in both directions) into a
`related` list and reports references that do not resolve as `missing`.
`explain`, `conflict`, `packet`, the MCP tools, and the library all project
from that result, so a record found by one surface is found by every surface.
Conflict guidance is the projection used for merge resolution; agent packets add
budgeting on top and carry the related records so an agent can jump from a file
to the decision that shaped it. The relationship graph emits `supersedes` edges
from the same data.

### Git Inspector

The Git inspector is optional but high-value.

It should support:

- changed file detection
- staged diff summaries
- explicit merge-base ranges for clean pull-request checkouts
- commit metadata
- pull request metadata where available
- `--from-diff` entry drafting
- coverage checks that decide whether a Ledger entry is required

Coverage is path based: files matching `git.requireEntryFor` must be
referenced by a Ledger entry unless they match `git.ignore`. Since 0.7 the
reference must also be current: under `git.coverage: current` the entry that
lists a changed path must itself be part of the same change set (added or
modified in the working tree, staged diff, or revision range), so a pull
request cannot satisfy coverage with a record written for an earlier change.
Paths listed only by older records are reported as `historical`. `git.coverage:
any`, which `adopt` writes, also accepts an older change entry, but only one
that names the path: patterns from older entries do not count, so a broad
pattern in one old receipt cannot exempt a directory from every later change.
Only change entries count in either mode.

Working-tree inspection, staged inspection, and committed range inspection are
separate modes. Range-aware commands require both a base and head revision and
use Git's merge-base diff. Git command failures are typed operational errors;
they never collapse into an apparently clean change set.

Drafting from Git diffs stays conservative. Ledger can infer areas from changed
paths, extract Markdown headings and parser-backed TypeScript or JavaScript
top-level anchors, and add docs-impact prompts. `typescript` is an optional
peer dependency: when it is installed the parser runs, otherwise a regex
extractor runs and the draft says so (`ledger new` prints the extractor
counts and the fallback reason, and `ledger doctor` has a `symbols` check).
`resolveTypeScriptModule` accepts a module only when it has the compiler calls
Ledger makes. It reads TypeScript 5.0 to 5.4 through their default export.
TypeScript 7.0 ships no JavaScript API, so Ledger treats it as unavailable
unless `@typescript/typescript6`, the official side-by-side package, is also
installed; that package is tried next.
Callers that need parser quality pass `parser: "typescript"` and get an error
instead of silent regex output. Each extractor also reports where every
symbol sits (`LedgerSymbolSpan`): a heading's section up to the next heading
of the same or a higher level, with fenced code skipped; a parsed top-level
declaration from its doc comment to its end; or, for the regex fallback, a
declaration up to the next one. A draft reads the changed lines from
`git diff --unified=0` (`getChangedLineRanges` in `src/git.ts`) and keeps a
file's symbols only where a changed line falls in a span. A line inside a
subsection counts only for the innermost heading (`symbolsTouchedByLines`),
and an edit outside every symbol leaves the anchor as a TODO. Added and
untracked files, and every file when Git cannot report lines, keep all their
symbols up to the per-file cap. Generated prose remains marked as TODO so
agents must still verify and finish the entry before landing it.

### CI Summary

`ledger ci` composes validation, docs audit, coverage, and docs impact into one
result. It does not replace the individual commands; it packages their current
state for CI, local preflight checks, and agent automation. Human output lists
each check and then each failing file (`formatCiText`), and JSON output
preserves the nested results for tools. Hooks draft a session's receipt only
when a turn ends, so a run earlier in the turn finds the turn's files
uncovered. `sessionDraftHints` in `src/sessions.ts` matches failing files to
active sessions that have a host and names each session and its linked draft,
so the agent finishes that draft rather than writing a second receipt.
`ci`, `coverage`, and `docs impact` return these hints as `sessions` and print
them, and GitHub output leaves them out. In clean PR checkouts,
`--base <revision> --head <revision>` supplies the committed range to coverage
and docs impact. `--github` adds GitHub Actions output: one workflow-command
annotation per failing signal with the file path, and a Markdown job summary
appended to `GITHUB_STEP_SUMMARY`; the text report then lists only the checks.
The repository's `action.yml` is a composite action that wraps the command for
pull requests.
With `comment: "true"` it keeps the summary in one pull request comment,
found by a hidden `<!-- ledger-ci-summary -->` marker on a
`github-actions[bot]` comment and updated in place; pull requests from forks,
whose token is read-only, get a notice, and a failed API call is a warning,
never a failed step. This repository's own CI runs it
with `command: node dist/cli.js` so the action is exercised on every pull
request.

### Integrity

`ledger verify-integrity` hashes each source Markdown record with SHA-256 and
combines those hashes into a deterministic catalog hash. It writes a JSON index
for tooling and a Markdown report for review. This is not signing or tamper
proofing by itself; it gives releases, agents, and CI a stable provenance
artifact to compare over time.

`ledger verify-integrity --check` reads the existing JSON artifact as the
expected baseline, builds the current catalog in memory, and exits nonzero when
records were added, removed, or changed. Check mode does not overwrite the
baseline. Integrity JSON is size bounded and schema validated before use.

### Render Profiles

The static reader has separate internal and public profiles. Internal output
remains under `.ledger/dist/`. Public output is isolated under
`.ledger/dist/public/` and includes only released release records plus their
explicit `Public Notes` bullets. Public model construction clears raw Markdown,
repository paths, files, symbols, relationships, validation issues, invariants,
verification details, and extension fields before HTML or JSON generation.

The public profile is an export-safety boundary, not an authentication system.
Publishing still requires review of the public notes themselves.

### Release Workflow

Release generation can either render records already assigned to a version or
select currently unreleased landed work. With `--assign`, Ledger writes the
selected release version back to the selected change entries before writing the
release record. This keeps the release document and source entries in sync while
still making metadata mutation explicit. Assignment and release-document
creation share one journaled transaction. Ledger preflights the destination,
verifies every planned entry's source hash, stages all output, and retains
rollback copies until the complete release mutation commits.

### File Transactions

Source-mutating workflows use the shared transaction layer for recoverable,
optimistic writes:

- new change and product-note creation
- release assignment and release-document creation
- changelog migration plus docs reference rewrites
- docs routing reconciliation
- validation baseline updates
- generated indexes, reports, integrity artifacts, and reader bundles

Transactions write a bounded journal under `.ledger/transactions/` and hold
`.ledger/write.lock`. Interrupted applying transactions are rolled back before
the next mutation. `ledger doctor` reports active locks and fails when pending
transaction journals require recovery. Journals contain paths, hashes, and file
modes, but never source contents or secret values.

### MCP Server

`ledger mcp` starts a local stdio Model Context Protocol server, built on the
v2 TypeScript SDK (`@modelcontextprotocol/server`). It speaks protocol
revision 2026-07-28 and the 2025 revisions from the same definitions:
`serveStdio` lets the client's opening message pick the revision for the
connection, and the engine's `/mcp` uses `createMcpHandler`, which serves
2026-07-28 per request and 2025-era requests statelessly.

The server registers every operation in the registry that carries `mcp`
metadata. The read tools are validate, ready, query, search, explain,
conflict, packet, search-packet, coverage, ci, doctor, metrics, stale,
unreleased, release notes, cache status, docs audit, docs classify, docs
impact, and integrity verification. Some of them write generated reports, as
their CLI commands do. Each tool takes the operation's input plus an optional
`projectRoot`, declares an output schema, and returns the versioned machine
envelope both as JSON text and as `structuredContent`. Payloads include a
top-level `summary` object with counts, status, and budget metadata before
full detailed fields so agents can inspect compact signals first. Tools that
do not mutate are annotated read-only. The MCP layer contains no command
logic; behavior lives in the operation definitions the CLI uses.

Tools that write source records ask the user first. An operation opts in with
`mcp.confirm`, a function that turns the input into the sentence the user
sees. Eight do: new, feedback, backlog new, decision new, promote, and session
start, note, and close. The first call returns an `input_required` result
holding a form elicitation with one required `confirm` checkbox. The message
names the action, the project, and its root. Only a retry that carries an
accepted response with `confirm: true` runs the operation. A decline, a
cancel, or an unchecked box returns `confirmation-declined`, and nothing is
written.

- **Sealed state.** The retry must echo a `requestState` that the SDK's
  HMAC codec sealed with a per-process random key, valid for ten minutes. It
  holds the tool name and a SHA-256 fingerprint of the arguments with keys
  sorted, so a confirmation cannot be replayed for other arguments.
- **2025-era connections.** The SDK's legacy shim turns the same result into
  a real `elicitation/create` request.
- **Clients that cannot confirm.** A client that declares no form
  elicitation gets `confirmation-unavailable` before anything is asked. On
  the 2026-07-28 revision, the declaration comes from the request's
  envelope; on a 2025-era connection, from `initialize`.
- **Stateless HTTP.** Stateless 2025-era requests have no path for a
  confirmation, so the engine leaves the write tools out of those instances.
- **The engine's project only.** The engine also sets a write root, so a
  `projectRoot` argument cannot aim a write at another project.
- **Direct calls.** `runLedgerMcpTool`, the library's direct entry point,
  never asks, because its caller is the program itself.

On the 2026-07-28 revision, `tools/list`, `prompts/list`, and
`resources/templates/list` carry a one-hour private cache hint, as does the
contract resource, because they change only with the Ledger version. Record
lists and reads keep the SDK's no-cache default. The engine publishes
`resources/list_changed` to open `subscriptions/listen` streams whenever the
watched records change.

The server also exposes resources and prompts. `ledger://records/{id}` lists
every record and reads its raw Markdown; `ledger://packet/{path}` returns a
token-bounded handoff packet for a URL-encoded project path;
`ledger://contract` returns the operations contract as JSON. The
`ledger_agent_instructions` prompt renders the role instructions from
`ledger agents` for the configured project, and `ledger_handoff` wraps the
packet for a path in a message an agent can read before editing. Both
transports, stdio and the engine's `/mcp`, register the same tools,
resources, and prompts.

### Capture Hooks

`src/hooks.ts` turns host lifecycle events into Ledger writes. `ledger hooks
install --host <host>` merges Ledger's entries into the host's project hook
file (`.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`),
replacing earlier Ledger entries and preserving everything else. Each entry
runs `ledger hook <event> --host <host>`, a hidden operation that reads the
host's JSON from stdin, normalizes it to a host-neutral payload (session id,
source, touched paths made project-relative, stop-hook flag), and dispatches:

- `session-start` starts or resumes the session record for the host session
  id and prints the SessionStart context object with a budgeted packet built
  from the session's touched files, or the Git working tree, or recent changes
  and open backlog; after the session line it lists every change entry the
  session links as `Linked receipt: <id> <title> (<path>, <status>)`, with the
  instruction to finish a draft and run `ready` rather than create another
- `user-prompt-submit` (Claude Code and Codex only; Cursor has no prompt hook
  that adds agent context) reads the cached catalog once, finds the active
  session for the host session id, and prints a UserPromptSubmit
  `additionalContext` notice for each linked draft not yet announced:
  `Ledger drafted <path> for this session (<id>). Finish that draft and run
  <command> ready; do not create another receipt with <command> new.`
  Announcements are recorded per session id in the derived, git-ignored
  `<cache.output>/hook-notices.json` through `applyFileTransaction`, read
  tolerantly (missing or invalid means nothing announced), so each draft is
  announced once, on the first prompt after it is created; refreshing a
  draft does not announce it again, and a draft created anew, even under an
  id a deleted draft used, is announced because creating a draft clears its
  id from the store. Ids of sessions that no longer exist are dropped when
  the store is written, and `ledger cache clear` removes the file. The case
  never calls Git and returns `{}` on any failure.
- `post-tool-use` appends touched paths to the session record; for Codex the
  `apply_patch` body may arrive in `tool_input.command`, which is scanned with
  the same patch-header regex
- `stop` and `session-end` draft a change entry from the touched paths and the
  Git diff, link it to the session through `related`, and refresh its file
  list on later stops; `session-end` also closes the session. In
  `draftSessionReceipt` a change entry counts as linked whatever its status
  when the session's `related` names it or its own `related` names the
  session. The hooks pass `fromDiff`, so only touched paths that still differ
  from HEAD are pending, and a change entry that is itself new or modified in
  the working tree covers paths like a linked one, which keeps a receipt
  written with `ledger new` from getting a duplicate draft. Pending paths that
  no covering entry's `files` cover (checked with `coveragePatternMatches`, so
  `src/**` entries count) go to the linked draft when one exists; nothing is
  written when every pending path is covered (the most recent linked entry is
  returned with `created: false`, or nothing without one, so Stop prints `{}`);
  otherwise a new draft is created for the uncovered paths with `related`
  naming the session and the earlier receipts, areas inferred from those
  paths, and a diff-derived file list that leaves out whatever the covering
  receipts list and their own record files. Without Git every touched path
  stays pending. Git reports paths from the repository root, so
  `getChangedFileDetails` rebases them onto the project root, which may be a
  directory inside the repository, and drops paths outside it; a Ledger root
  under `packages/app` sees `src/a.ts`. Cursor's Stop hook has no message
  channel, so a Cursor agent learns about its draft from the next session
  start's `Linked receipt:` lines.
  The draft's title is the session's first Summary line when one was noted,
  else `defaultDraftTitle` (`Changes to <areas>`, naming at most three areas
  and the count of the rest, or `Changes to <first path>`), which `ready`
  reports as a template placeholder until it is edited. A draft lists at most
  eight inferred areas and takes a capped list of symbols, only those on the
  lines the diff changed.
- `pre-compact` records the working tree on the session and writes
  `.ledger/reports/handoff.md`

`findSession` with `activeOnly` skips an active record whose `expires` date is
before today, so a session whose host never sent SessionEnd stops receiving
touches, notes, and drafts; `startSession` or the first `touchSession` then
creates a new record for the host session and copies the `related` list of the
most recent expired record (`findExpiredActiveSession`) so its receipts stay
linked, the `session-end` hook falls back to that record so a late SessionEnd
still closes it, and `session close --id` still reaches it.
`pruneSessions` never deletes such a record once a receipt links it: it uses
`expiredSessions` from `src/stale.ts`, the same split `ledger stale` reports,
and closes a kept record that is still active.

`draftChangeEntry` in `src/newEntry.ts` drops changed files under the
configured `source.sessions` directory and `.ledger/templates/**` before it
derives `files`, `symbols`, `docs`, the Changed Files section, and inferred
areas, so neither a hook draft nor `ledger new --from-diff` lists Ledger's own
scaffold or takes session headings as symbols; other `.ledger/` paths such as
config, entries, and backlog items stay eligible. `inferAreas` uses root-level
file names as areas only when no directory-derived area exists. The shipped
change template holds a single `{{changedFiles}}` placeholder; for adopters
holding the older template copy, `renderLedgerTemplate` replaces the whole
legacy block (the sample heading and its three bare bullets, CRLF tolerant)
with the rendered sections, and a draft made without a diff renders the sample
heading with TODO bullets so `ready` keeps nudging.

`src/skills.ts` renders `.agents/skills/ledger/SKILL.md` from the workspace
config, links it into `.claude/skills/ledger` for Claude Code (copying when
symlinks are unavailable), and maintains the fenced Ledger block that
`ledger agents --write` keeps in `AGENTS.md`; the block text is the same
`agentInstructions` the MCP prompt serves.

Every command span in those surfaces comes from `config.agents.command`:
`renderLedgerSkill`, `agentInstructions` (through `writeAgentsBlock` and the
`agents` operation), `buildSessionStartContext` with its truncation notice,
and the Stop notice in `runHookEvent` all read it, so one config key names
the program an agent should run. `installHostHooks` reads the same key as the
default for `--command`, persists an explicit `--command` through
`renderConfigWithAgentsCommand` (a `yaml` Document rewrite that keeps
comments, quoting, and key order), and can add the `@AGENTS.md` import to
`CLAUDE.md` under `--import-agents`; the hook file, the config, and
`CLAUDE.md` are written in one `applyFileTransaction` with expected hashes,
so a failed write cannot leave the config naming a command the hooks do not
use. A dry run computes everything and writes nothing.

The hook operation is interactive and workspace-optional so it never delegates
to the engine, never appears on the HTTP API, and exits 0 with an empty JSON
object when Ledger is not initialized or an error occurs; hosts must never be
blocked by Ledger.

### Verification Evidence

`src/verify.ts` turns Verification bullets into runnable commands: the first
backticked span is parsed into an optional environment prefix and argv,
rejected when it contains shell operators, and checked against
`verification.allow`. `ledger verify --run` executes allowed commands with
`execFile` from the project root under a timeout and output cap, then writes
`.ledger/reports/evidence.json`, a validated sidecar keyed by entry id with
command results, the HEAD commit, and a dirty-tree flag. `evidenceFreshness`
derives `fresh`, `stale`, `failed`, or `none` from the sidecar and
`verification.maxAgeDays`; `stale` reports `stale-verification`, `doctor` has
a `verification` check, `retrieveByPath` and packets carry
`verificationStatus`, and the reader's Verification panel shows when and at
which commit an entry was last proven. Evidence never changes a record; it is
derived under D001 and `ready` does not require it.

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

The first `ledger render` implementation writes a hostable static reader under
`.ledger/dist/`. It reads source documents directly, validates before rendering,
writes `index.html`, and emits sidecar JSON artifacts for lazy fuzzy search
(`search-index.json`) and relationship traversal (`graph.json`). The HTML
surfaces summaries, invariants, verification checks, agent packet digests, and
Markdown source access for each record.

Artifacts stay under their per-file budgets as a catalog grows. The search
index, graph, and detail sidecars are compact JSON, because only code reads
them. The search index omits each record's `terms` text, which Node and the
browser derive from the weighted fields with `searchTermsFor`. When it still
exceeds `maxSearchIndexBytes`, `shardSearchIndex` fills shards under `search/`
up to that budget, counting each document's exact bytes and separators, and
`search-index.json` becomes a manifest the runtime follows. The internal graph
is split into `graph.json` (records, files, symbols, and relationships) and
`graph/contracts.json` (invariant and verification nodes). The HTML is written
with template indentation removed outside `pre`, `script`, and `style`; when the
page would still exceed `maxHtmlBytes`, each record's detail panel moves into a
JSON chunk under `details/` and the entry row carries `data-detail`, so the
runtime fetches the chunk when the record opens. Opened from a `file:` URL,
where browsers block that fetch, the panel shows the record title, a note to
serve the reader over HTTP, and a link to the Markdown source. Small catalogs
keep inline details and work fully offline. Budgets apply to the largest shard
or chunk, and `maxTotalBytes` counts every file, including source sidecars. Later renderers can consume generated
indexes or emit richer multi-page output without changing the source document
model.

Renderer internals are split by concern: `src/render.ts` owns the static reader
data model, search sidecar, graph sidecar, budgets, and file writes.
`src/renderHtml.ts` owns HTML composition, and `src/renderAssets.ts` owns the
embedded CSS and browser runtime. Keeping model, markup, and browser assets
separate lowers renderer churn and makes future hosted or multi-page readers
easier to transport.

The search sidecar stores weighted fields rather than one undifferentiated text
blob. ID, title, path, symbol, and file hits rank above metadata, summary, and
context hits, and the browser reorders visible cards by score when search data
loads. If a browser blocks sidecar loading from a direct file open, the reader
falls back to inline compact search text. `ledger search` uses the same weighted
search documents from Node, which gives terminal retrieval and browser
retrieval the same ranking behavior.
The weights and scoring functions live once in `src/searchCore.ts`; the
reader runtime embeds them by serializing the functions with
`Function.prototype.toString()` at build time, and a parity test evaluates that
embedded JavaScript against the Node module.

The static reader model includes facets for kinds, statuses, areas, and
releases so the generated page can offer quick navigation without a server.
The reader follows Dossier's visual system (backlog B009). Its values were
copied from Dossier `b48ea15` (`core/internal/render/assets/tokens.css`) and
are never imported (D003): plum-tinted neutrals, one accent (Ledger's emerald
from the mark), status tones, borders instead of shadows, and system font
stacks, so a page makes no font requests. A compact masthead (a kicker, a
title with one italic serif accent word, a lede, and stats) sits above a
full-width search field and select filters. Records read as hairline-divided
list rows with visible dates. From 1100px, a left rail lists facet quick views
under group labels, followed by the relationship graph summary. Selecting a
row opens a slide-out detail
panel over the right edge that surfaces the full record: summary, tags,
source reference, invariants, verification, validation issues, files,
symbols, docs, relationships, and the agent packet digest. Summaries,
invariants, verification bullets, and public release notes render Markdown
code spans as inline code: the text is escaped first and backtick runs pair
as they do in Markdown, so record content never becomes markup, while search
documents keep the plain text. A summary shortened to its excerpt ends before
any code span the cut would split, unless that span is the whole summary. The
agent packet digest at the foot of the panel keeps its backticks, because it
shows the Markdown an agent receives from `ledger packet`. Detail markup ships inside an inert
template per record, the open record is addressable through a record URL
parameter, and the list stays visible and interactive behind the panel so
readers can move between records without losing context.
Panels (the graph summary, invariants, verification, and validation issues)
sit on a paper fill with a 1px line. The search field, selects, and command
trigger use a control line that measures at least 3:1 against the page. Only
the two overlays, the search palette and the record panel, cast a shadow.
Color marks status: teal for landed and released, violet for in-progress
states, coral for blocked and rejected, and neutral for the rest. Kind badges
stay neutral outline chips. The accent marks what is interactive, selected,
or live, and every selected state also carries an accent outline, pip, or
underline, because a tint alone does not reach 3:1. Errors use a Ledger-only
crimson. Decorative leading strokes remain excluded. The reader model orders
documents newest-first, date descending with a numeric-aware identifier
tiebreak, so DOM order, search index order, and the palette's recent-records
list agree on both profiles. The public changelog renders year group
headings as pseudo-element labels on the first entry of each year, so the
filter runtime can reorder rows without displacing separate marker elements. The
stylesheet defines its color system once with CSS `light-dark()` tokens, so
light and dark themes share one declaration, native controls follow the
active `color-scheme`, and the select chevron is painted through a CSS mask
so it tracks the same tokens. The search palette backdrop is a fixed
plum-black scrim, as Dossier's dialog backdrop is, because it reads correctly
over both themes. The reader needs Chrome 123, Firefox 120, or Safari 17.5,
the floor `light-dark()` sets. `:has()` (Firefox 121) only adds the row focus
ring and the active select chevron, and view transitions and
`content-visibility` degrade quietly. A test holds the stylesheet under
40 KB, because every page embeds it. Icons ship as a single SVG symbol sprite
referenced per use. Raw Markdown remains available to library consumers but
is not embedded into the initial HTML payload.

The browser code lives in `src/reader/runtime.ts`, a typed module compiled
against the DOM library, and the stylesheet in `src/reader/styles.css`.
esbuild bundles both into `dist/reader/` (`npm run build:reader`, part of
`build` and run before `test`); `src/renderAssets.ts` reads the bundle and
`renderHtml.ts` inlines it, so the artifact stays a single self-contained
`index.html`. The runtime imports `fuzzyScore` and `scoreSearchFields` from
`src/searchCore.ts`, the same module `ledger search` uses, and a happy-dom
test mounts the rendered HTML, evaluates the bundle, and exercises search,
filters, the record panel, the theme toggle, and the command palette.

Browser behavior remains dependency-free and progressively enhanced. Search is
available inline and through a native dialog opened with `/` or `Cmd/Ctrl+K`.
Search input is debounced, ranked results label the top match and ordinal
ranks, and a polite status region announces result counts, page position, and
active filter counts to assistive technology. Filters are native selects
styled as pills that highlight when active, synchronize with the URL, and
reset pagination on change. Results paginate with a configurable page size
(10 to 100 or all) and windowed page controls, both preserved in the URL.
Year group headings in the public changelog are recomputed after every
filter pass, label the first visible entry of each year on the current page,
and are suppressed while ranked search reorders the feed. The empty state
distinguishes a filtered miss from a genuinely empty library and hides its
reset control when no search or filter is active.
A density toggle switches between comfortable rows with a clamped summary
and tag chips and compact single-line rows, remembered like the theme. The
record panel closes with its button, Escape, or browser back, restores focus
to the originating row, and renders full-screen on small viewports. Masthead
stats act as one-click kind filters. Below 1100px, the filter selects wrap
and the rail stacks below the results as wrapped pills. The theme toggle
cycles Auto, Light, and Dark and shows a visible label. Auto follows the
system preference and stores nothing, and an explicit choice is remembered
and applied before first paint. Supported browsers
animate result changes with the View Transition API, including per-record
morphs for rows near the viewport, guarded by a duplicate-name check and a
skip watchdog. When the browser skips a transition, as it does in a hidden
tab, the update still applies and the rejected `ready` promise is handled, so
nothing is logged. Reduced-motion preferences disable nonessential motion. If a browser blocks the search
sidecar from a direct file open, inline fallback text still supports
multi-word token matching.

The graph sidecar also represents invariants and verification bullets as
first-class nodes attached to their source record. That lets hosted readers and
agents traverse from a record to its behavioral contracts without parsing the
full Markdown body.

`ledger serve` is a local development adapter over the generated static reader.
It renders first, serves `.ledger/dist`, and can watch source record directories
to rebuild while the reader is open. `--profile public` renders and serves the
isolated `.ledger/dist/public/` bundle. Watch rebuilds are debounced,
single-flight, and rerun after changes that arrive during an active rebuild.
Local mode binds only to loopback and validates loopback Host headers to resist
DNS rebinding. Non-loopback binding is an explicit network mode with a required
access token. The server permits only `GET` and `HEAD`, resolves real paths to
prevent symlink escape, bounds header and URI sizes, limits connections and
timeouts, sends restrictive security and no-store headers, and closes idle then
active connections during graceful shutdown.

Render artifacts are measured against configured budgets for HTML bytes, search
index bytes, graph bytes, total generated bytes, and write time. The render
command returns those metrics, and `ledger doctor` fails its `render-budget`
check when a generated artifact is over budget, so reader and token-cost growth
blocks a release instead of becoming normal.

Search-index and graph sidecars have golden-style contract tests. Those tests
pin the deterministic JSON projections used by hosted readers and agent tools,
while leaving the full HTML shell free to evolve.

Core pipeline performance is measured separately from generated artifact size.
`ledger metrics` times source reading, validation, index construction,
static-reader model construction, and weighted search scoring against
`performance.budgets`; `ledger doctor` includes the same result as a
warning-level health signal.

### Engine Server

`ledger serve --api` starts the engine in `src/engine.ts`: one hardened loopback
HTTP server that hosts the static reader, a JSON API, an event stream, and MCP
over Streamable HTTP. The same request guards as `ledger serve` apply: loopback
Host validation in local mode, a required token with `--expose`, bounded
headers and URIs, no-store and security headers.

Routes:

- `GET /api/v1` describes the API and lists the exposed operations.
- `GET /api/v1/health` reports pid, version, uptime, connected clients, the
  last render, and catalog cache statistics.
- `GET /api/v1/operations` returns the operations contract (JSON Schema for
  every input and output) for the exposed operations.
- `POST /api/v1/operations/{name}` runs an operation with a JSON body as its
  input and returns the machine envelope; the `Ledger-Exit-Code` header carries
  the exit code the CLI would have returned. Invalid input is 400, an unknown
  operation is 404, a validation-blocked render is 409, other failures are 500.
- `GET /events` is a server-sent event stream: `ready` on connect, then
  `records-changed` (cache hits, misses, removals), `rebuilt`, and
  `rebuild-failed` as watched source records change, with heartbeats.
- `POST /mcp` is the MCP server over Streamable HTTP: 2026-07-28 requests
  per request with the same tools as `ledger mcp`, and 2025-era requests
  statelessly without the confirmed write tools. GET and DELETE, the 2025
  session operations, answer 405.
- `GET /.well-known/mcp/server-card.json` describes the MCP endpoint, the
  protocol versions it speaks, and its tools, marking the ones that confirm.
- everything else serves the rendered reader.

Operations exposed over the API are those that run inside a workspace and
return: interactive commands (`serve`, `mcp`) and scaffolding commands
(`init`, `adopt`) are excluded. The engine always watches the source
directories; a change re-reads the catalog through the cache, broadcasts, and
re-renders the reader. While it runs it writes `.ledger/daemon.json` (pid,
url, port, profile, version) and removes it on shutdown; that file is ignored
by Git and lets CLI commands find a warm server.

CLI delegation (`src/operations/delegate.ts`) uses that record. Before running
an operation that works inside a workspace and returns, the CLI reads the
record for the project containing the current directory, probes
`/api/v1/health` with a 400 ms timeout, and requires the answering pid and
project root to match. When they do, it posts the validated input to
`/api/v1/operations/{name}`, prints the envelope or the operation's human
format exactly as a local run would, and exits with the code from the
`Ledger-Exit-Code` header. Any probe failure, stale record, or transport error
falls back to running in-process, so a crashed engine never breaks a command.
`--local` on any command, or `LEDGER_NO_DAEMON=1`, skips delegation.
`ledger doctor` reports whether an engine is running or its record is stale.
The daemon record never carries a token; in network mode the CLI sends
`LEDGER_SERVE_TOKEN` from its own environment.

The reader reloads itself when served by the engine. Its runtime opens an
`EventSource` on `/events` whenever the page is served over HTTP, announces
`rebuilt` in the live status region, and reloads 150 ms later so the URL state
(filters, page, open record) survives. A `rebuild-failed` event leaves the last
good render in place with a status message. Under a plain static server the
stream answers 404 and the browser closes the source without retrying; from a
`file:` URL the client is never created.

The registry is exported as `ledgerOperationTable`, an object keyed by
machine name, and `createLedgerClient` derives its `run(name, input)` types
from it, so library callers get compile-time checks at the API boundary in the
spirit of Kore's typed boundaries (decision D007) without a second schema.

### Docs Bridge

Ledger should be able to reference existing project docs without owning them.

Projects can keep durable documentation in `docs/` and let Ledger index the
relationship:

- entries can list docs they changed in `files`
- decisions can link to architecture docs
- backlog items can link to product specs
- routing config can point at an existing `docs/llm/START_HERE.md`, or at
  derived files under `.ledger/` when that file is curated by hand
- validation can warn when a source doc changed without a Ledger entry
- docs impact evidence is per source file: a changed entry that lists the file
  must reference docs or declare docs impact, so one docs touch cannot satisfy
  a whole change set
- docs impact can check whether source changes have an explicit docs touch or a
  changed Ledger entry that references docs

This bridge keeps Ledger from becoming a docs monolith while still making docs
changes traceable.

`ledger docs reconcile` materializes the docs bridge into the routing files
named by `docs.routing` (by default `docs/llm/manifest.json` and
`docs/llm/START_HERE.md`). It replaces only files Ledger generated: a manifest
that parses as a JSON object with `generatedBy: "ledger"`, and a START_HERE
whose leading lines carry the `<!-- ledger:docs:start-here -->` marker or the
legacy sentence "This file is generated by Ledger from the docs audit.". A
missing file is always writable. When either existing file fails that rule the
command writes neither, reports the file, the reason, and what it would have
written, and exits 1; `--force` replaces them anyway. `ledger adopt` and
`ledger init --with-docs` apply the same rule before writing config: when a
curated `docs/llm` routing file exists, `docs.routing` points at
`.ledger/reports/docs-start-here.md` and `.ledger/indexes/docs-routing.json`,
which the default `git.ignore` already excludes from coverage, and no sibling
scaffold is created. On an existing workspace both commands leave
`.ledger/config.yaml` untouched and report the routing it already configures.
`ledger docs migrate` writes cleanup guidance for
scratch, generated, unknown, missing, and unreferenced docs without rewriting
durable prose.

## Command Model

Every command is an operation defined once in `src/operations/`. An operation
declares its machine name, CLI path and flags, a zod input schema, a loose zod
output schema, a workspace requirement, whether it mutates, a handler, a human
formatter, and optional MCP metadata (tool name and a compact summary). The
registry in `src/operations/registry.ts` lists operations in help order.

From that one table Ledger derives:

- CLI argument parsing, flag validation, positional rules, and `--json`
  envelopes (`src/operations/runtime.ts`)
- per-command and general help text
- MCP tool registration with strict input schemas, output schemas, and
  structured content (`src/mcp.ts`)
- a deterministic contract manifest (`buildOperationsContract`) pinned by
  `test/fixtures/operations-contract.json`; update it with
  `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`

`src/cli.ts` only resolves the package version and hands argv to the runtime.
Adding a command means adding one definition file and one registry entry; the
parser, help, MCP surface, and contract test follow automatically.

### `ledger init`

Creates `.ledger/` with:

- config
- README
- templates
- source directories
- generated output directories
- a marked `.gitignore` block for derived state, replaced in place on later runs

`ledger adopt` does the same with docs routing, and first inspects the tracked
tree (`git ls-files`) to infer coverage roots, generated-code ignores, and a
proposed `verification.allow` for the new config, which it writes with
`git.coverage: any`; an existing docs tree is left alone apart from `docs/llm`.

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

Useful flags:

- `--current-only`
- `--update-baseline`
- `--no-baseline`

Exit codes:

- `0`: no errors
- `1`: validation errors
- `2`: operational failure, such as missing config or unreadable files

### `ledger index`

Builds JSON indexes under `.ledger/indexes`.

### `ledger render`

Builds a local static reader under `.ledger/dist/index.html`.

### `ledger serve`

Serves the generated static reader locally. With `--watch`, Ledger watches
source record directories and regenerates the reader after edits. With
`--api`, it starts the engine server described above.

### `ledger ci`

Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.
Use `--base <revision> --head <revision>` in a clean checkout, or `--staged` for
the staged index; the modes cannot be combined. The text report lists each
failing file, and names any active hooked session that touched one, with its
draft receipt.

### `ledger doctor`

Checks workspace health, Git availability, write transaction state, validation,
docs references, index freshness, render output, and stale-knowledge signals. It
is lighter than CI and is meant for local preflight and agent diagnostics.

### `ledger stale`

Finds stale knowledge signals: missing references, missing relationship
targets, superseded relationships, symbols and Changed Files anchors that no
longer exist in the referenced files, invariants that cite them, release
verification gaps, expired sessions, and stale or failed verification
evidence. Anchors are checked per block against the files the block names,
so the message says which file lost the anchor.

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
`.ledger/releases` without overwriting existing release records. `--update`
instead extends an existing record (`extendReleaseRecord` in `src/release.ts`).
The selected entries it does not list join `entries` and `## Changes`, and
`updated` moves to today. Its summary, public notes, verification, and known
issues stay as written, and a missing record is an error. `--write` and
`--update` cannot be combined. `--assign` writes the version into the selected
entries whether or not either of those flags is present, so a preview leaves
it off. When `--assign` is combined with `--write` or `--update`, entry
frontmatter and the release record commit in one recoverable transaction.
Concurrent editor changes invalidate the plan
instead of being overwritten. Rendered release Markdown separates public notes
from internal Ledger entry details.

### `ledger conflict <path...>`

Shows merge-conflict guidance for files.

The first implementation reads source documents directly. A later version can
use generated indexes when conflict rules are promoted into the index model.

### `ledger docs impact`

Reports changed source files, changed docs files, changed Ledger entries, and
docs referenced by those changed entries. With `--check`, it becomes a guard for
source changes that have no visible docs impact. Explicit `docsImpact`
declarations can mark docs as updated, not needed, or unaffected when a reviewed
reason is present. The command does not rewrite documentation; it only surfaces
whether docs were touched, referenced, or intentionally declared unnecessary.
It accepts the same working-tree, staged, or explicit base/head change modes as
coverage and CI.

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

When a command is invoked with `--json`, success and failure use a
schema-versioned envelope containing `schemaVersion`, `ok`, and `command`.
Success data lives under `data`; failures contain a typed error `code`, human
message, and optional safe details. MCP JSON text payloads use the same shape.
This lets agents distinguish workspace discovery, invalid config, concurrent
write, release output, filesystem, and generic failures without scraping stderr
or depending on message wording. Human output remains concise on stderr.

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
