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

## README Images

Everything under `assets/readme/` is shown in the README and left out of the
npm package. The terminal cards and the capture loop diagram are generated
from real output: the script builds two throwaway demo repositories with this
checkout's build, runs the hooks and commands the README shows, and renders
what they print.

```bash
npm run build
node scripts/readme-assets.mjs
```

Set `LEDGER_README_VERSION` to change the version in pinned `npx` commands.
Regenerate the cards whenever hook context or command output changes, and
review the diff for trims the cards now mark differently.

The four reader screenshots are captured by hand in a browser at a device
scale factor of 2, dark color scheme, from `node dist/cli.js serve` for this
repository:

| Image | Page | Viewport |
| --- | --- | --- |
| `hero.png` | `/?kind=change&record=0133`, scrolled to the library | 1440 by 900 |
| `palette.png` | `/`, press `/`, type `draft receipt`, crop to the dialog plus 44px | 1440 by 900 |
| `changelog.png` | `serve --profile public`, scrolled to the changelog heading | 1180 by 820 |
| `receipt.png` | record `0001` in the billing demo from `--keep`, Files and Relationships open, cropped to the panel | 1440 by 1600 |

Each screenshot gets rounded corners and a 1px `#2a322d` inner border, with
pixels kept at their captured size.

## Branches

`master` is the only long-lived branch. Work on short-lived branches and open
pull requests against `master`. CI runs the package checks plus the Ledger pull
request range check on every pull request.

## Pull Requests

Keep pull requests focused. Include the verification commands you ran and note
any generated files that should be ignored.

## Releases

Releases are tagged from `master` as `vX.Y.Z` and published by the tag-driven
release workflow through npm trusted publishing; an `NPM_TOKEN` secret is
accepted as a fallback. The workflow also creates a GitHub Release from the
public notes of the matching `.ledger/releases/` record.

Before tagging:

```bash
npm run ci
node dist/cli.js unreleased
```

Release prep should assign landed entries to the target release and generate a
release record with `ledger release <version> --status released --write`.
