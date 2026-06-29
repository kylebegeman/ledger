---
id: "0016"
kind: "change"
title: "Polish git-aware entry drafting"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "git", "drafting", "tests"]
files:
  - ".ledger/templates/change.md"
  - "src/git.ts"
  - "src/newEntry.ts"
  - "src/workspace.ts"
  - "test/git.test.ts"
  - "test/newEntry.test.ts"
symbols:
  - "getChangedFileDetails"
  - "parseStatusLine"
  - "parseNameStatusLine"
  - "createChangeEntry"
  - "renderChangedFiles"
docs:
  - "docs/IMPLEMENTATION_PLAN.md"
release: "v0.1.1"
commits: ["c9b9d07"]
---

# 0016: Polish Git-Aware Entry Drafting

## Summary

Improves `ledger new --from-diff` by using Git status details, preserving quoted
YAML frontmatter strings, adding docs references for changed docs files, and
rendering status-aware changed-file starter sections.

## Why

Generated drafts should be useful without pretending to be complete. The first
drafting flow listed paths, but it did not retain Git status context or populate
docs references. The E2E test also exposed that quoted placeholders could become
unquoted YAML, which made numeric-looking IDs parse as numbers.

## Changed Files

### src/git.ts

- What changed: Adds `getChangedFileDetails` plus reusable status parsers for
  short status and staged name-status output.
- Anchor: `getChangedFileDetails`
- On conflict: Keep `getChangedFiles` as the simple path-only API and layer
  richer details beside it.

### src/newEntry.ts

- What changed: Uses Git change details for from-diff drafting, preserves YAML
  string quotes, records changed docs paths, and renders richer changed-file
  starter bullets.
- Anchor: `createChangeEntry`
- On conflict: Keep generated prose clearly marked as TODO so drafts are not
  mistaken for reviewed records.

### src/workspace.ts and .ledger/templates/change.md

- What changed: Adds `docs: []` to the default change-entry template.
- Anchor: `changeTemplate`
- On conflict: Keep docs references in frontmatter so docs audit and docs impact
  can consume them.

### test/git.test.ts

- What changed: Adds coverage for Git status parsing.
- Anchor: `parseStatusLine`
- On conflict: Keep parser expectations aligned with Git output formats used by
  the helper.

### test/newEntry.test.ts

- What changed: Adds a real temporary Git repo test for from-diff drafting.
- Anchor: `createChangeEntry`
- On conflict: Keep this test focused on generated entry content, not the whole
  CLI workflow.

## Behavior And UX Impact

`ledger new --from-diff` now creates more actionable drafts with file status
context and docs metadata. The generated entries validate more reliably because
string frontmatter stays quoted.

## Invariants

- Path-only Git callers can keep using `getChangedFiles`.
- From-diff drafts include all changed paths in `files`.
- Changed docs paths are also listed in `docs`.
- Generated changed-file prose remains a TODO starter, not finalized history.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js ci`
- `node dist/cli.js coverage`

## Notes

Future drafting work can infer likely areas and symbols from changed paths.
