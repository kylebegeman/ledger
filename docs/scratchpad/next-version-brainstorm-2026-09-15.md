# Ledger Next Version Brainstorm

Date: 2026-09-15
Status: Exploration for review, not an implementation commitment
Companion: `next-version-brainstorm-2026-09-15.html` (same content, styled for reading)

This brainstorm starts from scratch. It was built from four inputs gathered on
2026-09-15: a source-level inventory of what `src/` actually does, a cross-check
of every proposal recorded in the roadmap, backlog, product docs, and the two
2026-08-30 scratchpad reports against the code, the live npm and GitHub state of
the package, and a scan of the agent-tooling landscape as it stands this month.
Every prior proposal was re-evaluated against the product goal rather than
carried forward by default. Verdicts are in section 11.

## 1. Where Ledger Actually Stands

The published package and the repository have drifted apart, and nobody outside
this project is using either yet.

| Signal | Value | Source |
| --- | --- | --- |
| Repository `master` | v0.3.1, last product commit 2026-07-15 | GitHub |
| Local checkout | Identical to `master`; not a Git checkout | Local diff |
| npm `latest` | 0.1.12, published 2026-06-30 | registry.npmjs.org |
| Tags never published to npm | v0.1.13, v0.2.0, v0.3.0, v0.3.1 | GitHub tags vs registry |
| GitHub Releases | One (v0.1.13) | GitHub releases |
| `next` branch | 46 commits behind `master`, tip 2026-06-29 | GitHub compare |
| Stars, forks, human issues | 0, 0, 0 (four Dependabot PRs open) | GitHub |
| npm downloads, last week | 3 | api.npmjs.org |
| Landed entries without a release | 0091, 0092 | `.ledger/entries` |
| Product notes ever recorded | 0 of 92 records | `.ledger/entries` |
| npm README | Stale, references the v0.1.1 era | registry readme |
| `engines.node` | `>=20` on npm, `>=22` in repo | package metadata |

Two conclusions follow. First, "the version that is live" is a June snapshot
that lacks most of what the repository documents, so the first move of the next
version is to close that gap. Second, the real consumers today are Kyle and the
coding agents working in Kyle's repositories. The next version should be shaped
by what makes that loop effortless, and by what makes a first outside adopter
succeed in the first two minutes.

## 2. What The Product Is, Restated

Ledger is repo-native implementation memory. Markdown records under `.ledger/`
say what changed, why, which files, symbols, docs, decisions, and backlog items
are involved, what invariants must survive, what verification proved it, and
what to preserve during a merge conflict. Agents are the primary audience.
Everything generated is a derived artifact.

Standing constraints that any plan must respect:

- D001: Markdown is the source of truth; generated outputs are disposable.
- D002: `.ledger/` is the default root.
- D003: no Dossier coupling inside core.
- D004: Ledger may manage a docs lifecycle but is not a docs CMS.
- Roadmap direction: repo-native, useful without a hosted service, renderer
  independent, and never a generic project management suite.

What is strong today:

- A complete record model with validation profiles, baselines, and typed error
  envelopes shared by CLI and MCP.
- Git-aware drafting, coverage, docs impact, and CI range checks that are
  correct in clean pull request checkouts.
- Token-budgeted packets, weighted search, conflict guidance, and eight
  read-only MCP tools.
- Journaled, optimistic, recoverable source mutations.
- A hardened loopback server, a fail-closed public export profile, and integrity
  hashing.
- 36 test files, three-OS CI, supply-chain audit, and install smoke tests.

What is structurally weak today, verified in source:

- `src/cli.ts` is one 1,830-line switch with hand-rolled argument parsing and a
  hand-maintained flag table; only five workflows have extracted command models.
- Every command re-reads and re-parses the whole catalog. There is no cache, no
  incremental indexing, and no content-hash short-circuit anywhere.
- `ledger serve` is static-file only. No API routes, no events, no live reload;
  watch mode rebuilds the entire reader on every change.
- MCP is stdio only, with no resources, no prompts, no output schemas, and no
  structured content. Every result is a JSON string inside a text block.
- `typescript` is a devDependency, so every installed user silently gets regex
  symbol extraction while the README promises parser-backed symbols.
- The 1,573-line browser runtime is never executed by any test, and the search
  scoring code is duplicated between Node and the browser.
- The internal reader measured 2,073,552 bytes against a 2,000,000 byte budget
  in August and the budget was never reconciled.
- Nothing captures a record automatically. Agents must remember to run
  `ledger new`. The feedback command exists but has never been used here.
- `init`, `adopt`, `index`, `serve`, `new`, `feedback`, `agents`, and four
  `docs` subcommands have no `--json` envelope.

## 3. The Landscape In September 2026

The roadmap was written before several things changed.

Model Context Protocol. The 2026-07-28 specification made the core stateless
over Streamable HTTP, removed the session handshake, added required
`Mcp-Method` and `Mcp-Name` headers, replaced server-initiated elicitation with
multi round-trip requests (`input_required`), promoted long-running work to a
Tasks extension, added `ttlMs` caching on list responses, and shipped MCP Apps
as the first official extension. The published roadmap prioritizes local
servers speaking Streamable HTTP, progressive discovery of large tool catalogs,
and standardized tool result handling. Ledger's stdio server predates all of
this. The TypeScript SDK is at 1.30.0 with Streamable HTTP and an experimental
tasks module.

Agent conventions. Agent Skills (`SKILL.md` under `.agents/skills/`) are now
supported by Claude Code, Codex CLI, Cursor, Gemini CLI, and Copilot.
`AGENTS.md` is the accepted place for project instructions. Claude Code exposes
33 lifecycle hook events including `SessionStart`, `PostToolUse`, `Stop`, and
`PreCompact`, with JSON input and exit-code control. Ledger generates none of
these; `ledger agents` prints text to paste.

Competitors. kgai keeps an immutable decision graph that the agent captures
automatically and syncs without merge conflicts. chamnan commits an
architecture index, an impact map, and decision records beside the code.
Cognee and Mem0 sell hosted graph or vector memory over MCP. PROJECTMEM
proposes an event-sourced local memory and judgment layer. Ledger's edge over
all of them is that it validates, gates CI, manages docs impact, groups
releases, guides conflicts, and budgets tokens. Ledger's gap is that none of
its memory is captured automatically, none of it is reachable without a shell,
and none of it carries proof that it is still true.

Runtime. Node 24 ships `node:sqlite` as a release candidate, native `fs.glob`,
and stable worker threads. Ledger already requires Node 22 or newer.

## 4. Thesis For The Next Version

Move Ledger from a CLI that re-reads Markdown to a local memory engine that
agents talk to.

Four pillars carry that thesis, plus one hygiene track that must come first:

- A. Engine: one operation registry, an incremental cache, shared search, and
  parser-backed symbols that actually ship.
- B. Engine server: a loopback process with a versioned JSON API, an event
  stream, live reload, and MCP over Streamable HTTP.
- C. Capture: hooks, skills, and authoring commands so records get written by
  the workflow instead of by memory.
- D. Trust: provenance for the current change, evidence-backed verification,
  freshness against code, and CI annotations.
- E. Reader and publishing: the human surface catches up to the engine.
- F. Hygiene: publish what exists, fix the branch model, and stop advertising
  what does not exist.

## 5. Pillar A: Engine

A1. Operation registry. Define each operation once: name, description, zod
input schema, zod output schema, handler, and human formatter. Derive the CLI
parser and help, the MCP tool list with output schemas, the HTTP routes, the
command reference in docs, and golden contract tests from that single table.
This retires the 1,830-line switch, the manual flag allow-list, and the drift
the August audit called out between CLI, MCP, library, and browser. Zod is
already a dependency and already validates MCP inputs.

A2. Incremental catalog cache. Key each parsed record by content hash and store
the normalized document, its sections, and derived relationships as a derived
artifact under `.ledger/cache/`. On every command, stat the source tree,
re-parse only changed files, and rebuild only dependent indexes. Targets to put
in `ledger metrics`: a warm `explain` under 50 ms at 1,000 records and under
200 ms at 10,000. Two backends are worth prototyping: a single JSON cache file
(no new dependency) and `node:sqlite` (Node 24, no new dependency, but a
runtime floor). The cache is disposable and never read as source, which keeps
D001 intact.

A3. Search v2. One scoring module shared by Node and the browser, bundled into
the reader instead of duplicated. Shard `search-index.json` by kind and year so
the reader loads the shard the query needs. On the sqlite backend, FTS5 gives
ranked search for catalogs that outgrow in-memory scoring.

A4. Typed browser runtime. Move the reader runtime out of template strings into
real TypeScript modules with a build step, and run it in a browser test
harness. The runtime is 12 percent of the codebase and has zero executed test
coverage today.

A5. Symbols that ship. Make `typescript` an optional peer dependency and report
which extractor ran in the draft. Add an extractor registry so Swift, Python,
Go, and Rust get at least heading-quality extraction, and document the fallback
honestly.

A6. Budgets that tell the truth. Lazy-load the raw source sidecars, recompute
the budget, and make `doctor` fail rather than warn when a profile is over.

## 6. Pillar B: The Engine Server

This is the "tiny server with its own API" idea, made concrete.

B1. `ledger serve --api` (or `ledger daemon`). One loopback process that hosts
the static reader, a versioned JSON API at `/api/v1/` generated from the
operation registry (explain, search, packet, query, conflict, docs impact,
validate, doctor, stale, coverage), a server-sent events stream at `/events`
for record changes and rebuild status, and the MCP server at `/mcp` speaking
2026-07-28 Streamable HTTP with a `.well-known` server card. The existing
loopback, token, and header hardening applies unchanged.

B2. CLI delegation. Write `.ledger/daemon.json` with the port and token while
the daemon runs. Any CLI command that finds a live daemon becomes a thin client
against the warm cache instead of re-parsing the catalog. This is the largest
single latency win available and it costs nothing when no daemon is running.

B3. Live reload. The reader subscribes to `/events` and re-renders the changed
records in place. Watch mode becomes incremental by using the same cache as A2.

B4. MCP v2. Add resources (`ledger://entries/0092`, `ledger://packet/<path>`),
prompts derived from `ledger agents` roles, `outputSchema` and
`structuredContent` on every tool, multi round-trip confirmation on any tool
that writes, the Tasks extension for render and migrate, and `ttlMs` on list
responses. Keep stdio for hosts that need it; both transports share the
registry.

B5. Editor and browser integrations become API clients. A VS Code hover or a
browser extension that shows the packet for the file under the cursor is a
small client of B1, not a separate product.

## 7. Pillar C: Capture

The competitive gap is that Ledger's memory depends on someone remembering to
write it. Fix that at the workflow layer.

C1. `ledger hooks install --host claude-code|codex|cursor`. Generate host
hook configuration: `SessionStart` injects a budgeted packet for the areas the
session is likely to touch; `PostToolUse` on edit tools records touched paths
into a session scratch record; `Stop` and `SessionEnd` draft a receipt from the
diff plus the touched-path list; `PreCompact` writes a handoff packet so the
next context window starts with the same memory.

C2. `ledger skills install`. Ship a `SKILL.md` into `.agents/skills/ledger/`
with host symlinks, so any skills-aware agent learns when to call `explain`,
`packet`, `conflict`, and `new` without prompt engineering. `ledger agents
--write` maintains a fenced block in `AGENTS.md` instead of printing text.

C3. Authoring commands. `backlog new`, `decision new`, `promote <id>`,
`scratch <title>`, and `release notes`, all through the transaction layer and
all with `--json` envelopes, so agents can create every record kind.

C4. `ledger ready`. A lifecycle-aware gate that distinguishes a structurally
valid draft from a record that is ready to land: no TODO placeholders,
verification present, docs impact declared, and files that exist.

C5. Session and handoff records. A short-lived record kind that captures what
an agent session touched and learned, with an expiry, so it either gets
promoted into a change entry or expires instead of rotting as scratch.

## 8. Pillar D: Trust And Provenance

D1. Current-change coverage. Coverage today is satisfied by any historical
record that mentions a path. Bind coverage to entries changed in the selected
Git range so a pull request must carry its own receipt.

D2. Per-file docs impact. Replace the single boolean with per-file evidence, so
one docs touch cannot satisfy an entire change set.

D3. Evidence-backed verification. `ledger verify --run` executes the commands
listed in a record's verification section from an allowlist, and writes a
derived sidecar with the command, exit status, duration, and the commit it ran
against. Records gain a "verified at" signal that `doctor`, the reader, and
packets can surface, and that `stale` can age out.

D4. Freshness against code. Extend `stale` to check every referenced file,
symbol, and anchor against the current tree, and to flag invariants whose
anchors no longer exist. This is the "withholds stale knowledge" property
competitors advertise, computed from records Ledger already has.

D5. Unified retrieval contract. One relationship-aware result model shared by
explain, packet, conflict, MCP, and the API, including supersession edges in
the graph and traversal into related decisions and backlog items.

D6. First-party GitHub Action. Package the proven `ci --base --head` logic as
a reusable action with annotations on missing coverage, a job summary, and an
optional pull request comment.

D7. Release records drive GitHub Releases. `release.yml` publishes the release
record's public notes as the GitHub Release body, so the four unpublished tags
never happen again.

## 9. Pillar E: Reader And Publishing

E1. Live reload from B3.
E2. Copy actions on every record: source path, deep link, the exact `packet`
command, and the agent packet itself.
E3. Entity navigation: files, symbols, areas, decisions, and backlog items get
their own views with relationship traversal, backed by sharded data.
E4. Chunked artifacts so large catalogs stay under budget.
E5. Public profile as a publishable changelog: stable permalinks, an Atom
feed, metadata, and a GitHub Pages deploy recipe.
E6. "Since you last looked" view driven by the event stream.
E7. Experiment only: an MCP Apps view that renders a packet inside an MCP host.

## 10. Track F: Hygiene, Done First

- Publish the repository state to npm as 0.3.2 with entries 0091 and 0092
  assigned to a release record.
- Align `engines.node` between npm and repo.
- Generate a GitHub Release for every tag from its release record.
- Delete or reset the `next` branch, and update CONTRIBUTING and README to the
  branch model actually in use.
- Remove the Homebrew install instructions until a tap exists.
- Add `Public Notes` to this repo's required release sections so the public
  profile is validation-enforced.
- Set `render.budgets.maxTotalBytes` to the intended limit or fix the overage.

## 11. Verdict On Every Existing Proposal

Keep as recorded:

- B005 command extraction, absorbed by A1.
- `ledger promote` (PRODUCT.md), absorbed by C3.
- Sharded search indexes (Roadmap Phase 10), absorbed by A3 and E4.
- Richer graph navigation and PR annotations (Roadmap Phase 10), absorbed by
  E3 and D6.
- Reusable GitHub Action (Roadmap Phase 7), now D6.
- Evidence references in entries and releases (Roadmap Phase 9), now D3.

Merge into a pillar with a changed shape:

- Brainstorm "unified change-set context and review workbench" becomes a
  `context` operation and API route, not a UI product.
- Brainstorm "canonical operation registry and portable contract kit" is A1
  and is now the foundation everything else derives from.
- Brainstorm "safe write-capable agent and editor lifecycle" is B4 plus C3,
  gated by multi round-trip confirmation rather than a bespoke revision token.
- Brainstorm "live preview feedback loop" is B3.
- Brainstorm "typed progressive MCP" is B4.
- Brainstorm "self-healing maintenance" becomes `doctor --fix` on top of the
  A2 cache, where fixes are cheap.
- Audit findings A, B, E, F become D1, D2, D5.
- Roadmap "optional Git merge hook helper" becomes part of C1.
- Architecture "search.sqlite" as a later index is recast as the optional A2
  cache backend, never as source.
- VS Code extension prototype becomes an API client under B5.

Drop or defer, with reasons:

- Go and HTMX mini-app adapters: no consumer exists, and the JSON API in B1
  serves any language without shipping adapters.
- Signed records and transparency-log adapters: no users are asking for
  non-repudiation; integrity hashes plus D3 evidence cover the real need.
  Revisit at 1.0 if a team adopter needs it.
- Dossier adapter: out of core by D003; nothing to do until Dossier needs it.
- Repository federation: premature before one repository has outside users.
- `.ledger/routing/` directory: `docs/llm/` already works; keep one convention.
- Separate scratch directory under `.ledger/`: replaced by C5 records with
  expiry, which validate and index like everything else.

## 12. Sequencing Proposal

| Version | Theme | Contents |
| --- | --- | --- |
| 0.3.2 | Hygiene | Track F |
| 0.4 | Foundation | A1 registry, A2 cache, `--json` everywhere, A6 budgets, D5 contract, D7 releases |
| 0.5 | Engine server | B1 API, B2 delegation, B3 live reload, B4 MCP v2, A3 search |
| 0.6 | Capture | C1 hooks, C2 skills, C3 authoring, C4 ready, C5 sessions |
| 0.7 | Trust | D1, D2, D3, D4, D6, A4 browser runtime, A5 symbols |
| 1.0 | Contracts frozen | Registry schemas, API v1, MCP tools, index and sidecar JSON, docs generated from the registry, E3 to E6 |

A1 must land before B1 or B4, because the API and the MCP tool list are
generated from it. A2 must land before B2 and B3, because delegation and
incremental reload depend on the cache. Everything in C is independent of D
and can run in parallel once 0.5 exists.

## 13. Decisions Recorded

Kyle answered the five open questions on 2026-09-15 and asked for the better
engineering option regardless of effort. The answers are recorded in decision
records D005 and D006 and reflected in `docs/ROADMAP.md` Phase 11.

1. Dependency policy. A bundler and a browser test harness are allowed as dev
   dependencies for A4. The cache sits behind a backend interface: JSON by
   default on every supported Node line, `node:sqlite` selected automatically
   when the runtime exposes it, with FTS for large catalogs. No native addons.
   `typescript` becomes an optional peer dependency.
2. Host priority: Claude Code, then Codex CLI, then Cursor.
3. Server model: an explicit `ledger serve --api` that CLI commands use
   opportunistically through `.ledger/daemon.json`. No auto-spawned daemon.
   Deterministic lifecycle, no orphaned processes, and the existing loopback
   hardening applies unchanged; a `SessionStart` hook can start it.
4. Version framing: stay on 0.x with no contract freeze for now.
5. The drops in section 11 are recorded in decision D006, and the roadmap now
   points at this direction as Phase 11.

## 14. Quick Wins Under Half A Day Each

- `--json` envelopes on `new`, `feedback`, `index`, `agents`, and the `docs`
  subcommands.
- Announce degraded fallback search in the reader instead of failing silently.
- Emit supersession edges in `graph.json`.
- Semantic year headings in the public changelog.
- Reconcile the render budget.
- Require `Public Notes` in this repo's release records.
- Align `engines.node` and delete the dead `next` branch.
- Report which symbol extractor ran in `ledger new --from-diff` drafts.

## Evidence Snapshot

- `src/` totals about 13,100 lines across 37 modules; `src/cli.ts` 1,830,
  `src/renderAssets.ts` 1,573, `src/render.ts` 858, `src/fileTransaction.ts`
  709, `src/config.ts` 631.
- 8 MCP tools, stdio only, zod-validated inputs, no output schemas.
- 7 index files, 3 reader sidecars plus a `sources/` tree, one machine envelope
  at schema version 1 with 22 error codes.
- 36 test files, about 257 tests, none executing the browser runtime.
- 52 recorded proposals have no implementing code; 16 are partial.
- 92 records in the dogfood catalog, all of kind `change`.
- npm: 3 published versions, latest 0.1.12, 3 downloads last week.
