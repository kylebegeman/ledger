---
id: "0022"
kind: "change"
title: "Extract symbols for diff drafts"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "git", "drafting", "symbols", "tests"]
files:
  - "README.md"
  - "src/newEntry.ts"
  - "test/newEntry.test.ts"
  - ".ledger/entries/0022-draft-symbol-extraction.md"
symbols:
  - "createChangeEntry"
  - "collectChangedSymbols"
  - "extractFileSymbols"
  - "extractCodeSymbols"
  - "extractMarkdownSymbols"
docs:
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["061d908"]
---

# 0022: Extract Symbols For Diff Drafts

## Summary

Adds lightweight symbol extraction to `ledger new --from-diff`. Draft entries
now populate `symbols:` from changed TypeScript/JavaScript declarations and
Markdown headings, and changed-file anchors include detected symbols.

## Why

Phase 2 calls for initial TypeScript and Markdown symbol extraction. Even a
deterministic first pass makes draft entries more useful for future query,
index, conflict, and agent retrieval workflows.

## Changed Files

### src/newEntry.ts

- What changed: Reads changed source and Markdown files during `--from-diff`,
  extracts symbol candidates, writes them to frontmatter, and uses per-file
  symbols as changed-file anchors.
- Anchor: `collectChangedSymbols`
- On conflict: Keep extraction best-effort and deterministic. Failures to read
  an individual file should not block draft creation.

### test/newEntry.test.ts

- What changed: Extends the draft workflow test to cover TypeScript exports,
  Markdown headings, symbols frontmatter, and per-file anchors.
- Anchor: `createChangeEntry`
- On conflict: Keep the test using a real temporary Git repo so git status and
  file reads exercise the actual workflow.

### README.md

- What changed: Documents that `ledger new --from-diff` includes detected
  symbols in generated drafts.
- Anchor: `Record A Change`
- On conflict: Keep README behavior descriptions aligned with actual draft
  output.

## Behavior And UX Impact

Draft entries require less manual bookkeeping and immediately become more useful
for `ledger query --symbol`, generated symbol indexes, and agent context lookup.

## Invariants

- Draft creation must not fail only because symbol extraction cannot read a
  changed file.
- Deleted files should not be read for symbols.
- Extracted symbols must remain YAML-safe in generated frontmatter.

## Verification

- `npm run typecheck`
- `npx vitest run test/newEntry.test.ts`

## Notes

Future extraction can use language-aware parsers, but this slice intentionally
uses simple deterministic patterns.
