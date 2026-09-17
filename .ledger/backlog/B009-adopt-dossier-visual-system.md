---
id: "B009"
kind: "backlog"
title: "Adopt the Dossier visual system in the reader and generated pages"
date: "2026-09-16"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "design"
decisions:
  - "D003"
docs:
  - "docs/HANDOFF.md"
  - "docs/ARCHITECTURE.md"
---

# B009: Adopt The Dossier Visual System In The Reader And Generated Pages

## Problem

Ledger's reader had its own flat editorial design with `light-dark()` tokens
and an accent matched to the mark. Kyle wants Ledger's reader, public
changelog, and other generated pages to share the visual system Dossier now
uses, including its light and dark modes, so the two products read as one
family.

## Desired Outcome

The reader and public export use Dossier's design tokens, typography, spacing,
and component treatments, with light and dark themes, while remaining a
self-contained static artifact with no runtime dependency on Dossier.

## Scope

Included:

- Read Dossier's design record and token sources in the Dossier repository.
  Dossier 0.7.2 replaced the files listed next with one stylesheet,
  `core/internal/render/assets/tokens.css`, and the accent derivation in
  `core/internal/theme/theme.go`; the port used those at commit `b48ea15`.
  The 0.6.7 sources were:
  `docs/DESIGN.md`, `src/theme/tokens.css.mjs`, `src/themes.mjs`, and
  `src/skins.mjs`. The current tokens (as of Dossier 0.6.7) are near-monochrome
  plum neutrals with one berry accent: light `--ds-bg #fbfbfc`, `--ds-ink
  #1a1822`, `--ds-accent #c81e4a`; dark `--ds-bg #0e0d13`, `--ds-ink #eceaf1`,
  `--ds-accent #ff6b88`; semantic `ok`, `warn`, `danger` tokens with tints;
  fonts Inter (text), Charter (serif), Geist Mono (mono); dark mode switched
  by `[data-theme="dark"]`. Theme packs (berry, slate, forest, ocean,
  midnight, amber, plum) swap only the accent, and the `console-slate` skin
  layers a denser presentation. `docs/DESIGN.md` still cites the older
  `#e11d48` accent; the token file is authoritative.
- Port the tokens into `src/renderAssets.ts` (or the typed runtime from B008
  if that lands first) as `light-dark()` custom properties; keep the three
  theme states (explicit light, explicit dark, system) and the existing
  keyboard, density, and pagination behavior.
- Restyle the record list, detail panel, search palette, facets, and public
  changelog year groups to Dossier's component treatments.
- Keep the Ledger mark and allow the accent to remain Ledger's own if the
  Berry accent reads as Dossier branding; decide by inspection.

Excluded:

- Importing Dossier code or CSS at build or runtime (D003).
- Changing the reader's data model, sidecars, or budgets.

## Acceptance Checks

- Internal and public renders stay within configured budgets.
- Both themes pass an AA contrast check on text and controls.
- The reader still works from a `file:` URL and under the engine with live
  reload.
- Screenshots of both themes are reviewed by Kyle before merge.

## Risks

- Token drift between the two products; record the Dossier commit the port was
  taken from in the receipt.
- The reader's CSS is embedded in a template string until B008's typed
  runtime lands; sequencing after A4 avoids doing the port twice.

## Promotion Notes

Schedule inside 0.7's reader work or as its own minor release after B008's
typed runtime.

Implemented for 0.9.0 in receipt 0168, from Dossier `b48ea15`. The port
copies Dossier's neutrals, tones, fonts, radii, and motion into
`src/reader/styles.css` as `light-dark()` tokens. It keeps Ledger's emerald
accent (`#047857`, `#34d399`) with tints at Dossier's tint lightness.

Decisions taken by the assistant, as Kyle asked:

- Color marks status only, so kind badges are neutral outline chips.
- Errors use a Ledger-only crimson, and superseded, deprecated, and expired
  statuses are neutral.
- Text inputs and selects use a 3:1 control line, and every selected state
  carries an accent outline, pip, or underline.
- Fonts are Dossier's system stacks with no embedded fonts.
- The hero became Dossier's compact masthead, with the rail on the left from
  1100px.
- The theme toggle cycles Auto, Light, and Dark with a visible label.

Acceptance:

- Both profiles render within budget.
- Every text and tone pairing measures at least 4.5:1 and every control edge
  at least 3:1 in both themes.
- The reader works from a `file:` URL, and the engine tests still cover live
  reload.
- Screenshots of both themes were sent to Kyle during the work. His
  instruction to finish everything without waiting stood in for a pre-merge
  review.
