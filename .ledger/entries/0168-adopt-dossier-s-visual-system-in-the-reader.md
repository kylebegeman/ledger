---
id: "0168"
kind: "change"
title: "Adopt Dossier's visual system in the reader"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "design"
files:
  - "src/reader/styles.css"
  - "src/reader/runtime.ts"
  - "src/renderHtml.ts"
  - "test/readerRuntime.test.ts"
  - "test/render.test.ts"
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
  - "scripts/readme-assets.mjs"
  - "assets/readme/hero.png"
  - "assets/readme/palette.png"
  - "assets/readme/receipt.png"
  - "assets/readme/changelog.png"
  - "assets/readme/adopt.svg"
  - "assets/readme/agent-draft-notice.svg"
  - "assets/readme/agent-session-start.svg"
  - "assets/readme/ci.svg"
  - "assets/readme/loop.svg"
  - "assets/readme/packet.svg"
  - "assets/readme/ready.svg"
  - ".ledger/backlog/B009-adopt-dossier-visual-system.md"
symbols:
  - "themeOrder"
  - "updateThemeLabel"
  - "facetButtons"
  - "issueList"
  - "COLORS"
  - "LOOP"
docs:
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes the Dossier-based design, the status colors, the browser floor, and the three-state theme toggle; CONTRIBUTING gives the new screenshot edge color."
  docs:
    - "docs/ARCHITECTURE.md"
    - "CONTRIBUTING.md"
commits: []
backlog:
  - "B009"
decisions:
  - "D003"
related:
  - "0137"
  - "0146"
  - "0169"
release: "v0.9.0"
---

# 0168: Adopt Dossier's Visual System In The Reader

## Summary

The static reader and the public changelog now use Dossier's visual system.
The values were copied from Dossier `b48ea15`
(`core/internal/render/assets/tokens.css`), never imported:

- plum-tinted neutrals, teal, violet, and coral status tones, and borders in
  place of shadows
- Dossier's system font stacks, with no font requests
- 6, 10, and 14px radii and one 160ms motion curve

Ledger keeps its emerald accent, `#047857` and `#34d399`, with new tints at
Dossier's tint lightness. The hero became Dossier's compact masthead, with
one italic serif accent word in the title. From 1100px, the facet rail sits
on the left under group labels. Panels sit on paper, and text inputs and
selects get a 3:1 control edge. The theme toggle cycles Auto, Light, and Dark
and shows a visible label.

The README screenshots were recaptured, and the terminal cards and loop
diagram moved to the same dark palette. B009 is landed.

## Why

Kyle wants Ledger and Dossier to read as one family (B009), and he left the
open design choices to the assistant. The previous design also had problems
the port fixes:

- Contrast failures: light muted text measured 4.05 on the canvas, the search
  placeholder 2.15, and light warning text 4.12.
- The theme toggle could not return to the system setting after one click.
- At tablet widths, the record list overflowed sideways, because its grid
  track grew to the longest unwrapped title.

Dossier colors status and never categories, and its teal sits next to
Ledger's light accent (a distance of 0.038 in OKLab). So kind badges became
neutral outline chips, and every selected state carries an accent outline,
pip, or underline in addition to its tint.

Rejected:

- Embedding Dossier's web fonts, which the reader's content security policy
  blocks and which would add 80 to 200 KB to every page.
- Dossier's derived accent for the mark's color, which fails 4.5:1 on
  `paper-2`.
- Minifying the stylesheet, which rewrites strings the tests pin.

## Changed Files

### Stylesheet

- Files: `src/reader/styles.css`
- Changed:
  - Tokens: Dossier's neutrals and tones as `light-dark()` values, plus
    Ledger-only `--danger`, `--control-line`, and one overlay shadow.
  - Base: the font stacks, and a 15.5px body with a 1.55 line height.
  - Components: every component restyled to Dossier's treatments. The
    masthead, rail, and facet list follow its contents rail; the rows its
    items; chips its outline chips; the density toggle its segmented control.
    Panels follow its callouts, the palette its dialog, and the changelog its
    timeline columns.
  - Status colors: teal for landed and released, violet for in-progress
    states and `captured`, coral for blocked and rejected, and neutral for
    the rest.
  - Removed: the load-time row animation, the radial glow, and the dark code
    slab.
  - Fixes: the results grid is bounded to its column, and the native search
    clear button is hidden. The rail's scrollbar shows only on hover.
- Anchor: `--accent`, `--control-line`, `.facet-button[aria-pressed="true"]`,
  `.status-dot`, `.workspace`
- On conflict: Keep every class name, keep `light-dark()` tokens, never write
  a left border, and diff the token block against Dossier's `tokens.css`
  when that file changes.

### Markup and runtime

- Files: `src/renderHtml.ts`, `src/reader/runtime.ts`
- Changed:
  - The theme toggle is a labeled button with auto, light, and dark icons.
  - The titles carry one `<em>` accent word.
  - Each facet list has a visible group label and `role="group"`.
  - Issue levels carry `data-level`, so errors use the danger color.
  - The runtime cycles `system`, `light`, and `dark`. It removes the stored
    theme for Auto, and it writes the label and an aria-label that names the
    next state.
- Anchor: `themeOrder`, `updateThemeLabel`, `facetButtons`, `issueList`
- On conflict: Keep the `head` script that applies a stored light or dark
  choice before first paint.

### Tests

- Files: `test/readerRuntime.test.ts`, `test/render.test.ts`
- Changed: the theme test cycles all three states and checks storage, the
  label, and the aria-label. A new check keeps the embedded stylesheet under
  40 KB, and the public title expectation includes the `<em>`.
- Anchor: `cycles the theme through auto, light, and dark`
- On conflict: Keep the stylesheet size guard.

### README assets, docs, and backlog

- Files: `scripts/readme-assets.mjs`, `assets/readme/*.png`,
  `assets/readme/*.svg`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`,
  `.ledger/backlog/B009-adopt-dossier-visual-system.md`
- Changed:
  - The card and loop palettes use Dossier's dark neutrals and tones: code in
    violet, record ids in coral, and pass in teal. All seven SVGs were
    regenerated.
  - The four screenshots were recaptured with the CONTRIBUTING settings and
    framed with a `#3d363f` edge.
  - The architecture doc describes the new design, the status and selection
    rules, the toggle, and the browser floor (Chrome 123, Firefox 120,
    Safari 17.5). Its outdated backdrop rationale is gone.
  - B009 is landed, with its sources corrected to Dossier 0.7.2 and the
    decisions recorded.
- Anchor: `COLORS`, `LOOP`, `The reader follows Dossier's visual system`
- On conflict: Regenerate the cards with `node scripts/readme-assets.mjs` and
  recapture the screenshots rather than editing either by hand.

## Behavior And UX Impact

The reader and the public changelog look like Dossier pages in both themes,
while keeping Ledger's emerald identity. Kind badges are no longer colored.
Superseded, deprecated, and expired records show a neutral status dot
instead of a red one. The theme toggle shows its state and can return to
Auto. The masthead is much shorter, so records start higher on the page. No
data, sidecar, or behavior other than the toggle changed.

## Invariants

- Text and tone colors measure at least 4.5:1 on every surface in both
  themes, and text inputs, selects, and selected states have at least a 3:1
  cue.
- The reader stays one offline HTML file with no font or network requests
  beyond its own sidecars.
- Class names, ids, and data attributes the runtime and tests use are
  unchanged.
- The embedded stylesheet stays under 40 KB.

## Verification

- `npm run build:reader`
- `npx vitest run test/readerRuntime.test.ts test/render.test.ts`
- `npm run ci`
- `node dist/cli.js doctor`
- Visual checks in the browser at 1440, 768, and 375 pixels wide in both
  themes. They covered the library, the record panel, the command palette,
  and the public changelog, with no horizontal overflow at any width.
- Contrast, computed with the WCAG formula for the chosen palette: muted
  text 5.82 and 7.99 on the page, accent 5.48 and 9.69, and accent on its tint
  4.79 and 7.73. The control edge measures 3.66 and 3.63.
- The screenshots were captured with Playwright at device scale 2 from
  `serve` for this repository, its public profile, and the billing demo, and
  reviewed image by image. Light-theme versions were sent to Kyle.

## Notes

The ported token block names Dossier commit `b48ea15` in a comment in
`src/reader/styles.css`. The dark-theme README screenshots are the only
images committed, one per visual; light versions are for review only.
