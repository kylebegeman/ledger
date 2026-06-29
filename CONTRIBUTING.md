# Contributing

Ledger is a TypeScript CLI and library for repo-native change memory.

## Development

```bash
npm ci
npm run ci
```

`npm run ci` is the release-grade local check. It runs typecheck, tests, build,
Ledger CI, and a package dry run.

## Ledger Entries

Changes to `src/`, `test/`, or `docs/` should include a Ledger entry under
`.ledger/entries/`. The entry should list changed files, why the change was
made, invariants, conflict guidance, and exact verification commands.

Use:

```bash
node dist/cli.js new "Describe the change" --from-diff
node dist/cli.js coverage
```

## Branches

`master` is the stable branch. Active development happens on `next`.

## Pull Requests

Keep pull requests focused. Include the verification commands you ran and note
any generated files that should be ignored.

## Releases

Patch releases are prepared on `next`, promoted to `master`, tagged as
`vX.Y.Z`, and published by the tag-driven release workflow when `NPM_TOKEN` is
available in repository secrets.

Before tagging:

```bash
npm run ci
node dist/cli.js unreleased
```

Release prep should assign landed entries to the target release and generate a
release record with `ledger release <version> --status released --write`.
