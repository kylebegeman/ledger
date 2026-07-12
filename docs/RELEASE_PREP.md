# Release Prep

Use this checklist before publishing Ledger or tagging a release.

## Preconditions

- `package.json` and `package-lock.json` have the intended version.
- The worktree contains only intended source, docs, test, and Ledger receipt
  changes.
- New public behavior has a Ledger receipt under `.ledger/entries/`.
- API changes update `docs/API.md`, README examples, and
  `test/publicApi.test.ts` when the root export surface changes.
- Generated docs routing is current when durable docs were added or removed.

## Local Verification

Run the full package check:

```bash
npm run ci
```

Run release packaging checks:

```bash
npm run release:build
```

For Ledger-specific confidence, also run:

```bash
node dist/cli.js render --json
node dist/cli.js doctor
node dist/cli.js stale --check
node dist/cli.js verify-integrity
```

`ledger doctor` must report a passing `write-state` check. A pending transaction
journal means an interrupted source mutation needs recovery before release work
continues. Release assignment and release-file creation use source-hash
preconditions, so an external edit requires rebuilding the release plan instead
of being overwritten.

If durable docs were added, reconcile routing docs:

```bash
node dist/cli.js docs reconcile
```

Then review `git status --short` and commit any intentional generated routing
or Ledger source changes.

## Package Boundary Review

Before publishing, inspect:

- `package.json` `exports`
- `package.json` `files`
- generated `dist/index.d.ts`
- generated `dist/unstable.d.ts`
- `npm pack --dry-run` output

The root export should contain stable workflows only. Internals should remain
behind `@kylebegeman/ledger/unstable`.

## Publish

Manual npm publish:

```bash
npm login --auth-type=web
npm whoami
npm run release:build
npm publish --access public
```

Tagged GitHub releases can publish through `.github/workflows/release.yml` when
repository secrets and npm trusted publishing are configured.

## After Publish

- Confirm the npm package page shows the expected version.
- Install from a clean temporary directory and run `ledger version`.
- Create or update a release record under `.ledger/releases/` if the release is
  not already represented.
- Keep release notes focused on user-facing behavior, API boundary changes, and
  verification.
