---
id: "0086"
kind: "change"
title: "Brighten accent to azure with sunset mark"
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
  reason: "Docs describe the visual system without naming specific hues, so the accent and mark changes alter no documented behavior."
commits: []
related:
  - "0085"
release: "v0.2.0"
---

# 0086: Brighten Accent To Azure With Sunset Mark

## Summary

Moved the reader accent from copper to a brighter azure blue in both themes
and gave the brand mark its own warm identity: a yellow to orange to red
sunset gradient tile with a warm yellow pip. The interactive accent now
reads vivid blue while the mark deliberately contrasts warm against the
cool interface. Decision chips adopted the retired copper ramp because
steel blue would have blended into the new azure accent, and the former
info tokens were renamed to decision tokens to match their single use.

## Why

Project direction asked for a brighter, prettier interface color in the
blue family, with the icon carrying different warm colors such as purple,
red, orange, or yellow. Azure keeps interactive elements luminous in both
themes, and reassigning copper to decisions preserves distinct hue
families: blue means interactive, copper means decision, amber means
backlog, green means release, teal means product notes and feedback.

## Changed Files

### Accent tokens and decision tone

- File: `src/renderAssets.ts`
- Changed: Replaced the accent family and canvas glow with the azure ramp,
  renamed the info tokens to decision tokens with copper values, and made
  the logo tile background transparent so the warm mark stands alone in the
  topbar.
- Anchor: `staticReaderStyles`.
- On conflict: Keep accent usage token-only and keep the decision tone in a
  hue family distinct from the interactive accent.

### Brand mark

- File: `assets/ledger.svg`
- Changed: The tile now uses an inline linear gradient from yellow through
  orange to red with a warm yellow pip; the white glyph is unchanged. The
  gradient is self-contained in the SVG, so the inlined topbar mark and the
  README image stay dependency-free.
- On conflict: Keep the mark warm and self-contained with no external
  references.

## Behavior And UX Impact

- Interactive elements render vivid azure in light mode and luminous sky in
  dark mode; pressed states use soft blue fills.
- Decision chips render copper in both themes.
- The topbar mark shows the sunset gradient without a tinted tile behind
  it.
- No layout, markup, or runtime behavior changed.

## Invariants

- All accent color usage flows through the light-dark() token system.
- The mark stays simple, filled, scalable, and self-contained.
- Kind and status tones keep hue families distinct from the interactive
  accent.

## Verification

- `npm run check`
- `npm run ci`
- Internal render reviewed in both themes; token values confirmed via
  computed styles
