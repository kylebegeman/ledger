---
id: "0177"
kind: "change"
title: "Review a change set with ledger context"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "context"
  - "mcp"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "src/context.ts"
  - "src/index.ts"
  - "src/operations/definitions/changes.ts"
  - "src/operations/definitions/server.ts"
  - "src/operations/registry.ts"
  - "src/unstable.ts"
  - "test/context.test.ts"
  - "test/fixtures/operations-contract.json"
  - "test/publicApi.test.ts"
symbols:
  - "buildChangeContext"
  - "formatChangeContext"
  - "fitToBudget"
  - "contextOperation"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The README lists ledger context, and the architecture doc describes how it composes the existing checks and fits its budget."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
commits: []
decisions:
  - "D006"
related:
  - "0176"
release: "v0.9.2"
---

# 0177: Review a change set with ledger context

## Summary

`ledger context` prints one review packet for a change set: the working
tree by default, `--staged`, or `--base` with `--head`.

- **Per changed file.** The Git change, coverage, docs impact, and the
  receipts in the change that list it. Also the newest records that
  mention it, with their invariants and conflict rules. Records that name
  the file come before pattern matches, and session records are left out.
- **For the change.** Its receipts with their ready state, issues,
  verification commands, and evidence freshness. Also the decisions and
  backlog items those receipts link, and any hooked session that will
  draft a missing receipt.
- **Budget.** The Markdown fits a token budget (`--budget`, default 2,400)
  by dropping per-file details from the last file backward.
- **Surfaces.** It is also an API route, a read-only MCP tool
  (`ledger_context`), and `buildChangeContext` and `formatChangeContext` in
  the library.

## Why

D006 reshaped the proposed change-set review workbench into a `context`
operation and API route, and it was still unbuilt. Reviewers and agents
otherwise ran `coverage --explain`, `docs impact`, `packet` per file, and
`ready` separately and stitched the results together.

Rejected:

- **A UI workbench.** D006 dropped it in favor of the operation.
- **New retrieval logic.** The packet composes the existing coverage, docs
  impact, readiness, retrieval, and evidence results, so it cannot disagree
  with them.

## Changed Files

### Context

- Files: `src/context.ts`
- Changed:
  - `buildChangeContext` gathers the per-file and per-receipt data.
  - `fitToBudget` drops details from the end and marks those files
    `detailsOmitted`.
  - `formatChangeContext` renders the Markdown, with sections for the
    receipts, each file, the linked records, and the verification.
- Anchor: `buildChangeContext`, `formatChangeContext`, `fitToBudget`
- On conflict: Keep composing the existing checks; do not add a second
  coverage or retrieval rule here.

### Operation, exports, and docs

- Files: `src/operations/definitions/changes.ts`,
  `src/operations/registry.ts`, `src/operations/definitions/server.ts`,
  `src/index.ts`, `src/unstable.ts`, `README.md`, `docs/ARCHITECTURE.md`
- Changed:
  - `contextOperation` is registered after `ci`, with an MCP summary of
    counts.
  - The library exports the two functions and their types.
  - The README lists the command, and the architecture doc has a Change
    Context section.
  - The `mcp` help and the architecture tool list name `context`.
- Anchor: `contextOperation`, `Change Context`
- On conflict: Keep the operation read-only.

### Tests and contract

- Files: `test/context.test.ts`, `test/publicApi.test.ts`,
  `test/fixtures/operations-contract.json`
- Changed:
  - Tests cover a working tree change with an exact receipt, an older
    exact record, a pattern record, and a linked decision.
  - They also cover budget truncation, staged and merge-base ranges, the
    CLI, the MCP tool, and an unchanged tree.
  - The public API test pins `buildChangeContext`, and the contract adds
    `context`.
- Anchor: `ledger context`
- On conflict: Keep the ordering test for exact and pattern matches.

## Behavior And UX Impact

A new read-only command, API route, and MCP tool. Nothing else changes.

## Invariants

- `context` never writes.
- Its coverage and docs impact figures equal `coverage` and `docs impact`
  for the same range.
- Within a file, records that name the file come first.
- The Markdown stays within the budget unless the unmovable summary alone
  exceeds it.

## Verification

- `npx vitest run test/context.test.ts test/operations.test.ts test/publicApi.test.ts`
- `npm run typecheck`
- `npm run ci`

## Notes

Session records are excluded from the per-file records because the summary
already names active hooked sessions.
