---
id: "D009"
kind: "decision"
title: "The reader owns its visual system"
date: "2026-09-28"
updated: "2026-09-28"
status: "accepted"
areas:
  - "reader"
  - "design"
related:
  - "D003"
  - "B009"
  - "0168"
docs:
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
---

# D009: The reader owns its visual system

## Context

Receipt 0168 gave the reader Dossier's visual system: its neutrals, status
tones, font stacks, radii, and motion, copied from Dossier's `tokens.css` and
checked by `scripts/check-dossier-tokens.mjs`. The copy kept the two products
visually aligned, but it also tied the reader's look to another product's
choices: a plum-tinted palette, an italic serif accent word in the masthead,
neutral kind badges because Dossier colors only status, and a token check
that needed a Dossier checkout.

On 2026-09-27 Kyle asked for the reader's web presentation to be rebuilt from
the ground up with far more design intent, a rewritten README with new
captures, and a live hosted example. During the work he added two standing
rules: no italic words in titles or headers, and never a colored accent line,
an edge bar, to mark an active or selected item.

After reviewing the first version on 2026-09-28, Kyle asked to use Dossier's
new neutral reader as a design reference, elevate the hierarchy and ergonomics,
and replace the three-state theme control with a binary Light/Dark switch.
The existing views and navigation remain the foundation.

## Decision

The reader owns its visual system. Its tokens live in `src/reader/styles.css`
as `light-dark()` pairs and belong to Ledger: neutral grayscale surfaces, the
emerald accent from the mark, status tones, one series color for charts, and a
categorical palette for record kinds. Every kind also has an icon and a label;
color never carries the distinction alone, and text never wears a series color.
The reader keeps system font stacks
and makes no font requests.

Two rules hold everywhere Ledger draws an interface, the README cards
included:

- Headings are upright, in one weight. No italic accent words.
- An active, selected, or current item shows a background tint, a heavier
  weight, or a full focus ring. Never a colored edge line.

D003 stands: Ledger still imports nothing from Dossier. The token check script
is retired. Dossier's neutral surfaces, reading hierarchy, and binary theme
control are design references, without a shared runtime or a checkout-dependent
token equality check. An explicit theme choice persists across visits; until
then the reader follows the operating system.

## Consequences

The reader can change its look for Ledger's own reasons. The overview, the
timeline, the relationship map, and the public version index in receipt 0196
use tokens Dossier never had. The two readers can feel related while Ledger
retains its emerald identity and controls suited to changes, releases, and
repository knowledge.

The README cards and screenshots use the reader's palette, so a palette
change means regenerating them with `node scripts/readme-assets.mjs` and
`node scripts/readme-screenshots.mjs`.

## Revisit Criteria

- Revisit if visual alignment requires a shared token contract rather than a reference.
- Revisit if a token package both products can depend on, without importing
  each other, exists.
