# Contributing

Ledger is a TypeScript CLI and library for repo-native change memory.

## Development

```bash
npm ci
npm run ci
```

`npm run ci` is the release-grade local check. It runs typecheck, tests, build,
Ledger CI, and a package dry run. Development needs Node 22.12 or newer,
which Vitest 5 requires; the published CLI runs on any Node 22.

TypeScript stays on 5.x. TypeScript 7 has no JavaScript compiler API, which
the build and the symbol extractor use, so Dependabot skips its major
update, and it skips major `@types/node` updates so the types match the
oldest supported runtime.

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
The demo's Ledger processes start from the instant in `LEDGER_README_NOW`
(default `2026-09-17T12:00:00Z`) through `scripts/readme-clock.mjs`, so the
session names and dates in the cards are the same on any day. Regenerate the
cards whenever hook context or command output changes, and review the diff
for trims the cards now mark differently. CI runs `npm run readme:check` on
the Ubuntu, Node 24 job, which regenerates the cards and fails when any
differs from the committed file.

The four reader screenshots come from `scripts/readme-screenshots.mjs`.
Playwright is not a dependency, so install it without saving it first:

```bash
npm run build
npm install --no-save playwright
npx playwright install chromium
node scripts/readme-screenshots.mjs
```

Name images to capture only those, for example
`node scripts/readme-screenshots.mjs hero palette`. The script serves this
repository's readers and builds the billing demo with
`node scripts/readme-assets.mjs --demos-only`. It captures each view in a
fresh dark browser context at a device scale factor of 2 with reduced motion:

| Image | Page | Viewport | Corner radius |
| --- | --- | --- | --- |
| `hero.png` | `/?kind=change&record=0133`, scrolled to the library | 1440 by 900 | 18px |
| `palette.png` | `/`, press `/`, type `draft receipt`, crop to the dialog plus 44px | 1440 by 900 | 16px |
| `changelog.png` | `serve --profile public`, scrolled to the changelog heading | 1180 by 820 | 16px |
| `receipt.png` | record `0001` in the billing demo, Files and Relationships open, cropped to the panel | 1440 by 1600 | 12px |

Each screenshot gets rounded corners and a 1px `#3d363f` inner border, the
reader's dark line color, with pixels kept at their captured size. Recapture
the images when the reader's look changes, and look at each one before
committing it. The cards and screenshots share the reader's dark palette,
which follows Dossier's.

The reader copies its design tokens from Dossier (decision D003). When
Dossier's `tokens.css` changes, run
`node scripts/check-dossier-tokens.mjs --dossier <path-to-dossier>`. It
compares every token's light and dark values, allows only Ledger's accent to
differ, and says whether `tokens.css` changed since the commit the stylesheet
names.

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
release record with
`ledger release <version> --include-unreleased --assign --status released --write`.
A receipt that lands after the record exists joins it with
`ledger release <version> --include-unreleased --assign --update`; then write
its public note by hand.
