---
id: "0188"
kind: "change"
title: "Record the v0.9.2 publish, Kore's move to it, and the pause"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "release"
  - "adoption"
files:
  - ".ledger/entries/0187-doctor-suggests-the-typescript-parser-where-it-cannot-help.md"
  - "docs/HANDOFF.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the 0.9.2 publish, Kore's move, the pause, and where to resume."
  docs:
    - "docs/HANDOFF.md"
commits: []
related:
  - "0186"
  - "0187"
---

# 0188: Record the v0.9.2 publish, Kore's move to it, and the pause

## Summary

This records that 0.9.2 was published from kylebegeman/ledger#31 (tag
`v0.9.2`, npm `latest`), with GitHub Release notes identical to
`ledger release notes v0.9.2`, and that Kore moved to it in
kylebegeman/forge#32 (Kore receipt 0010). It also covers:

- **Smoke test.** A run of the published package in a throwaway Go
  repository drafted `Server.Handle` from a diff, took a section body,
  updated the record, and rendered the public feed.
- **Product note 0187.** The smoke test and Kore's doctor output showed that
  the doctor symbols check gives TypeScript advice where it cannot help. The
  note records it for later.
- **Handoff.** It now says the project is paused, and it lists where to pick
  up: Kore's hook trust and a live Codex session, product note 0187, and new
  features.

## Why

Kyle asked to finish everything so he can pause Ledger and move on. The
handoff has to describe that paused state for the next session.

## Changed Files

### Handoff and product note

- Files: `docs/HANDOFF.md`,
  `.ledger/entries/0187-doctor-suggests-the-typescript-parser-where-it-cannot-help.md`
- Changed:
  - The handoff names 0.9.2 as published, Kore on 0.9.2, and the pause.
    Its next slices are the Kore hook trust, product note 0187, and features
    left out of 0.9.2.
  - Product note 0187 describes both doctor messages and what to change.
- Anchor: `Where the product stands`, `Next slices, in order`
- On conflict: Keep the handoff describing the paused state until work
  resumes.

## Behavior And UX Impact

None; this records the release and the pause.

## Invariants

- The handoff matches the published version and Kore's pin.

## Verification

- `npm view @kylebegeman/ledger@0.9.2 version` printed 0.9.2, and
  `dist-tags.latest` is 0.9.2.
- `gh release view v0.9.2` has the same notes as
  `node dist/cli.js release notes v0.9.2`.
- `npx --yes @kylebegeman/ledger@0.9.2 verify 0010 --run` passed in Kore.
- `npm run ci`

## Notes

Kyle still needs to trust Kore's six changed Codex hooks in the Codex app.
