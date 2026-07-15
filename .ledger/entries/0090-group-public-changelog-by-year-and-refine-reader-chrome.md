---
id: "0090"
kind: "change"
title: "Group public changelog by year and refine reader chrome"
date: "2026-07-15"
updated: "2026-07-15"
status: "landed"
areas:
  - "reader"
  - "design"
  - "ux"
files:
  - "docs/ARCHITECTURE.md"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "test/render.test.ts"
symbols:
  - "renderStaticReaderHtml"
  - "staticReaderStyles"
  - "staticReaderRuntime"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture guide now describes the newest-first year-grouped public changelog, the contextual empty state, the token-tracking select chevron, and the backdrop rationale."
commits: []
related:
  - "0083"
  - "0088"
---

# 0090: Group Public Changelog By Year And Refine Reader Chrome

## Summary

Layered year grouping onto the public changelog through the path entry 0083
reserved: release entries sort newest-first, the first entry of each year
carries a year-start mark, and a large muted year heading renders as a
pseudo-element inside that entry's own grid, so the filter runtime can
re-append rows without displacing separate marker elements. The runtime
recomputes marks after every filter pass, labels the first visible entry of
each page, and suppresses headings while ranked search reorders the feed.

The same pass refined the surrounding chrome. The empty state now
distinguishes a filtered miss from a genuinely empty library and hides its
reset control when nothing is active. The select chevron is painted through
a CSS mask so it follows the light-dark() tokens and tints with the active
filter. The record panel gained calmer spacing and a close button without
the theme toggle's rotation hover, dead panel-open body class writes were
removed, the release date column tracks stickily beside long note lists, and
the footer reads as an uppercase colophon.

## Why

Project direction: continue the visual overhaul with structural
improvements. Entry 0083 rejected year markers as sibling elements because
the filter runtime re-appends every entry during ranking, and left a
data-year attribute on each release entry so grouping could be layered on
later; this change is that layering. Year grouping requires a coherent
chronological order, and the model sorts documents by plain identifier
comparison, which rendered the public feed lexicographically scrambled
(v0.1.1, v0.1.10, v0.1.12, v0.1.2). The feed now sorts newest-first at the
presentation layer only, keeping the model and search index untouched.

A modal treatment for the record panel was considered out of bounds: entry
0088 deliberately keeps the panel non-modal so the list stays interactive.
The unused panel-open class writes were removed instead of being given a
scrim. A wide-viewport push layout was evaluated and rejected because it
only fully clears the 600px panel above roughly 2120px viewports and causes
text reflow on every open and swap.

## Changed Files

### Markup composition

- File: `src/renderHtml.ts`
- Changed: Public profile maps over a date-descending copy of the documents
  with numeric-aware identifier tiebreak; renderPublicEntry emits a
  year-start class on year boundaries; the empty state bakes filtered and
  bare copy variants for both profiles; selects are wrapped in a select-wrap
  span that hosts the mask chevron.
- Anchor: `renderStaticReaderHtml`.
- On conflict: Keep the sort presentational and public-only. Keep both empty
  variants baked into static markup with profile-correct nouns.

### Styles and runtime

- File: `src/renderAssets.ts`
- Changed: Year heading renders via a year-start pseudo-element spanning the
  release entry grid; markYearBreaks recomputes marks inside the filter
  update callback so view transitions absorb the geometry change; empty
  state visibility switches on an empty-state data attribute written next to
  the existing hidden toggle; select chevron moved from a hard-coded
  data-URI background to a mask with token-driven background color; icon
  button rotation hover relocated to the theme toggle; record panel spacing
  opened up; sticky release date column with a static override in the 820px
  block; uppercase colophon footer; dead reveal keyframes and panel-open
  writes removed.
- Anchor: `staticReaderStyles`, `staticReaderRuntime`, `markYearBreaks`,
  `activeFilterCount`.
- On conflict: markYearBreaks must run inside the filter update callback and
  must clear marks while ranked search is active. Year headings must remain
  pseudo-elements on the entries themselves, never sibling elements. The
  panel stays non-modal.

### Contracts and documentation

- Files: `test/render.test.ts`, `docs/ARCHITECTURE.md`
- Changed: Tests assert the year runtime and CSS literals, newest-first
  public order with a second release year, exactly one baked year-start per
  year, empty state variants with profile noun isolation, the mask chevron,
  the relocated rotation hover, and prohibit the old chevron hex, the reveal
  keyframes, and panel-open. The architecture guide documents the new
  behavior.
- On conflict: The panel-open prohibition locks the non-modal decision from
  entry 0088; do not reintroduce the class without revisiting that entry.

## Behavior And UX Impact

- The public changelog reads newest-first under large muted year headings
  that scale down on small viewports; page two and beyond always opens with
  a year label for context.
- Searching the changelog suppresses year headings while results are ranked
  by score and restores them when the query clears.
- An empty library explains itself instead of suggesting a filter reset, and
  the reset button only appears when there is something to reset.
- Filter chevrons follow the theme and tint orange when their filter is
  active.
- The record panel close button no longer rotates on hover; panel content
  has more air and a balanced title.
- Release dates stay in view beside long note lists on wide viewports.

## Invariants

- Year group markers are never sibling elements between entries; they render
  from the entries themselves so filter re-appends cannot displace them.
- Year headings are hidden whenever results are ordered by search score.
- The record panel remains non-modal with no scrim and no body scroll lock.
- The public feed sort is presentational; model and search index ordering
  are unchanged and internal output is byte-identical in structure.
- Empty state copy uses releases on the public profile and records on the
  internal profile; no internal noun leaks into public output.
- All artifacts stay within configured render budgets.

## Verification

- `npm run check`
- `npm run ci`
- Internal and public renders within budget via `ledger render` and
  `ledger render --profile public`
- Browser pass: newest-first year-grouped public feed in light and dark at
  desktop, 780px, and mobile widths; year marks recompute on filter and
  clear during ranked search; empty state variants and reset visibility;
  chevron token tracking and active tint; panel open, swap, Escape close
  with focus restore and empty body class list; sticky date column pinning
  and its static fallback below 820px

## Notes

The command palette backdrop stays a hard-coded half-black overlay:
`::backdrop` custom-property inheritance landed after the documented Firefox
floor, and an overlay scrim is deliberately theme-invariant. The palette's
recent-records list still derives from the lexicographic search index order
on the public profile; fixing that belongs in buildStaticReaderModel and is
left as a follow-up. An embedded-preview capture artifact was observed again
while verifying (stale frames after scrolling, no requestAnimationFrame in
hidden documents); as in entry 0083 this is an environment artifact, not a
reader defect. Entries relaid out after a viewport resize can briefly keep
their previous content-visibility size until the next reflow; this predates
this change.
