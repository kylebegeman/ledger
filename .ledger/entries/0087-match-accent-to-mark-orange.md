---
id: "0087"
kind: "change"
title: "Match accent to mark orange"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "design"
  - "branding"
files:
  - "src/renderAssets.ts"
symbols:
  - "staticReaderStyles"
docsImpact:
  status: "not-needed"
  reason: "Docs describe the visual system without naming specific hues, so the accent swap changes no documented behavior."
commits: []
related:
  - "0086"
release: "v0.2.0"
---

# 0087: Match Accent To Mark Orange

## Summary

Aligned the interface accent with the sunset mark. Interactive elements now
use a saturated burnt orange in light mode and the mark's luminous orange in
dark mode, with matching soft fills and a warm canvas glow. Decision chips
returned to their steel blue tones because copper decisions would have
blended into the orange accent family.

## Why

Project direction settled on the warm mark and asked the page accent to
match it. Deriving the light accent from the mark's orange at text-safe
contrast keeps the interface legible while the dark theme can carry the
mark's vivid orange directly. Restoring blue decisions keeps hue families
distinct: orange means interactive, blue means decision, amber means
backlog, green means release, teal means product notes and feedback.

## Changed Files

### Accent tokens and decision tone

- File: `src/renderAssets.ts`
- Changed: Replaced the accent family and canvas glow with the orange ramp
  derived from the mark, and returned the decision tokens to steel blue.
- Anchor: `staticReaderStyles`.
- On conflict: Keep accent usage token-only, keep the light accent at
  text-safe contrast on the canvas, and keep decisions outside the accent
  hue family.

## Behavior And UX Impact

- Interactive elements render burnt orange in light mode and luminous
  orange in dark mode, visually continuous with the mark.
- Decision chips render steel blue in both themes.
- No layout, markup, or runtime behavior changed.

## Invariants

- All accent color usage flows through the light-dark() token system.
- Light-mode accent text keeps roughly 4.5 to 1 contrast on the canvas.
- Kind and status tones keep hue families distinct from the interactive
  accent.

## Verification

- `npm run check`
- Internal render reviewed in both themes against the mark
