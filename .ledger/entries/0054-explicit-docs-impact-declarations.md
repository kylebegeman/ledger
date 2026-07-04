---
id: "0054"
kind: "change"
title: "Explicit docs impact declarations"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "docs"
  - "validation"
  - "cli"
files:
  - ".ledger/templates/change.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
  - "src/cli.ts"
  - "src/docsImpact.ts"
  - "src/documents.ts"
  - "src/types.ts"
  - "src/validate.ts"
  - "src/workspace.ts"
  - "test/docsImpact.test.ts"
symbols:
  - "docsImpact"
  - "buildDocsImpact"
  - "formatDocsImpactReport"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Documented explicit docs-impact declarations and template behavior."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/DOCS_RELATIONSHIP.md"
    - "docs/IMPLEMENTATION_PLAN.md"
    - "docs/SCHEMA.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0054: Explicit Docs Impact Declarations

## Summary

Added explicit `docsImpact` frontmatter declarations so source changes can mark
docs as updated, not needed, or unaffected with a reviewed reason. The docs
impact report now lists declarations and ignores TODO placeholder reasons.

## Why

The previous guard only accepted direct docs changes or changed entries that
referenced docs. That worked, but it did not distinguish "reviewed and no docs
needed" from "forgot to think about docs." Explicit declarations make the
decision durable and agent-readable without forcing unnecessary docs edits.

## Changed Files

### src/docsImpact.ts and src/types.ts

- What changed: Added `docsImpact` declaration parsing, report output, and typed
  declaration models.
- Anchor: `buildDocsImpact`, `formatDocsImpactReport`, `LedgerDocsImpactDeclaration`
- On conflict: Keep TODO reasons from satisfying `not-needed` or `none`
  declarations.

### src/documents.ts and src/validate.ts

- What changed: Added `docsImpact` to known frontmatter so declarations are not
  treated as extension noise.
- Anchor: `docsImpact`
- On conflict: Preserve compatibility with existing `docs` arrays.

### .ledger/templates/change.md and src/workspace.ts

- What changed: Added a TODO `docsImpact` block to new change templates.
- Anchor: `docsImpact.status`
- On conflict: Keep the default reason as a TODO so drafts still need review.

### src/cli.ts

- What changed: Docs-impact summary output now includes explicit declaration
  count.
- Anchor: `ledger docs impact`
- On conflict: Keep human output compact while preserving JSON detail.

### README.md and docs

- What changed: Documented `docsImpact.status`, reasons, and how declarations
  satisfy docs-impact checks.
- Anchor: `Docs Impact Declaration`
- On conflict: Keep docs clear that direct docs edits and `docs` references
  remain valid.

### test/docsImpact.test.ts

- What changed: Covered reviewed `not-needed` declarations, ignored TODO
  declarations, and report rendering.
- Anchor: `buildDocsImpact`
- On conflict: Preserve the TODO guard.

## Behavior And UX Impact

Projects can now use reviewed `docsImpact` declarations for source changes that
do not require durable docs changes. Agents can inspect the reason instead of
guessing whether docs were forgotten.

## Invariants

- Existing `docs` references still satisfy docs-impact checks.
- Direct docs edits still satisfy docs-impact checks.
- TODO `not-needed` or `none` reasons do not satisfy docs-impact checks.
- Docs-impact declarations are source metadata, not generated output.

## Verification

- `npm run typecheck`
- `npx vitest run test/docsImpact.test.ts test/ci.test.ts test/mcp.test.ts test/cliE2e.test.ts test/newEntry.test.ts test/validate.test.ts`

## Notes

Future policy work can add stricter validation warnings for malformed
`docsImpact` objects. This slice keeps the behavior additive and compatible.
