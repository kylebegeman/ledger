# Ledger Handoff

Last updated: 2026-09-28. Written at the end of a long working session so the
next session can resume without rereading history. Update this file whenever a
milestone lands or a plan changes; retire sections that stop being true.

Kyle paused Ledger on 2026-09-17, after 0.9.2 shipped and Kore moved to it.
The same day, 0.9.3 added the Codex hook launcher, and Kore moved to it too.
Work resumed on 2026-09-19 from Kore's side: triaging its stale report found
two defects in `ledger stale`, and 0.9.4 shipped with the fixes on
2026-09-20. On 2026-09-27 and 28 the reader's web presentation was rebuilt
from the ground up on branch `reader-redesign`, the README was rewritten
around it, and the repository started publishing its own reader and changelog
to GitHub Pages as a live example. "Next slices" lists what is left.

## Where the product stands

- Published: `@kylebegeman/ledger` 0.9.4 on npm and GitHub Release v0.9.4,
  created by `.github/workflows/release.yml` through npm trusted publishing on
  2026-09-20 from kylebegeman/ledger#35. 0.8.0 (#20 and #21), 0.8.1 (#22),
  0.8.2 (#25), 0.9.0 (#26), 0.9.1 (#29), 0.9.2 (#31), and 0.9.3 (#33)
  shipped on 2026-09-17. The GitHub Release notes come from
  `ledger release notes`. A smoke run of the published 0.9.3 package
  installed the Codex launcher in a scratch repository, passed a SessionStart
  payload through it, and passed doctor's hooks check.
  `@kylebegeman/dossier` (0.7.2) publishes the same way from its own repo.
- In review, unreleased: the reader redesign on branch `reader-redesign`.
  It carries receipts 0196 through 0199 and decision D009: the overview, records,
  and timeline views, the reader's own visual system, the rewritten README,
  a second design pass based on Dossier's neutral reader, a binary theme
  switch, and `.github/workflows/pages.yml`, which deploys the live example at
  https://kylebegeman.github.io/ledger/ once the branch merges. The next
  patch release carries it. Receipt 0199 adds a compact-layout revision: recent changes lead an unboxed overview, record rows are
  tighter, and the detail panel reads as a document.
- First outside adopter: Kore runs Ledger 0.9.3 with Claude Code and Codex
  hooks since kylebegeman/forge#33 (Kore receipt 0011). Before that it ran
  0.9.2 from kylebegeman/forge#32, 0.9.1 from #31, 0.9.0 from #30, 0.8.2
  from #29, 0.8.1 from #26, 0.8.0 from #25, and the 0.7.0 adoption from #22
  and #24 (Ledger receipts 0128 and 0130). Its allowlist uses plain
  `ledger <command> **` patterns, so a version bump is the pinned version
  strings the three installers write plus a Kore receipt. Since forge#33 its
  Codex hooks run `.ledger/bin/ledger.mjs`, so a bump rewrites that script
  and leaves `.codex/hooks.json` unchanged. Kyle uses the Codex app there
  and approves changed hooks on the Hooks page of the app's settings;
  `/hooks` is a command only in the Codex CLI. On 2026-09-17 Kore's checkout
  held another task's branch with uncommitted work, so the 0.9.3 bump ran in
  a separate worktree from `origin/main` and left that checkout alone. A
  second live Claude Code session there
  passed B010's last acceptance check on 2026-09-17 (Kore receipt 0005 in
  kylebegeman/forge#27, Ledger receipt 0162), so B007 and B010 are landed.
  That session also found two OCI staging checks that could never fail,
  fixed in kylebegeman/forge#28 (Kore receipt 0006).
- `master` is the only long-lived branch. Development is short-lived branches,
  pull requests, CI on Ubuntu, macOS, and Windows for Node 22 and 24,
  rebase-merge.
- The active checkout at `/Users/kyle/Developer/active/ledger` is on
  `reader-redesign`, based on `master`. Kyle works there directly; do not create clones or
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
| 0.9.1 | MCP on the v2 SDK (D008): `ledger mcp` and `/mcp` speak protocol 2026-07-28 and the 2025 revisions; confirmed MCP tools for new, feedback, backlog new, decision new, promote, and session start, note, and close; list cache hints and change notices on 2026-07-28; a production install of seven packages instead of the SDK's 94; the Codex installer names the app's Hooks page; product notes marked resolved; a 4.5 MB render budget here | 0171 to 0174 |
| 0.9.2 | Complete records and a navigable reader: section bodies from the CLI, API, and MCP, and `ledger update`; `ledger context` for reviewing a change set; `doctor --fix` and a hooks health check; Go, Rust, Python, and Swift symbols from declaration outlines; reader entity views, backlinks, copy actions, palette suggestions, and changed-since-last-visit markers; plain-prose summary excerpts; an Atom feed, release permalinks, page metadata, and `render --site-url` for the public changelog; a generated command reference; scripted README screenshots and a Dossier token check | 0175 to 0186 |
| Unreleased | The reader rebuilt from the ground up (D009): an overview with compact counts, recent changes, an activity chart with a table twin, releases, areas, backlog, health, and graph counts; a timeline grouped by month; sort orders, active filter chips, panel prev and next, a collapsible relationship map, and keyboard shortcuts; a public changelog with year headings and a version index; a neutral design informed by Dossier with independent tokens and a binary Light/Dark switch; an unboxed layout with recent changes first and document-style details; a rewritten README with new screenshots; GitHub Pages publishing this repository's reader and changelog as the live example | 0196, 0197, 0198, 0199 |
| 0.9.3 | Codex approval that survives upgrades: `hooks install --host codex --launcher` makes the hooks run a generated `.ledger/bin/ledger.mjs`, so a new version rewrites only that script and `.codex/hooks.json` stays the same; installs keep the form a file uses; doctor checks the script; the doctor symbols check names the coverage patterns when nothing is covered and the outlined languages beside TypeScript (product note 0187) | 0188 to 0191 |

Read the receipts for invariants and conflict rules before touching those
areas. Decision D005 records the direction and the four supporting choices;
D006 records what was retired; D007 records the runtime decision below.

## Decisions taken in conversation (all recorded)

- Dependency policy: a bundler and a browser test harness may join as dev
  dependencies (esbuild and happy-dom since 0.7.0); the cache uses JSON by
  default and `node:sqlite` automatically on Node 24.15 or newer; `typescript`
  is an optional peer dependency for symbol extraction. No native addons. The
  production dependencies are `yaml`, `zod`, and, since 0.9.1, the MCP
  server SDK (`@modelcontextprotocol/server` and `/node`, which brings
  `@hono/node-server` and `hono`) in place of `@modelcontextprotocol/sdk`.
  Kyle delegated that choice (D008).
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
- Visual design: the reader and the public changelog own their visual
  system (D009, receipts 0196 and 0198), which replaced the Dossier copy of
  0.9.0. After reviewing the first redesign, Kyle asked to use Dossier's new
  neutral reader as a design reference while elevating hierarchy and ergonomics.
  A further review asked for fewer cards and a tighter working archive, using
  Impeccable as a reference. Recent changes now lead the overview, with compact
  counts and a supporting column for context. Rows are compact, evidence is
  stacked without cards, and the relationship map is collapsed below the file
  and relationship lists. The tokens live in `src/reader/styles.css` as
  `light-dark()` pairs; kinds use neutral icons and written labels in the list,
  with semantic color reserved for status and categorical color in the map. There
  are no web fonts, because the reader's content security policy blocks them
  and they would add 80 to 200 KB to every page. Kyle's standing rules: no
  italic words in titles or headers, and never a colored accent line (an edge
  bar) to mark an active or selected item; use a tint, weight, or a full
  focus ring. The Light/Dark switch starts from the operating system and
  follows it until an explicit choice, which persists across visits.
- MCP serves protocol 2026-07-28 and the 2025 revisions from one set of
  definitions, and every MCP tool that writes source records asks the user
  to confirm first, with state sealed to the tool and its arguments (D008,
  receipt 0173). The engine leaves those tools out of stateless 2025-era
  requests and pins writes to its project. `runLedgerMcpTool` stays
  unconfirmed for programs.
- Default `ledger search` scans every record so rankings are identical on
  every cache backend and in the reader; FTS5 narrowing is the explicit
  `--full-text` mode because on this catalog it changed a third of top-three
  results (receipt 0120).
- Session records are committed with the change they describe, and
  `session prune --write` deletes an expired session only when it was not
  promoted and no record links it (receipt 0134).
- The README shows one image per visual, plus one light-scheme overview
  beside the dark captures since the redesign. Terminal cards come from
  `scripts/readme-assets.mjs`, and reader screenshots from
  `scripts/readme-screenshots.mjs` with a `--no-save` Playwright install
  (receipts 0137, 0185, and 0197).
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
  with a `Resolved:` line naming the fixing receipts. All twelve notes are
  resolved (receipts 0164, 0171, and 0190).
- Reader sidecars (the search index and its shards, `graph.json`, and
  `graph/contracts.json`) are compact JSON, and shards fill by exact byte
  count. That fixed a shard overflow instead of raising this repository's
  render budget (receipt 0169).
- Every authoring operation takes section bodies, and `ledger update` edits a
  record in place. Its list flags replace the whole list, so pass every value
  the record keeps (receipt 0176). The confirmed MCP tools check their input
  with a dry run before asking the user.
- `ledger doctor --fix` repairs only derived and runtime state. It never edits
  records or hook files, and it reports a drifted hook instead of
  reinstalling it (receipt 0178).
- Go, Rust, Python, and Swift symbols come from Ledger's own declaration
  outlines, not tree-sitter or a language toolchain, which D007's single
  runtime rules out. Real parsers agreed with them on about 58,000
  declarations in Kyle's projects (receipt 0179).
- Reader entries carry their references inline, and the runtime builds the
  panel's lists, backlinks, and entity views from them. Sidecars cannot load
  from a `file:` URL, and rendering the lists into details doubled the chunks
  (receipt 0180).
- Changed-since-last-visit markers live only in the viewer's browser, a load
  30 minutes after the last starts a new visit, and a first visit marks
  nothing (receipt 0181).
- The public changelog's site URL is a `render --site-url` flag, not a config
  key, and feed ids come from the project and release so a moved site keeps
  them (receipt 0183). GitHub Pages is enabled for this repository with the
  Actions build type since 2026-09-28, and `.github/workflows/pages.yml`
  publishes the internal reader at the site root and the changelog under
  `/changelog/` on every push to `master` (receipt 0197).
- `docs/COMMANDS.md` is generated from the registry, and a test fails when it
  is stale (receipt 0184).
- Codex approves a hook by a hash of its definition, command included. With
  `--launcher`, the Codex hooks run `.ledger/bin/ledger.mjs`, which holds
  `agents.command`, so a version bump rewrites only that script and the
  approval carries over. It is opt-in because the relative path needs Codex
  started at the project root, and it is sticky so upgrades keep it. Kyle
  chose to build it after trusting Kore's hooks by hand again. An unpinned
  npx command, a frozen bootstrap version, a bootstrap package, managed
  hooks, and a shell-specific root lookup were rejected (receipt 0189).

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
  `node dist/cli.js serve --api` to browse details. The reference lists and
  entity views still work from disk. This repository's
  `render.budgets.maxTotalBytes` was raised to 3.5 MB in 0120 and to 4.5 MB
  in 0171, when growth had brought the reader to 3.4 MB even after 0169's
  compact sidecars.
- `ledger ready` gates drafts before they are marked `landed`.

## Next slices, in order

1. **Merge the reader redesign.** Kyle merges [PR #39](https://github.com/kylebegeman/ledger/pull/39)
   from `reader-redesign`; the Pages workflow then deploys the live example. The next patch
   release, 0.9.5, carries receipts 0196 through 0199 with a release record
   written by `ledger release`.
   The resumed local gate passed on 2026-09-28: `npm run ci` exited 0
   with 501 tests, both renders fit their budgets, and receipts 0196 and
   0197 pass `ledger ready`. The receipts stay draft until the merge.
   `npm run readme:check` passed with the intended assets staged, and the
   Pages artifact staging smoke passed under the workflow's Bash settings.
   Retired asset references are acknowledged with `staleRefs`. The Pages
   deploy job also guards manual runs so only `master` can deploy.
   The follow-up design pass adds Dossier-inspired grayscale surfaces, a
   latest-change shortcut, stronger hierarchy, labeled kind icons, roomier
   controls, and all three tabs on phones. Its theme regression tests and
   focused reader/render suite pass (58 tests). The release-grade local gate
   exits 0 with 509 tests across 62 files; both renders remain within budget.
   All seven README captures and the generated terminal cards are refreshed.
   `npm run readme:check` passes with those assets staged, and receipt 0198 is ready.
   Shared-browser checks cover responsive views from 320 to 1440px, both themes,
   filters, empty results, palette search, and the mobile detail panel. The
   preview host's resize operation times out, so checks and full-resolution
   captures use an iframe inside that shared browser.
   Kyle's latest review requested fewer cards and a tighter layout, using
   Impeccable as a reference. Receipt 0199 completes that revision:
   compact counts, recent changes as the main content, an unboxed context
   column, denser records, and document-style details with a collapsed map.
   The latest `npm run ci` exits 0 with 515 tests across 62 files, including
   recent-change navigation, relationship disclosure, and mobile keyboard
   containment. On narrow screens the record panel now inerts the covered
   page, retains keyboard focus, opens `/` search visibly, and restores focus
   on close; desktop remains nonmodal. Shared-browser keyboard checks and
   breakpoint transitions pass. Impeccable's detector reports no findings on
   the reader source, and independent visual review supports the final layout.
   All seven README captures are refreshed and visually inspected; the README
   asset check, Ledger CI, and receipt 0199 readiness pass. PR #39 carries the
   completed milestone; the three-OS CI matrix must pass before Kyle merges.
2. **Tell Kore when 0.9.4 is published, and nothing more.** Kore keeps
   reporting 169 stale signals until its pin moves, because the fix is in the
   tool rather than in its records. Kore's own session owns that bump across
   the five places Kore carries the command, lands it through Kore's pipeline
   with its own receipt, and clears the 14 signals that remain there: six
   capture artifacts in its Anchor lines in its receipts 0016, 0022, 0023,
   0024 and 0031, and eight candidates for real drift in its 0013, 0014, 0026,
   0061 and 0073. Ledger's part is to publish and send the version. The triage
   found no fault in Kore's records, and its feature receipts 0046 to 0060,
   which carried most of the false signals, are sound, so `ledger packet` on
   those paths stays trustworthy.
3. **Trust Kore's hooks once more.** Moving Kore to the launcher changed
   its six Codex hooks one last time, so Kyle trusts them on the Hooks page
   of the Codex app's settings, if that is not done yet. Later bumps leave
   them unchanged. A short live `codex exec` session in Kore would then
   exercise the Codex hooks for the first time; ask Kyle first, because it
   runs on his Codex account.
4. **New features**, when Kyle chooses them. Left out of 0.9.2 on purpose:
   - MCP Tasks, which the 2026-07-28 revision deprecates
   - MCP Apps
   - search shards by kind or year
   - in-place live reload
   - confirmed writes over 2025-era HTTP
   - the VS Code extension and a Kore plugin

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
- Registry changes require regenerating `docs/COMMANDS.md` with
  `LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts`, and
  `test/fixtures/operations-contract.json`
  with `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`;
  review the diff as a contract change and mention it in the receipt.
- `npm run ci` is the gate; check its exit status explicitly. In one session a
  grep pipeline hid a typecheck failure and a broken commit reached CI. It
  needs Node 22.12 or newer for Vitest 5.
- Reader design rules from Kyle (D009): no italic words in titles or
  headers, and never a colored edge line to mark an active, selected, or
  current item. Use a background tint, a heavier weight, or a full focus ring.
  Prefer compact, unboxed sections and ruled rows over repeated cards. Keep
  recent changes primary, supporting context secondary, and kind labels neutral.
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

- `ledger stale` reports one expired, empty closed session, S0007. Review
  `ledger session prune` before removing it. Historical names, including the
  two assets retired by this redesign, are acknowledged with `staleRefs`.
- Dependabot's scheduled run after #25 found every action current but left
  pull requests #4 and #5 open, so the assistant closed them as superseded by
  #25. Dependabot closes a pull request itself only when it refreshes that
  pull request.
- `.claude/launch.json` serves the readers on fixed ports 4173 and 4174,
  which a server left running by another session can hold. The screenshot
  script picks free ports instead.
- The first Pages deployment runs when `reader-redesign` merges. Check the
  Pages workflow run and https://kylebegeman.github.io/ledger/ afterwards;
  the `github-pages` environment lets only `master` deploy.
- Codex and Cursor hooks were verified by piping their payload shapes through
  `ledger hook` in a throwaway workspace, not in live sessions. Kore has Codex
  hooks installed but no live Codex session yet. Cursor's hooks
  have no message channel, so a Cursor agent hears about its draft only at the
  next session start. In the Claude desktop app, `/exit` does not fire
  SessionEnd, so a session record stays active until it expires or
  `ledger session close --id <id>` closes it. Codex skips a changed hook
  until it is trusted again, and the app may not say so. Kore's hooks
  changed one last time in forge#33; later bumps leave them approved. Kore's
  `docs/PLAN.md` names both places to trust them since Kore receipt 0009 and
  describes the launcher since Kore receipt 0011.
- Dossier: Kyle deleted its merged `next` branch on 2026-09-17. Its CI
  already runs Ubuntu with Node 22 and 24, its own docs describe a
  release-branch model that Ledger's model does not replace, and its
  launcher's Node 18 floor is Dossier's call.
- The MCP SDK's v2 line was seven weeks old with no patch release when 0.9.1
  adopted 2.0.0. Take its patch releases when Dependabot proposes them;
  `test/mcpWriteTools.test.ts` and the engine test cover both protocol eras,
  and a stdio smoke run of `node dist/cli.js mcp` through the SDK's own
  client is worth repeating on an SDK update.
- The two dated reports under `docs/scratchpad/` from 2026-08-30 and the
  2026-09-15 brainstorm are history. The brainstorm's Section 13 records the
  answered decisions; Sections 11 and 12 list the verdicts and sequencing that
  became D006 and ROADMAP Phase 11.
- Memory for the assistant lives outside the repo; this file is the
  repository's own record and takes precedence.

## Quick verification of the current state

```sh
node dist/cli.js version            # 0.9.4
node dist/cli.js doctor             # all checks pass; engine and verification may warn
node dist/cli.js unreleased         # receipts landed since the last release
node dist/cli.js coverage --explain # current mode
node dist/cli.js stale              # one expired session, S0007
gh pr list --repo kylebegeman/ledger
```
