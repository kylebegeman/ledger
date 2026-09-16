# Ledger Handoff

Last updated: 2026-09-16. Written at the end of a long working session so the
next session can resume without rereading history. Update this file whenever a
milestone lands or a plan changes; retire sections that stop being true.

## Where the product stands

- Published: `@kylebegeman/ledger` 0.6.0 on npm, GitHub Release v0.6.0, both
  created by `.github/workflows/release.yml` through npm trusted publishing
  on 2026-09-16 from pull request #16. `@kylebegeman/dossier` 0.6.7 publishes
  the same way from its own repo.
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

Read the receipts for invariants and conflict rules before touching those
areas. Decision D005 records the direction and the four supporting choices;
D006 records what was retired; D007 records the runtime decision below.

## Decisions taken in conversation (all recorded)

- Dependency policy: a bundler and a browser test harness may join as dev
  dependencies; the cache uses JSON by default and `node:sqlite` automatically
  on Node 24.15 or newer; `typescript` becomes an optional peer dependency for
  symbol extraction. No native addons.
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
  round-trip confirmation; `ready` and `release notes` are read tools and are
  exposed.

## How capture works in this repository

- `.claude/settings.json` carries the five Claude Code hooks, installed with
  `--command "node dist/cli.js"` because `/opt/homebrew/bin/ledger` on Kyle's
  machine is the unrelated ledger-cli accounting tool. Every Claude Code
  session here creates or resumes a session record under `.ledger/sessions/`,
  receives a memory packet on start, records Write and Edit tool paths, drafts
  a change entry on the first stop after an edit, and writes
  `.ledger/reports/handoff.md` before compaction.
- `.agents/skills/ledger/SKILL.md` is the shipped skill; `.claude/skills/ledger`
  is a relative symlink to it. `AGENTS.md` ends with the managed block.
- A session record that is not promoted expires after seven days
  (`sessions.expiresInDays`), shows up in `ledger stale` as `expired-session`,
  and is deleted by `ledger session prune --write`. Promote a session with
  `ledger promote S000N` when its draft is worth keeping; otherwise let it
  expire. Hand-written receipts remain the norm for milestone commits; the
  hook draft is a safety net, not a replacement.
- `ledger ready` gates drafts before they are marked `landed`.

## Next slices, in order

1. **Kore adoption** (B007's last acceptance check): in
   `/Users/kyle/Developer/active/kore` run `npx @kylebegeman/ledger adopt`,
   `ledger hooks install --host claude-code --command "npx ledger"` (and
   `--host codex`), `ledger skills install`, and `ledger agents --write`, then
   work one Claude Code session and check that a session record and a draft
   receipt appear. Record friction as `ledger feedback` here.
2. **0.7 trust and TypeScript hardening** (backlog B008): current-change
   coverage provenance, per-file docs impact, `ledger verify --run` with
   evidence sidecars, freshness checks against the code tree, a first-party
   GitHub Action, the typed browser runtime with a bundler and browser tests
   (A4), a typed API client generated from the operations contract, parser
   backed symbols that ship (A5), sharded search and sqlite full-text search
   with chunked artifacts.
3. **Dossier visual system** (backlog B009): can be scheduled inside 0.7's
   reader work or as its own minor release.
4. Deferred until the MCP TypeScript SDK implements the 2026-07-28 protocol:
   multi round-trip confirmation on write tools, the Tasks extension, and list
   caching TTLs. The installed SDK 1.29 speaks 2025-11-25.

## Conventions that were in force

- Milestone per commit, receipt per milestone, one PR per release-sized slice
  (0.5 and 0.6 shipped as one PR each; 0.4 as four PRs). Both were fine.
- The permission classifier in Claude Code's auto mode blocks an agent from
  merging a pull request; Kyle merges and tags. Everything up to the open PR
  with a green matrix can be done autonomously.
- Registry changes require regenerating `test/fixtures/operations-contract.json`
  with `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`;
  review the diff as a contract change and mention it in the receipt.
- `npm run ci` is the gate; check its exit status explicitly. In one session a
  grep pipeline hid a typecheck failure and a broken commit reached CI.
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
  so `readLedgerCatalog` closes backends in `finally`; the full workflow
  end-to-end test carries a 30 second timeout. The skill symlink test skips on
  Windows and the installer falls back to a copied file there.
- Node 24.15 runners select the sqlite cache backend automatically; local Node
  24.13 uses JSON. Tests must accept either.
- The reader must keep working from a `file:` URL and from any static host;
  live reload only activates over HTTP and closes itself on a 404.

## Open threads and small debts

- Four Dependabot PRs on the Ledger repo (actions and dependency bumps) are
  still open; `actions/checkout` and `actions/setup-node` v7 bumps would also
  silence the Node 20 deprecation warnings in the release workflow.
- The release workflow still extracts Public Notes with an inline Node script;
  it can call `node dist/cli.js release notes "$GITHUB_REF_NAME"` now.
- `.ledger/templates/change.md` leaves three empty bullets after the rendered
  Changed Files block because the template's default block replacement only
  swaps the heading line; `ready` flags them as placeholders, which is the
  intended nudge, but the template could be tightened.
- Codex and Cursor hooks were verified by piping their payload shapes through
  `ledger hook` in a throwaway workspace, not in live sessions.
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
node dist/cli.js version            # 0.6.0
node dist/cli.js doctor             # all checks pass; engine "not running" is normal
node dist/cli.js unreleased         # empty after the v0.6.0 record
node dist/cli.js ready              # no draft change entries selected
node dist/cli.js query --kind session
gh pr list --repo kylebegeman/ledger
```
