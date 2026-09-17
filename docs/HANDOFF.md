# Ledger Handoff

Last updated: 2026-09-17. Written at the end of a long working session so the
next session can resume without rereading history. Update this file whenever a
milestone lands or a plan changes; retire sections that stop being true.

## Where the product stands

- Published: `@kylebegeman/ledger` 0.9.0 on npm and GitHub Release v0.9.0,
  created by `.github/workflows/release.yml` through npm trusted publishing on
  2026-09-17 from kylebegeman/ledger#26. 0.8.0 (#20 and #21), 0.8.1 (#22),
  and 0.8.2 (#25) shipped earlier that day. The GitHub Release notes come
  from `ledger release notes`. `@kylebegeman/dossier` (0.7.2) publishes the
  same way from its own repo.
- First outside adopter: Kore runs Ledger 0.9.0 with Claude Code and Codex
  hooks since kylebegeman/forge#30 (Kore receipt 0008). Before that it ran
  0.8.2 from kylebegeman/forge#29, 0.8.1 from #26, 0.8.0 from #25, and the
  0.7.0 adoption from #22 and #24 (Ledger receipts 0128 and 0130). Its
  allowlist uses plain `ledger <command> **` patterns, so a version bump is
  the 36 pinned version strings the three installers write plus a Kore
  receipt. Codex asks Kyle to approve the changed hooks again with `/hooks`
  after each bump. A second live Claude Code session there passed B010's last
  acceptance check on 2026-09-17 (Kore receipt 0005 in kylebegeman/forge#27,
  Ledger receipt 0162), so B007 and B010 are landed. That session also found
  two OCI staging checks that could never fail, fixed in kylebegeman/forge#28
  (Kore receipt 0006).
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
| 0.8.0 | Adoption and capture: the `docs reconcile` guard; `agents.command` rendered into hooks, the agents block, the skill, and hook context; a one-time prompt notice for hook drafts and one draft per change; expired active sessions; prune keeps linked sessions and session records are committed; toolchain-aware `adopt` with a marked `.gitignore` block; the README rebuilt around real output and the emerald mark; hook drafts that respect receipts written by hand; `verify --run` matching `agents.command`; docs impact under `git.coverage`; one updated pull request comment from the action; inline code in the reader; stale and doctor skip binary files; skipped view transitions no longer log errors | 0131 to 0137, 0141 to 0148 |
| 0.8.1 | Audit of 0.8.0: the write lock waits and hook writes retry so parallel tool calls keep every path; Git paths rebased onto a Ledger root inside a repository; every new draft announced and the notice store pruned; per-entry hook merge; every managed agents block replaced; capped draft titles, areas, and symbols; CRLF-preserving record edits; reader search ranked like the CLI, a palette that works from disk, modified clicks, a linear code-span scanner, and a visible light-theme chip; environment assignments matched by `verification.allow`; only change entries cover a path; reviewed docs impact reasons for every status; `adopt` ignoring vendored and nested build output and proposing only read-only checks; `docs reconcile` refusing unreadable paths; release notes from `ledger release notes`; earlier receipts under `git.coverage: any` counting only for files they name; a pinned README demo clock and a CI check on the cards | 0149 to 0157 |
| 0.8.2 | Drafts that fit the change and upkeep: draft symbols and anchors from the lines a diff changed; `ledger ci` lists failing files and names an active hooked session and its draft; `release --update` for receipts that land after a release record; a TypeScript loader that reads 5.0 to 5.4, skips TypeScript 7 without crashing, and tries `@typescript/typescript6`; historical stale references acknowledged and resolved product notes marked; Vitest 5, Node 22 types, MCP SDK 1.30, v7 action pins, and Dependabot holds on TypeScript and Node type majors; B010 closed | 0158, 0159, 0162 to 0167 |
| 0.9.0 | Dossier's visual system (B009): the reader and the public changelog take Dossier's neutrals, status tones, font stacks, radii, and motion and keep Ledger's emerald accent; a compact masthead, a left facet rail with group labels, and an Auto, Light, and Dark theme toggle with a visible label; contrast and tablet overflow fixes; README cards and screenshots in the same palette; compact JSON sidecars and search shards filled exactly to their budget | 0168 to 0170 |

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
- Visual design: the reader and the public changelog follow Dossier's visual
  system in both themes (B009, receipt 0168). The values are copied from
  Dossier's `core/internal/render/assets/tokens.css`, never imported, and the
  token block in `src/reader/styles.css` names the Dossier commit it came
  from. Kyle left the open choices to the assistant. There are no web fonts,
  because the reader's content security policy blocks them and they would add
  80 to 200 KB to every page. Ledger keeps its emerald accent, because
  Dossier's derived accent fails 4.5:1 on its second paper color. Kind badges
  are neutral, because Dossier colors status and never categories. The theme
  toggle cycles Auto, Light, and Dark.
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
  Visuals are still images; an animation ships only if it can be recorded
  smoothly, never as a few frames swapped about once a second.
- `git.coverage: any` relaxes docs impact as well as coverage: an earlier
  receipt that lists a file with a reviewed docs impact declaration or docs
  references satisfies it, and `ledger ci` judges both checks under one mode.
  Kyle left the choice to the assistant; keeping docs impact strict was
  rejected because it made `any` meaningless in CI (receipt 0144).
- The verification allowlist stays literal. A command written with
  `agents.command` matches its plain `ledger` pattern instead of
  `hooks install` rewriting the allowlist (receipt 0143). The allowlist
  bounds the whole command, environment assignments included, and
  `agents.command` is trusted as far as the allowlist because both live in
  the same reviewed file (receipt 0154).
- Only change entries cover a path, under either coverage mode; session
  records, backlog items, and decisions never do (receipt 0154).
- Under `git.coverage: any`, an earlier receipt covers only the files it
  names; patterns count only from receipts in the change set, so one broad
  adoption receipt never exempts a directory. Kyle delegated the choice;
  dropping `any` and adding a second switch were rejected (receipt 0156).
- The README terminal cards are regenerated on a pinned demo date and CI
  fails when they are stale (`npm run readme:check` on the Ubuntu, Node 24
  job). Kyle delegated the choice; the clock is shifted, not frozen, and
  lives in a script shim rather than in Ledger (receipt 0157).
- Merges by the assistant: Kyle told the assistant to merge and tag on its
  own in the 2026-09-17 session ("Stop waiting on me"), which it did for the
  Ledger pull requests from #20 on, the release tags from `v0.8.0` on, and
  the Kore pull requests from forge#25 on. Kyle then asked for everything left
  to be finished, including B009 and the releases. The auto-mode permission check refused
  the first merge attempt as a merge without review until that instruction.
- The mark is an emerald ruled L with no background shape, and the reader's
  accent follows it (receipts 0137 and 0168).
- Drafts take symbols only from the lines a diff changed; a line inside a
  subsection counts for its innermost heading, and an edit outside every
  symbol leaves a TODO anchor (receipt 0163).
- `ledger ci` keeps failing mid-turn while a hooked session's receipt is
  undrafted or unfinished; the report only names the session and its draft,
  and GitHub output never includes those hints (receipt 0163).
- A receipt that lands after its release record joins it with
  `release --update`; `--write` still refuses an existing record rather than
  merging into it (receipt 0165).
- TypeScript stays on 5.x. TypeScript 7 ships no JavaScript compiler API, so
  Ledger treats it as unavailable unless `@typescript/typescript6` is
  installed beside it, Dependabot skips TypeScript and `@types/node` majors,
  and `@types/node` follows the Node 22 engines floor (receipt 0166).
- A product note whose follow-ups shipped has `status: "resolved"` and ends
  with a `Resolved:` line naming the fixing receipts. All eleven notes are
  resolved (receipts 0164 and 0171).
- Reader sidecars (the search index and its shards, `graph.json`, and
  `graph/contracts.json`) are compact JSON, and shards fill by exact byte
  count. That fixed a shard overflow instead of raising this repository's
  render budget (receipt 0169).

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
  so later stops do not draft again for them (receipt 0133), and so does a
  receipt that is new or modified in the working tree, such as one written
  with `ledger new` (receipt 0142). Session records are committed with the
  change.
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
  `render.budgets.maxTotalBytes` was raised to 3.5 MB in 0120 and to 4.5 MB
  in 0171, when growth had brought the reader to 3.4 MB even after 0169's
  compact sidecars.
- `ledger ready` gates drafts before they are marked `landed`.

## Next slices, in order

1. **MCP protocol 2026-07-28**: the blocker is gone, but the work needs new
   production dependencies, so it waits for Kyle's approval. SDK 1.30.0 still
   speaks 2025-11-25, while the v2 packages (`@modelcontextprotocol/server`,
   `/node` with a `hono` peer, and the rest, stable since 2026-07-28)
   implement 2026-07-28. That spec adds `inputRequired` for multi round-trip
   confirmation, `cacheHints` for list TTLs, and `createMcpHandler` and
   `serveStdio`, and it deprecates the 2025-11-25 Tasks vocabulary. A codemod
   moves imports. Write tools stay off MCP until that confirmation exists.
2. **New features**, when Kyle chooses them. Move Kore's pin after each
   release with the three installers and a Kore receipt.

## Conventions that were in force

- Milestone per commit, receipt per milestone, one PR per release-sized slice
  (0.5, 0.6, 0.7, and 0.8 as one PR each; 0.4 as four PRs).
- Releases after 0.9.0 are patch releases (0.9.1, 0.9.2, and so on), even for
  visible features, unless Kyle asks for a minor or major version. Kyle asked
  for this on 2026-09-17, after 0.9.0 shipped as a minor release.
- Kyle merges pull requests unless he authorizes merging in the conversation,
  and Kyle pushes release tags because a tag push publishes to npm. Everything
  up to the open PR with a green matrix can be done autonomously.
- README cards are regenerated with `node scripts/readme-assets.mjs` after
  `npm run build`; never edit the SVGs by hand, and `npm run readme:check`
  fails when they are stale. README copy has no em dashes.
- Registry changes require regenerating `test/fixtures/operations-contract.json`
  with `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`;
  review the diff as a contract change and mention it in the receipt.
- `npm run ci` is the gate; check its exit status explicitly. In one session a
  grep pipeline hid a typecheck failure and a broken commit reached CI. It
  needs Node 22.12 or newer for Vitest 5.
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
  so `readLedgerCatalog` closes backends in `finally`; `vitest.config.ts`
  gives every test a 30 second timeout on Windows, where runner speed varies
  threefold between runs, and long end-to-end tests also carry explicit
  timeouts of 20 to 30 seconds for the other platforms. The skill symlink test
  skips on Windows and the installer falls back to a copied file there.
- Node 24.15 runners select the sqlite cache backend automatically; local Node
  24.13 uses JSON. Tests must accept either.
- The reader must keep working from a `file:` URL and from any static host.
  Details stay inline while the page fits `maxHtmlBytes`; past it they move
  into chunks with a fallback panel. Live reload only activates over HTTP and
  closes itself on a 404.

## Open threads and small debts

- `ledger stale` reports nothing. Historical names are acknowledged with
  `staleRefs` (receipt 0164), so a new signal is real.
- Dependabot's scheduled run after #25 found every action current but left
  pull requests #4 and #5 open, so the assistant closed them as superseded by
  #25. Dependabot closes a pull request itself only when it refreshes that
  pull request.
- The reader's token block is a copy. When Dossier changes
  `core/internal/render/assets/tokens.css`, diff it against the block in
  `src/reader/styles.css` and port what applies (receipt 0168).
- The reader screenshots have no capture script because Playwright is not a
  dependency; the 0.9.0 captures ran Playwright through an assistant tool with
  the `CONTRIBUTING.md` settings and a small HTML page that adds the corners
  and edge. `.claude/launch.json` serves the readers on
  fixed ports 4173 and 4174, which a server left running by another session
  can hold.
- Codex and Cursor hooks were verified by piping their payload shapes through
  `ledger hook` in a throwaway workspace, not in live sessions. Kore has Codex
  hooks installed and approved but no live Codex session yet. Cursor's hooks
  have no message channel, so a Cursor agent hears about its draft only at the
  next session start. In the Claude desktop app, `/exit` does not fire
  SessionEnd, so a session record stays active until it expires or
  `ledger session close --id <id>` closes it. Kore's Codex hooks changed in
  kylebegeman/forge#29 and #30, so Codex asks Kyle to approve them with
  `/hooks` the next time it opens there.
- Dossier's `next` branch is fully merged, with no commits of its own and no
  references. Deleting it (`git push origin --delete next` in the Dossier
  checkout) was refused by the assistant's permission check and is left for
  Kyle. Dossier's CI already runs Ubuntu with Node 22 and 24. Its own docs
  describe a release-branch model, so Ledger's model is not imposed there.
  Its launcher still declares Node 18 or newer, which is Dossier's call.
- The two dated reports under `docs/scratchpad/` from 2026-08-30 and the
  2026-09-15 brainstorm are history. The brainstorm's Section 13 records the
  answered decisions; Sections 11 and 12 list the verdicts and sequencing that
  became D006 and ROADMAP Phase 11.
- Memory for the assistant lives outside the repo; this file is the
  repository's own record and takes precedence.

## Quick verification of the current state

```sh
node dist/cli.js version            # 0.9.0
node dist/cli.js doctor             # all checks pass; engine and verification may warn
node dist/cli.js unreleased         # receipts landed since the last release
node dist/cli.js coverage --explain # current mode
node dist/cli.js stale              # no stale knowledge signals
gh pr list --repo kylebegeman/ledger
```
