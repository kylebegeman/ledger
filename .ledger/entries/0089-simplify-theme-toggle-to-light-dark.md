---
id: "0089"
kind: "change"
title: "Simplify theme toggle to light and dark"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "reader"
  - "ux"
files:
  - "docs/ARCHITECTURE.md"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
symbols:
  - "staticReaderRuntime"
  - "staticReaderStyles"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture guide now describes the follow-system default with a two-state toggle instead of the three-state cycle."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0083"
release: "v0.3.0"
---

# 0089: Simplify Theme Toggle To Light And Dark

## Summary

Removed the system stop from the theme toggle. The reader follows the
operating system preference silently until a reader makes a choice; the
toggle then flips between light and dark from whatever theme is currently
resolved, and the explicit choice persists. While no choice is stored, the
toggle icon tracks the resolved system theme through a media query, so the
button always shows the current appearance and announces the opposite one.

## Why

Project direction: system is the automatic default, not an option a reader
needs to select. A three-state cycle made the common action, switching
between light and dark, take up to two presses and forced readers to reason
about a third state. The default markup already renders the system state, so
no explicit system selection is needed anywhere.

## Changed Files

### Toggle behavior and icon state

- Files: `src/renderAssets.ts`, `src/renderHtml.ts`
- Changed: The click handler flips from the resolved theme and always stores
  the result; the label reads switch-to-opposite; the system icon and its
  sprite symbol were removed; a prefers-color-scheme rule shows the resolved
  icon while the document is in its system default.
- Anchor: `staticReaderRuntime`, `staticReaderStyles`.
- On conflict: Keep system as the unstored default, keep stored values
  limited to light and dark, and keep the head bootstrap accepting only
  those two values.

## Behavior And UX Impact

- Fresh visits follow the operating system theme with no stored value.
- One press always switches to the opposite of what is on screen.
- The stored choice survives reloads; operating system changes continue to
  drive the theme only until that first choice.

## Invariants

- No user selection is stored until the toggle is pressed.
- Stored theme values are only light or dark.
- The toggle icon always reflects the resolved theme, including in the
  unstored system default.

## Verification

- `npm run check`
- Browser pass: fresh state resolves from the operating system with the
  matching icon and label, first press switches to the opposite theme and
  persists, following presses alternate light and dark
