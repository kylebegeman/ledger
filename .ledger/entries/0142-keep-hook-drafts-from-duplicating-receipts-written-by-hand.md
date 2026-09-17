---
id: "0142"
kind: "change"
title: "Keep hook drafts from duplicating receipts written by hand"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "hooks"
  - "sessions"
files:
  - "src/sessions.ts"
  - "src/newEntry.ts"
  - "src/skills.ts"
  - "test/hooks.test.ts"
  - "test/sessions.test.ts"
  - "docs/ARCHITECTURE.md"
  - ".agents/skills/ledger/SKILL.md"
symbols:
  - "draftSessionReceipt"
  - "pendingWorkingTreePaths"
  - "excludeFiles"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's hook section and the shipped skill describe which receipts count as linked and which paths a hook draft takes."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0133"
  - "0137"
  - "0141"
release: "v0.8.0"
---

# 0142: Keep Hook Drafts From Duplicating Receipts Written By Hand

## Summary

The Stop and SessionEnd hooks no longer draft a receipt for work another
receipt already records. A change entry counts as linked when either the
session or the entry names the other in `related`. With Git, only touched
paths that still differ from HEAD are pending, and a change entry that is new
or modified in the working tree covers paths the way a linked one does. A new
draft takes its areas from its own files, and its diff-derived file list
leaves out what the covering receipts list and their own record files.

## Why

At the end of the 0.8.0 release turn in this repository, with everything
committed under receipts 0137 and 0141, the Stop hook drafted a receipt
listing seven files those receipts cover. The session record listed neither
receipt because both were written with `ledger new`, and 0137 named the
session only from its own side. The draft had no diff to describe, so its
Changed Files section kept the template sample, and its title and areas
covered every area the session had touched. The prompt notice then told the
agent to finish work that was already recorded.

## Changed Files

### Drafting rule

- Files: `src/sessions.ts`, `src/newEntry.ts`
- Changed: `draftSessionReceipt` links entries in either direction, filters
  touched paths through `pendingWorkingTreePaths` when `fromDiff` is set,
  counts working-tree change entries as covering, returns undefined when
  nothing is pending and nothing is linked, and infers draft areas from the
  uncovered paths. `CreateEntryOptions` gains `excludeFiles`, coverage
  patterns that `draftChangeEntry` drops from the Git-derived list.
- Anchor: `draftSessionReceipt`, `pendingWorkingTreePaths`
- On conflict: Without Git or without `fromDiff`, every touched path stays
  pending so non-Git workspaces keep drafting.

### Tests, skill, and docs

- Files: `test/hooks.test.ts`, `test/sessions.test.ts`, `src/skills.ts`,
  `.agents/skills/ledger/SKILL.md`, `docs/ARCHITECTURE.md`
- Changed: a regression test covers a hand-written working-tree receipt, a
  committed path, a mixed draft that lists only the uncovered file, and a
  committed receipt that names the session; three tests now change a file
  before touching it or commit the first session's work, because a touched
  path without a diff is no longer pending. The skill and the architecture
  doc state the rule. The session record tests carry a 30 second suite
  timeout, because their chains of file transactions take 2 to 5 seconds
  each on the Windows runners and two of them passed the 5 second default.
- Anchor: `leaves committed paths and paths another receipt covers out of hook drafts`, `session records`
- On conflict: Keep a test that fails when a covered or committed path is
  drafted again.

## Behavior And UX Impact

Writing a receipt with `ledger new` during a hooked session, or committing
work with its receipt, no longer produces a second draft or a prompt notice
for it. A hook draft names only the files and areas it describes. Two sessions
editing the same file in one working tree share the first session's draft
instead of each drafting their own.

## Invariants

- A touched path with no difference from HEAD is never drafted when Git
  answers.
- A path listed by a linked receipt, or by a receipt new or modified in the
  working tree, is never added to a new draft.
- A new draft never lists another receipt's record file.
- Without Git, hook drafting behaves as it did in 0133.

## Verification

- `npx vitest run test/hooks.test.ts test/sessions.test.ts test/newEntry.test.ts`
- `npx vitest run test/skills.test.ts test/operations.test.ts`
- `npm run ci`

## Notes

Found while preparing 0.8.0: the hook-drafted receipt was deleted as a
duplicate and its id reused here. Product note 0122 first recorded hook drafts
colliding with hand-written receipts.
