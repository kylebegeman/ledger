# Contributing

Ledger is a TypeScript CLI and library for repo-native change memory.

## Development

```bash
npm ci
npm run check
npm run build
node dist/cli.js ci
```

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
