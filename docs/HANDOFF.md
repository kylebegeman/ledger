# Ledger Handoff

Last updated: 2026-09-16. Written at the end of a long working session so the
next session can resume without rereading history. Update this file whenever a
milestone lands or a plan changes; retire sections that stop being true.

## Where the product stands

- Published: `@kylebegeman/ledger` 0.5.0 on npm, GitHub Release v0.5.0, both
  created by `.github/workflows/release.yml` through npm trusted publishing.
  `@kylebegeman/dossier` 0.6.7 publishes the same way from its own repo.
- `master` is the only long-lived branch. The `next` branch was deleted on
  2026-09-16. Development is short-lived branches, pull requests, CI on
  Ubuntu, macOS, and Windows for Node 22 and 24, rebase-merge.
- The active checkout at `/Users/kyle/Developer/active/ledger` is a Git
  checkout of `master`. Kyle works there directly; do not create clones or
  worktrees for Ledger work.

## What shipped this cycle

| Release | Contents | Receipts |
| --- | --- | --- |
| 0.3.2 | Hygiene: trusted publishing, GitHub Releases from release records, branch model, Homebrew claim removed, Public Notes required, render budget reconciled | 0093, 0094 |
| 0.4.0 | Operation registry generating CLI, help, JSON envelopes, and MCP tools; incremental catalog cache with JSON and sqlite backends; unified retrieval contract with supersession; doctor fails on render budget overruns | 0095 to 0098 |
| 0.5.0 | Engine server (`serve --api`: JSON API, event stream, MCP over Streamable HTTP, server card, daemon record); CLI delegation to the engine; reader live reload; MCP resources and prompts; shared search scoring | 0099 to 0104 |

Read the receipts for invariants and conflict rules before touching those
areas. Decision D005 records the direction and the four supporting choices;
D006 records what was retired; D007 records the runtime decision below.

## Decisions taken in conversation (all recorded)

- Dependency policy: a bundler and a browser test harness may join as dev
  dependencies; the cache uses JSON by default and `node:sqlite` automatically
  on Node 24.15 or newer; `typescript` becomes an optional peer dependency for
  symbol extraction. No native addons.
- Host priority for capture: Claude Code, then Codex CLI, then Cursor.
- Server model: explicit `ledger serve --api` with opportunistic CLI
  delegation; no auto-spawned daemon.
- Version framing: stay on 0.x with no contract freeze; revisit when an outside
  team adopts Ledger.
- Runtime: Ledger stays single-runtime TypeScript. Kore (Go, SQLite or
  Postgres, HTMX; `/Users/kyle/Developer/active/kore`) is not a platform for
  Ledger's server or reader. Reasons and the two real integrations are in D007.
- Visual design: Kyle wants Ledger's reader and generated pages to adopt the
  visual system Dossier now uses, including its light and dark modes. Backlog
  B009 holds the scope and the source files to read.

## Next slices, in order

1. **0.6 capture** (backlog B007): `ledger hooks install --host claude-code|codex|cursor`,
   `ledger skills install`, `ledger agents --write`, authoring commands
   (`backlog new`, `decision new`, `promote`, `scratch`), `ledger ready`, and
   expiring session records. Kore is the intended first adopter; run
   `ledger adopt` there once hooks exist.
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
  (0.5 shipped as one PR with six commits; 0.4 as four PRs). Both were fine.
- Registry changes require regenerating `test/fixtures/operations-contract.json`
  with `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`;
  review the diff as a contract change and mention it in the receipt.
- `npm run ci` is the gate; check its exit status explicitly. In one session a
  grep pipeline hid a typecheck failure and a broken commit reached CI.
- Windows CI lessons: recursive `fs.watch` asserts on 8.3 short paths, so
  watched directories are resolved with `realpathSync.native` and test fixtures
  use `realpath` on temp directories; a cache backend left open locks its file,
  so `readLedgerCatalog` closes backends in `finally`; the full workflow
  end-to-end test carries a 30 second timeout.
- Node 24.15 runners select the sqlite cache backend automatically; local Node
  24.13 uses JSON. Tests must accept either.
- The reader must keep working from a `file:` URL and from any static host;
  live reload only activates over HTTP and closes itself on a 404.

## Open threads and small debts

- Four Dependabot PRs on the Ledger repo (actions and dependency bumps) are
  still open; `actions/checkout` and `actions/setup-node` v7 bumps would also
  silence the Node 20 deprecation warnings in the release workflow.
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
node dist/cli.js version            # 0.5.0
node dist/cli.js doctor             # all checks pass; engine "not running" is normal
node dist/cli.js unreleased         # empty after 0.5.0
node dist/cli.js query --kind backlog --status proposed
gh pr list --repo kylebegeman/ledger
```
