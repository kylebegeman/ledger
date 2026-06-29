---
id: "0045"
kind: "change"
title: "Improve git-aware drafting"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["drafting", "git", "docs", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/newEntry.ts"
  - "test/newEntry.test.ts"
  - ".ledger/entries/0045-smarter-diff-drafting.md"
symbols:
  - "inferAreas"
  - "draftChangePrompt"
  - "draftDocsImpact"
  - "createChangeEntry"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
---

# 0045: Improve Git-Aware Drafting

## Summary

Improves `ledger new --from-diff` so drafts infer areas from changed paths and
include status-aware per-file prompts plus docs-impact guidance.

## Why

Draft entries should help agents complete useful records quickly without
pretending generated prose is final. Inferred areas and contextual prompts
reduce boilerplate while keeping the author responsible for the actual change
story.

## Changed Files

### src/newEntry.ts

- What changed: Adds inferred areas, path/status-aware change prompts, and
  docs-impact prompts to generated changed-file sections.
- Anchor: `inferAreas`
- On conflict: Keep generated prose clearly marked as TODO and avoid inventing
  final change explanations.

### test/newEntry.test.ts

- What changed: Adds coverage for inferred areas and richer draft prompts.
- Anchor: `createChangeEntry`
- On conflict: Preserve fixture coverage for TypeScript symbols, Markdown
  headings, docs references, and docs-impact hints.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents smarter drafting behavior and roadmap status.
- Anchor: `Git-Aware Drafting`
- On conflict: Keep docs clear that drafting assists agents but does not replace
  review.

## Behavior And UX Impact

Agents get more complete draft entries from diffs, including likely areas,
anchors, docs impact prompts, and better per-file TODO guidance.

## Invariants

- Explicit `--area` values override inferred areas.
- Generated prose remains marked as TODO.
- Docs files are listed in `docs` frontmatter.
- Drafting remains deterministic from changed file paths and file contents.

## Verification

- `npm run typecheck`
- `npx vitest run test/newEntry.test.ts`
- `npm run build`
- `node dist/cli.js validate`

## Notes

Future drafting can add parser-backed symbol extraction and richer area rules.
