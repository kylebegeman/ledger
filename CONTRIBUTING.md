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

## Brand Assets

`assets/ledger.svg` is the canonical icon used by the reader and favicon: a
single punched-receipt silhouette with a square opening and clipped corner.
Keep its edges square and preserve the opening at small sizes. The reader
uses its theme accent; the standalone SVG uses a flat copper that works on
both light and dark backgrounds.

`assets/ledger-logo.svg` and `assets/ledger-logo-dark.svg` pair the mark with
the lowercase wordmark. The README chooses the appropriate version through
`picture`. Lettering is outlined Manrope 600 with deliberate spacing, so no
font installation or network request is needed. The upstream copyright and
OFL license are in `assets/brand/Manrope-OFL.txt`; the reader's system fonts
are independent of the logo lettering.

Regenerate all three SVGs from their committed geometry:

```bash
node scripts/brand-assets.mjs
```

Inspect the mark at 16, 24, 32, and 64px in both themes, then refresh reader
screenshots that show it. Keep the lockups as paths, with accessible titles,
transparent backgrounds, and no external references.

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

The reader screenshots come from `scripts/readme-screenshots.mjs`.
Playwright is not a dependency, so install it without saving it first:

```bash
npm run build
npm install --no-save playwright
npx playwright install chromium
node scripts/readme-screenshots.mjs
```

Name images to capture only those, for example
`node scripts/readme-screenshots.mjs overview palette`. The script serves this
repository's readers and builds the billing demo with
`node scripts/readme-assets.mjs --demos-only`. It captures each view in a
fresh browser context at a device scale factor of 2 with reduced motion, dark
unless the image says light:

| Image | Page | Viewport | Corner radius |
| --- | --- | --- | --- |
| `overview.png` | `/`, the overview | 1440 by 900 | 18px |
| `overview-light.png` | `/` in the light scheme | 1440 by 900 | 18px |
| `records.png` | `/?view=records&record=0133`, scrolled to the list | 1440 by 900 | 18px |
| `timeline.png` | `/?view=timeline`, scrolled to the list | 1440 by 900 | 16px |
| `palette.png` | `/`, press Cmd+K, type `draft receipt`, crop to the dialog plus 44px | 1440 by 900 | 16px |
| `changelog.png` | `serve --profile public`, scrolled to the changelog heading | 1180 by 820 | 16px |
| `receipt.png` | record `0001` in the billing demo, Files and Relationships open, cropped to the panel | 1440 by 1600 | 12px |

Each screenshot gets rounded corners and a 1px inner border in the reader's
line color (`#392f29` dark, `#e8e5e2` light), with pixels kept at their captured
size. The two overview images capture the full page so the activity chart,
its dates, and the supporting sections remain complete. Recapture the images
when the reader's look changes, and look at each one before committing it. The cards share the
reader's palette, which lives in `src/reader/styles.css` under decision D009:
near-white light surfaces and warm charcoal dark surfaces, copper and apricot
accents, upright headings in one weight, and never a colored edge line to mark a state. Keep the logo,
charts, and README art in that palette. The reader uses compact, unboxed
sections and ruled record rows; recent changes lead the overview, and record
details use stacked evidence
sections with the relationship map collapsed below the file and relationship
lists. Keep record-kind labels neutral and reserve semantic color for status.

Records and Timeline use rounded pill controls with custom menus for filters,
sort order, and page size. Native select values remain canonical beneath the
shared menu implementation. On desktop, the sidebar contains record types
with icons and count pills, then Area, Release, and Tag controls under Refine;
Status and Quality signals stay above the results. At 960px and below, the
sidebar is hidden and the same refinement controls join Type in the top
toolbar. Preserve keyboard navigation, visible field and value labels, and
the reader's system fonts and operating-system theme default.

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
