# Ledger Handoff

Last updated: 2026-09-17. Written at the end of a long working session so the
next session can resume without rereading history. Update this file whenever a
milestone lands or a plan changes; retire sections that stop being true.

## Where the product stands

- Published: `@kylebegeman/ledger` 0.7.0 on npm and GitHub Release v0.7.0,
  both created by `.github/workflows/release.yml` through npm trusted
  publishing on 2026-09-16 from pull request #18. `@kylebegeman/dossier` 0.6.7
  publishes the same way from its own repo.
- Prepared, not published: 0.8.0 on branch `adoption-0.8`, backlog B010's
  adoption and capture fixes plus the README overhaul. Publishing needs the
  pull request merged and the `v0.8.0` tag pushed. The tag push publishes to
  npm, so Kyle pushes it.
- First outside adopter: Kore runs Ledger 0.7.0 with Claude Code and Codex
  hooks, merged in kylebegeman/forge#22 and kylebegeman/forge#24, with this
  repository's records for it in kylebegeman/ledger#19 (receipts 0128 and
  0130). A live Claude Code session there received context on start and left
  a draft receipt on stop, but the agent was never told the draft existed.
  0.8.0 fixes that; a second live session is B010's open acceptance check, and
  B007 is landed.
- `master` is the only long-lived branch. Development is short-lived branches,
  pull requests, CI on Ubuntu, macOS, and Windows for Node 22 and 24,
  rebase-merge.
- The active checkout at `/Users/kyle/Developer/active/ledger` is a Git
  checkout of `master`. Kyle works there directly; do not create clones or
  worktrees for Ledger work.

## What shipped this cycle

| Release | Contents | Receipts |
| --- | --- | --- |
| 0.3.2 | Hygiene: trusted publishing, GitHub Releases from release records, branch model, Homebrew claim removed, Public Notes required, render budget reconciled | 0093, 0094 |
| 0.4.0 | Operation registry generating CLI, help, JSON envelopes, and MCP tools; incremental catalog cache with JSON and sqlite backends; unified retrieval contract with supersession; doctor fails on render budget overruns | 0095 to 0098 |
| 0.5.0 | Engine server (`serve --api`: JSON API, event stream, MCP over Streamable HTTP, server card, daemon record); CLI delegation to the engine; reader live reload; MCP resources and prompts; shared search scoring | 0099 to 0104 |
| 0.6.0 | Capture: `backlog new`, `decision new`, `promote`, `release notes`; the `session` record kind with `scratch`, `session start|touch|note|close|prune`, expiry, and promotion; `ready`; `hooks install` for Claude Code, Codex, and Cursor with the hidden `hook` dispatcher; `skills install`; `agents --write` | 0105 to 0111 |
| 0.7.0 | Trust: current-change coverage (`git.coverage`), per-file docs impact evidence, symbol extractor provenance with `typescript` as an optional peer, `verify --run` with an evidence sidecar, anchor and invariant freshness, `ci --github` and the composite `action.yml`, the typed API client, the typed and bundled reader runtime with happy-dom tests, sharded search, chunked graph and details, `search --full-text` | 0112 to 0124 |
| 0.8.0 (prepared) | Adoption and capture: the `docs reconcile` guard; `agents.command` rendered into hooks, the agents block, the skill, and hook context; a one-time prompt notice for hook drafts and one draft per change; expired active sessions; prune keeps linked sessions and session records are committed; toolchain-aware `adopt` with a marked `.gitignore` block; the README rebuilt around real output and the emerald mark | 0131 to 0137, 0141 |

Read the receipts for invariants and conflict rules before touching those
areas. Decision D005 records the direction and the four supporting choices;
D006 records what was retired; D007 records the runtime decision below.

## Decisions taken in conversation (all recorded)

- Dependency policy: a bundler and a browser test harness may join as dev
  dependencies (esbuild and happy-dom since 0.7.0); the cache uses JSON by
  default and `node:sqlite` automatically on Node 24.15 or newer; `typescript`
  is an optional peer dependency for symbol extraction. No native addons, and
  production dependencies are unchanged.
- Host priority for capture: Claude Code, then Codex CLI, then Cursor. All
  three installers shipped in 0.6.0 because the dispatcher normalizes their
  payloads; only Claude Code has been exercised in a live session.
- Server model: explicit `ledger serve --api` with opportunistic CLI
  delegation; no auto-spawned daemon. Hooks never start the engine.
- Version framing: stay on 0.x with no contract freeze; revisit when an outside
  team adopts Ledger.
- Runtime: Ledger stays single-runtime TypeScript. Kore (Go, SQLite or
  Postgres, HTMX; `/Users/kyle/Developer/active/kore`) is not a platform for
  Ledger's server or reader. Reasons and the two real integrations are in D007.
- Visual design: Kyle wants Ledger's reader and generated pages to adopt the
  visual system Dossier now uses, including its light and dark modes. Backlog
  B009 holds the scope and the source files to read.
- Write operations stay off MCP until the TypeScript SDK supports multi
  round-trip confirmation; read operations such as `ready` and
  `release notes` are exposed.
- Default `ledger search` scans every record so rankings are identical on
  every cache backend and in the reader; FTS5 narrowing is the explicit
  `--full-text` mode because on this catalog it changed a third of top-three
  results (receipt 0120).
- Session records are committed with the change they describe, and
  `session prune --write` deletes an expired session only when it was not
  promoted and no record links it (receipt 0134).
- The README shows one image per visual with no light and dark variants.
  Terminal cards come from `scripts/readme-assets.mjs`; reader screenshots are
  captured by hand with the settings in `CONTRIBUTING.md` (receipt 0137).
- The mark is an emerald ruled L with no background shape, and the reader's
  accent follows it (receipt 0137). B009 should keep both unless Kyle decides
  otherwise.

## How capture and trust work in this repository

- `.claude/settings.json` carries six Claude Code hooks that run
  `node dist/cli.js`, saved as `agents.command` in `.ledger/config.yaml`,
  because `/opt/homebrew/bin/ledger` on Kyle's machine is the unrelated
  ledger-cli accounting tool. Every Claude Code session here creates or
  resumes a session record under `.ledger/sessions/`, receives the records for
  the paths in play and a `Linked receipt:` line per linked receipt on start,
  records Write and Edit tool paths, drafts a change entry on the first stop
  after an edit, names that draft once on the next prompt, and writes
  `.ledger/reports/handoff.md` before compaction. A stale `dist/` breaks the
  hooks, so build first. Codex hooks are not installed here.
- Finish the hook's draft rather than deleting it: give it a real title and
  write the receipt into it. A linked receipt of any status covers its paths,
  so later stops do not draft again for them (receipt 0133). Session records
  are committed with the change.
- `.agents/skills/ledger/SKILL.md` is the shipped skill; `.claude/skills/ledger`
  is a relative symlink to it. `AGENTS.md` ends with the managed block. Both
  render `agents.command`.
- Coverage is `current`: a pull request must carry a receipt that lists the
  changed required paths, and each changed source file needs docs impact
  evidence from that receipt.
- `ledger verify <id> --run` records evidence in `.ledger/reports/evidence.json`
  (committed). Never put `verify --run` itself in a Verification section; a
  nested run is refused.
- The reader in `.ledger/dist/` now chunks record details because the page
  passed 1 MB; opened from disk it shows a fallback panel, so use
  `node dist/cli.js serve --api` to browse details. This repository's
  `render.budgets.maxTotalBytes` was raised to 3.5 MB in 0120.
- `ledger ready` gates drafts before they are marked `landed`.

## Next slices, in order

1. **Publish 0.8.0**: merge the `adoption-0.8` pull request once its CI
   matrix is green, then Kyle tags the merged `master` with
   `git tag v0.8.0 && git push origin v0.8.0`. The release workflow publishes
   to npm and creates the GitHub Release from `.ledger/releases/v0.8.0.md`.
2. **Finish B010 in Kore**: bump the pin by running the 0.8.0 package's
   `hooks install` for `claude-code` and `codex` with
   `--command "npx --yes @kylebegeman/ledger@0.8.0"`, then `agents --write` and
   `skills install`; add the pinned Ledger checks to `verification.allow` by
   hand (0140); remove the hand-written Ledger note from Kore's `AGENTS.md`
   that the managed block replaces; re-approve the Codex hooks with `/hooks`.
   Then run a second live Claude Code session with an ordinary task and check
   that it finishes its hook draft to `ledger ready` without being told and
   without a second receipt. In the Claude desktop app, `/exit` does not fire
   SessionEnd; 0.8.0 treats the expired session as inactive, and
   `ledger session close --id <id>` still closes it explicitly. Close B010
   when both checks pass.
3. **Product notes from the README fact-check**: decide whether
   `coverage: any` should relax docs impact in `ledger ci` (0138); update the
   action's pull request comment in place (0139); match `agents.command` in
   the verification allowlist (0140); render inline code in the reader and
   recapture the README screenshots (0136).
4. **Dossier visual system** (backlog B009): unblocked, because the reader
   stylesheet is a real file at `src/reader/styles.css` and the runtime is
   typed and browser-tested.
5. Deferred until the MCP TypeScript SDK implements the 2026-07-28 protocol:
   multi round-trip confirmation on write tools, the Tasks extension, and list
   caching TTLs. The installed SDK 1.29 speaks 2025-11-25.

## Conventions that were in force

- Milestone per commit, receipt per milestone, one PR per release-sized slice
  (0.5, 0.6, 0.7, and 0.8 as one PR each; 0.4 as four PRs).
- Kyle merges pull requests unless he authorizes merging in the conversation,
  and Kyle pushes release tags because a tag push publishes to npm. Everything
  up to the open PR with a green matrix can be done autonomously.
- README cards are regenerated with `node scripts/readme-assets.mjs` after
  `npm run build`; never edit the SVGs by hand. README copy has no em dashes.
- Registry changes require regenerating `test/fixtures/operations-contract.json`
  with `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`;
  review the diff as a contract change and mention it in the receipt.
- `npm run ci` is the gate; check its exit status explicitly. In one session a
  grep pipeline hid a typecheck failure and a broken commit reached CI.
- The reader runtime and stylesheet live in `src/reader/` and are bundled with
  esbuild into `dist/reader/`; `npm run build` and `npm test` run
  `build:reader` first. Browser tests use a file-level
  `@vitest-environment happy-dom` comment.
- Operation definition input and output interfaces are exported because the
  typed `ledgerOperationTable` needs them for declaration emit.
- A new record kind must be added to `documentKinds`, the default
  `requiredSections`, `normalizeKind`, `normalizeKindFilter`, the retrieval
  kind enum, the cache source table, and the reader filters together, or
  config validation throws (receipt 0107).
- Hook commands must never exit non-zero; hosts treat exit 2 as blocking. The
  `hook` operation is interactive and workspace-optional so it never delegates
  or appears on the HTTP API (receipt 0109).
- Host paths may arrive through an aliased directory (`/tmp` versus
  `/private/tmp` on macOS); compare real paths before dropping a path as
  outside the project.
- Windows CI lessons: recursive `fs.watch` asserts on 8.3 short paths, so
  watched directories are resolved with `realpathSync.native` and test fixtures
  use `realpath` on temp directories; a cache backend left open locks its file,
  so `readLedgerCatalog` closes backends in `finally`; long end-to-end tests
  carry explicit timeouts of 20 to 30 seconds. The skill symlink test skips on
  Windows and the installer falls back to a copied file there.
- Node 24.15 runners select the sqlite cache backend automatically; local Node
  24.13 uses JSON. Tests must accept either.
- The reader must keep working from a `file:` URL and from any static host.
  Details stay inline while the page fits `maxHtmlBytes`; past it they move
  into chunks with a fallback panel. Live reload only activates over HTTP and
  closes itself on a 404.

## Open threads and small debts

- `ledger stale` reports 66 issues in historical records, nearly all stale
  anchors from the 0.4 registry refactor (command functions that left
  `src/cli.ts`). README headings removed by 0137 are acknowledged with
  `staleRefs`. Curate the rest with `staleRefs: ["anchors:<name>"]` or a
  `historical` status.
- Four Dependabot PRs on the Ledger repo (actions and dependency bumps) are
  still open; `actions/checkout` and `actions/setup-node` v7 bumps would also
  silence the Node 20 deprecation warnings in the release workflow. The
  composite action pins `actions/setup-node` too.
- The release workflow still extracts Public Notes with an inline Node script;
  it can call `node dist/cli.js release notes "$GITHUB_REF_NAME"` now.
- `ledger new --from-diff` lists every Markdown heading of a changed file as a
  symbol, not only headings in changed hunks; 0137's draft listed the whole
  README.
- `ledger release --assign` writes the version into entries even without
  `--write`, as its help says, so a preview with `--assign` is not read-only.
- Codex and Cursor hooks were verified by piping their payload shapes through
  `ledger hook` in a throwaway workspace, not in live sessions. Kore has Codex
  hooks installed but no live Codex session yet.
- Dossier still has a `next` branch and Node 18 through 22 CI; Ledger's branch
  model was not applied there.
- The two dated reports under `docs/scratchpad/` from 2026-08-30 and the
  2026-09-15 brainstorm are history. The brainstorm's Section 13 records the
  answered decisions; Sections 11 and 12 list the verdicts and sequencing that
  became D006 and ROADMAP Phase 11.
- Memory for the assistant lives outside the repo; this file is the
  repository's own record and takes precedence.

## Quick verification of the current state

```sh
node dist/cli.js version            # 0.8.0
node dist/cli.js doctor             # all checks pass; engine, symbols, verification may warn
node dist/cli.js unreleased         # receipts landed since v0.8.0
node dist/cli.js coverage --explain # current mode
node dist/cli.js stale              # historical anchor drift listed
gh pr list --repo kylebegeman/ledger
```
