---
id: "0085"
kind: "change"
title: "Swap reader accent from indigo to copper"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "design"
  - "branding"
files:
  - "assets/ledger.svg"
  - "src/renderAssets.ts"
symbols:
  - "staticReaderStyles"
docsImpact:
  status: "not-needed"
  reason: "Docs describe the visual system without naming specific hues, so the accent swap changes no documented behavior."
commits: []
related:
  - "0083"
---

# 0085: Swap Reader Accent From Indigo To Copper

## Summary

Replaced the indigo and purple accent family with a warm copper and
terracotta ramp across both themes, following project direction to drop the
purple color. The brand mark, canvas glow, interactive states, focus rings,
pressed facets, active filter pills, pagination, and palette highlights all
follow the new accent tokens. The purple product-note and feedback kind tone
became teal, and the default change kind chip became neutral so the common
case no longer competes with the amber backlog tone that sits near copper.

## Why

Direct project feedback asked to drop the purple accent. Copper harmonizes
with the warm paper canvas and olive-tinted neutrals, keeps green, amber,
rose, and blue free for status and kind semantics, and reads editorial
rather than default-software. Making the dominant change chip neutral keeps
accent color meaning interactive throughout the reader.

## Changed Files

### Accent tokens and kind tones

- File: `src/renderAssets.ts`
- Changed: Replaced the accent, accent-strong, accent-soft, on-accent, and
  canvas-glow token values with the copper ramp; replaced accent-alt with
  teal; changed the default record-type chip to neutral surface tones.
- Anchor: `staticReaderStyles`.
- On conflict: Keep every accent usage flowing through the tokens so a
  future accent swap stays a token-only change.

### Brand mark

- File: `assets/ledger.svg`
- Changed: Tile fill moved from indigo to copper and the status pip from
  lilac to light copper; the white glyph is unchanged.
- On conflict: Keep the mark aligned with the reader accent tokens.

## Behavior And UX Impact

- Interactive elements read as copper in light mode and luminous peach in
  dark mode with unchanged contrast characteristics.
- Change records show neutral kind chips; decisions stay blue, backlog stays
  amber, releases stay green, product notes and feedback become teal.
- No layout, markup, or runtime behavior changed.

## Invariants

- All accent color usage flows through the light-dark() token system; no
  component hardcodes accent hues.
- Kind and status semantics keep distinct hue families from the interactive
  accent.
- Light and dark themes both meet the reader's existing contrast baseline.

## Verification

- `npm run check`
- `npm run ci`
- Internal and public renders in both themes reviewed in the browser
