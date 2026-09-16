# Ledger agent guide

Ledger is a TypeScript CLI, library, MCP server, and local engine for
repo-native change memory. This file is the durable entry point for agents
working in this repository.

## Resume here

1. Read `docs/HANDOFF.md`. It records where the work stands, what was decided,
   what is next, and the conventions that were in force when it was written.
2. Regenerate the routing docs and check health:

   ```sh
   npm ci && npm run build
   node dist/cli.js docs reconcile
   node dist/cli.js doctor
   node dist/cli.js unreleased
   ```

   `docs/llm/START_HERE.md` is generated and gitignored; reconcile writes it.
3. Read `docs/ROADMAP.md` Phase 11 and the decisions under `.ledger/decisions/`
   (D005 through D007) before planning. Backlog items B007 to B009 hold the
   next slices.

## Working rules

- Work directly in this checkout on a short-lived branch; open a pull request
  into `master`, let the three-OS CI matrix pass, then rebase-merge. One
  milestone per commit, one Ledger receipt per milestone under
  `.ledger/entries/`, created with `node dist/cli.js new "<title>" --from-diff`.
- Every command and MCP tool is an operation under `src/operations/`. Add a
  definition and a registry entry; never add parsing or formatting to
  `src/cli.ts`. After changing any operation, regenerate the contract:
  `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`.
- `npm run ci` is the release-grade local check. Read its exit status directly;
  do not infer success from grep output.
- Markdown under `.ledger/` is the source of truth. Caches, indexes, reports,
  and the reader are derived and disposable.
- Releases: bump `package.json` and `package-lock.json`, run
  `node dist/cli.js release vX.Y.Z --include-unreleased --assign --status released --date <yyyy-mm-dd> --write`,
  rewrite the record's Public Notes for readers, merge, tag `vX.Y.Z` on
  `master`, and let `.github/workflows/release.yml` publish through npm trusted
  publishing and create the GitHub Release.
- Windows CI is file-lock and short-path sensitive: close every cache backend
  on every exit path, watch real paths, and give long end-to-end tests an
  explicit timeout.

## Where things live

- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SCHEMA.md`:
  durable product and technical docs.
- `docs/scratchpad/`: dated explorations; history, not plans.
- `.ledger/`: entries, backlog, decisions, releases, and the dogfood catalog.
