---
id: "0163"
kind: "change"
title: "Draft symbols from changed lines and name the hooked session in mid-turn checks"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "capture"
  - "symbols"
  - "ci"
files:
  - ".agents/skills/ledger/SKILL.md"
  - "assets/readme/ready.svg"
  - "docs/ARCHITECTURE.md"
  - "src/ci.ts"
  - "src/git.ts"
  - "src/index.ts"
  - "src/newEntry.ts"
  - "src/operations/definitions/changes.ts"
  - "src/sessions.ts"
  - "src/skills.ts"
  - "src/symbols.ts"
  - "test/ci.test.ts"
  - "test/draftFit.test.ts"
  - "test/fixtures/operations-contract.json"
  - "test/symbols.test.ts"
symbols:
  - "LedgerSymbolSpan"
  - "extractMarkdownSymbolSpans"
  - "extractCodeSymbolSpansWithRegex"
  - "symbolsTouchedByLines"
  - "getChangedLineRanges"
  - "parseChangedLineRanges"
  - "collectChangedSymbols"
  - "sessionDraftHints"
  - "SessionDraftHint"
  - "formatCiText"
  - "runCiChecks"
  - "renderLedgerSkill"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes symbol spans, the changed-line filter for drafts, the ci text report, and the hooked-session hints; the shipped skill names the mid-turn step."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0160"
  - "0161"
  - "0162"
  - "0022"
  - "0058"
  - "0133"
---

# 0163: Draft Symbols From Changed Lines And Name The Hooked Session In Mid-Turn Checks

## Summary

Drafts now list only the symbols a diff touched. Every extractor reports
where each symbol sits, `getChangedLineRanges` reads the changed lines from
`git diff --unified=0`, and a draft keeps a file's symbol only when a changed
line falls inside it. A line inside a subsection counts only for the
innermost heading, and an edit outside every symbol leaves the anchor as a
TODO. Headings inside fenced code are no longer read as symbols.

`ledger ci` now lists each failing file in its text report. When an active
hooked session touched a failing file, `ci`, `coverage`, and `docs impact`
name the session and its draft receipt and tell the agent to finish that
draft instead of running `ledger new`. The shipped skill describes that
mid-turn step. Product notes 0160 and 0161 are resolved.

## Why

The second live Kore session (0162) showed both problems. Its hook draft
anchored a one-line `CHANGELOG.md` edit to every heading in the file, because
drafts kept a file's first twelve symbols whatever changed. That agent also
ran `ledger ci` before its turn ended and saw coverage and docs impact fail
with nothing but counts. It worked out that the Stop hook would draft the
receipt later. An agent that took the failure literally would have created
the duplicate receipt B010 set out to prevent.

The checks still fail mid-turn on purpose. An unfinished receipt must block
`ledger ci`, so the hint only points to the draft. GitHub output leaves the
hints out, because a CI run has no live session, and a committed active
session record there would only mislead.

## Changed Files

### Symbol spans

- Files: `src/symbols.ts`, `src/index.ts`, `test/symbols.test.ts`
- Changed: `LedgerSymbolExtraction` gained `spans`.
  `extractMarkdownSymbolSpans` gives each heading its section up to the next
  heading of the same or a higher level and skips fenced code.
  `extractTypeScriptSymbolSpans` starts a declaration at its doc comment, and
  `extractCodeSymbolSpansWithRegex` runs a declaration to the next one.
  `symbolsTouchedByLines` returns the names whose own lines hold a changed
  line; a heading owns its lines up to its first subsection. The span
  functions are exported from the package root.
- Anchor: `LedgerSymbolSpan`, `symbolsTouchedByLines`,
  `extractMarkdownSymbolSpans`, `extractCodeSymbolSpansWithRegex`
- On conflict: Keep spans in file order; `symbolsTouchedByLines` reads the
  next span to find a heading's first subsection.

### Changed lines and drafts

- Files: `src/git.ts`, `src/newEntry.ts`
- Changed: `getChangedLineRanges` runs
  `git --literal-pathspecs diff --unified=0 --relative` against HEAD, or the
  index with `staged`, and `parseChangedLineRanges` reads the new-side hunk
  ranges. It unquotes C-quoted paths, drops the tab Git appends to a path
  with a space, and leaves out added, deleted, and hunkless files. A deletion
  counts as a change to the line before it. `collectChangedSymbols` filters
  each modified file's symbols through those ranges. Added and untracked
  files, and every file when Git cannot answer, keep all their symbols up to
  the per-file cap.
- Anchor: `getChangedLineRanges`, `parseChangedLineRanges`,
  `collectChangedSymbols`, `changedLinesFor`
- On conflict: Keep the fallback to all symbols when Git cannot report
  lines; draft creation must never fail on symbol work.

### Hooked-session hints and the ci report

- Files: `src/sessions.ts`, `src/ci.ts`,
  `src/operations/definitions/changes.ts`, `src/skills.ts`,
  `.agents/skills/ledger/SKILL.md`, `test/ci.test.ts`,
  `test/fixtures/operations-contract.json`
- Changed: `sessionDraftHints` matches failing files to active,
  unexpired sessions that have a host. Each hint names the session, its
  linked draft, and whether the draft already lists the files. `runCiChecks`
  returns the hints as `sessions`, and `formatCiText` prints the checks, up to
  20 issues, and the hints. With `--github`, the text keeps only the checks
  because annotations name every failure. `coverage` and `docs impact` return
  and print the same hints. The operations contract gains the additive,
  required `sessions` output field on `ci`, `coverage`, and `docs.impact`.
  The skill's draft lifecycle gains a Mid-turn step, and drafts are
  described as taking symbols from the changed lines.
- Anchor: `sessionDraftHints`, `SessionDraftHint`, `formatCiText`,
  `sessionHintsSchema`, `Draft receipt lifecycle`
- On conflict: Keep the checks failing while a draft is unfinished, and keep
  hints out of GitHub annotations and summaries.

### Docs, the README card, and tests

- Files: `docs/ARCHITECTURE.md`, `assets/readme/ready.svg`,
  `test/draftFit.test.ts`
- Changed: the architecture doc describes spans, the changed-line filter,
  the ci text report, and the hints. The `ready` card was regenerated: the
  demo's hook draft now lists only `jitteredDelayMs`, so its TODO markers
  sit two lines higher. The new test file covers spans, hunk parsing, Git
  line ranges in a nested project, drafts for a one-line Markdown edit, a
  one-function edit, an import-only edit, and a new file, plus the hints.
- Anchor: `Drafting from Git diffs stays conservative`, `CI Summary`
- On conflict: Regenerate the card with `node scripts/readme-assets.mjs`
  rather than editing it.

## Behavior And UX Impact

A hook draft or `ledger new --from-diff` names the functions, declarations,
or sections the change actually touched, and leaves a TODO when none did, so
an agent no longer has to strip wrong anchors. `ledger ci` shows which files
fail and why without `--json`. Mid-turn, it names the session whose hook will
draft their receipt, or the draft to finish. JSON consumers of `ci`,
`coverage`, and `docs impact` get a new `sessions` array.

## Invariants

- A draft keeps a modified file's symbol only when a changed line falls in
  that symbol's own lines.
- Added and untracked files, and all files when Git cannot report lines,
  keep their symbols up to the per-file cap.
- Headings inside fenced code are not symbols.
- Session hints never make a failing check pass, and GitHub annotations and
  summaries never include them.
- Only active, unexpired sessions with a host produce hints.

## Verification

- `npm run typecheck`
- `npx vitest run test/draftFit.test.ts test/symbols.test.ts test/newEntry.test.ts test/ci.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node scripts/readme-assets.mjs`, then a review of the one-line change to
  `assets/readme/ready.svg`
- `node dist/cli.js ready 0163`
- `npm run ci`

## Notes

This receipt was drafted with `ledger new --from-diff` on its own diff. It
anchored the skill to `Draft receipt lifecycle`, the architecture doc to its
changed sections, and each source file to the declarations that changed. It
left TODO anchors on `src/index.ts` and on the test files, whose edits sit
inside `describe` calls rather than declarations. Resolves product notes 0160
and 0161.
