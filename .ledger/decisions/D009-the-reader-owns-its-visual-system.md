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

Later that day Kyle asked to remove the proliferation of cards and tighten
the layout, using [Impeccable](https://github.com/pbakaus/impeccable) as a
design reference. The reader should feel like a working archive: the records
lead, and the interface helps people scan, find, and read them.

After approving the overview, Kyle asked to simplify Records and Timeline:
rounded pill controls, custom menus for every select, and a sidebar that no
longer reads as a wall of repeated filter values. He then authorized moving
the refinement controls into that sidebar and replacing the palette across
the reader, logo, charts, and README art with warmer colors, without green
or blue as the primary accent. After seeing the warmer version, he asked for
light mode to move closer to white and avoid a beige, newspaper-like surface.

In the next review, Kyle corrected the dark theme: charcoal and slate with
subtle bluish-gray tones, without the orange or red cast of the warmer pass.
That pass kept the near-white light theme and its copper accent. Dossier continues
to inform the reading experience, while Ledger chooses its own visual system.

After approving the dark theme, Kyle asked to carry its blue identity into
light mode as well, explicitly allowing blue as the primary accent. The dark
charcoal, slate, and steel-blue palette is settled; the light theme keeps its
near-white surfaces with a blue accent that remains readable against them.
The standalone mark and both logo variants follow the same blue identity.

## Decision

The reader owns its visual system. Its tokens live in `src/reader/styles.css`
as `light-dark()` pairs and belong to Ledger: near-white light surfaces with
accessible blue accents, charcoal and slate dark surfaces with muted steel-blue accents,
semantic status colors, and one series color per theme for charts. The dark
theme's surfaces and text have no orange or red cast. The standalone mark,
light and dark logos, and README art use the corresponding blue palette.
Record kinds use neutral icons and written labels in the list. The relationship
map can use categorical colors alongside its labels; text never wears a series
color, and color never carries a distinction alone.
The reader keeps system font stacks
and makes no font requests.

The overview uses a compact project heading and inline counts above recent
changes, with releases, backlog, health, and areas in a supporting column.
Sections are separated by space and fine rules, not repeated card containers.
The activity chart supports the change history rather than dominating it.
Records use compact rows, and their detail panel reads as a document with
stacked evidence sections. Files and named relationships come before the
relationship map, which stays collapsed until requested. Raised surfaces and
shadows are reserved for overlays and controls that need separation.

Records and Timeline use rounded pill controls for filters, sorting, and page
size. One shared custom listbox enhances native selects, whose values remain
canonical; the controls keep keyboard navigation and typeahead, and identify
both the field and its selected value. The desktop sidebar contains record
types with icons and count pills, then Area, Release, and Tag menus under
Refine. Status and Quality signals stay above the results. At 960px and below,
the sidebar is hidden and the same refinement controls move into the top
toolbar alongside Type. There are no duplicate facet lists or mobile Browse
drawer. Quality signals shows its active-filter count, opens only when
requested, and closes on an outside interaction or Escape. Timeline dates
omit the repeated year under month headings while keeping a full accessible
date label.

Two rules hold everywhere Ledger draws an interface, the README cards
included:

- Headings are upright, in one weight. No italic accent words.
- An active, selected, or current item shows a background tint, a heavier
  weight, or a full focus ring. Never a colored edge line.

D003 stands: Ledger still imports nothing from Dossier. The token check script
is retired. Dossier's reading hierarchy and binary theme control remain design
references, without a shared runtime or a checkout-dependent
token equality check. An explicit theme choice persists across visits; until
then the reader follows the operating system.

## Consequences

The reader can change its look for Ledger's own reasons. The overview, the
timeline, the relationship map, and the public version index in receipt 0196
use tokens Dossier never had. Ledger has its own palette and controls
suited to changes, releases, and repository knowledge.

The README cards and screenshots use the reader's palette, so a palette
change means regenerating the brand assets with `node scripts/brand-assets.mjs`
and the README art with `node scripts/readme-assets.mjs` and
`node scripts/readme-screenshots.mjs`.

## Revisit Criteria

- Revisit if visual alignment requires a shared token contract rather than a reference.
- Revisit if a token package both products can depend on, without importing
  each other, exists.
