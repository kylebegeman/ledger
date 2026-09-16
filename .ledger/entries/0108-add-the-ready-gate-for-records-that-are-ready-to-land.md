---
id: "0108"
kind: "change"
title: "Add the ready gate for records that are ready to land"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "validation"
  - "cli"
files:
  - "src/ready.ts"
  - "src/operations/definitions/readiness.ts"
  - "src/authoring.ts"
  - "src/docsImpact.ts"
  - "src/workspace.ts"
  - "src/operations/registry.ts"
  - "src/index.ts"
  - "test/ready.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/SCHEMA.md"
symbols:
  - "checkReadiness"
  - "templatePlaceholderLines"
  - "formatReadinessReport"
  - "readyOperation"
  - "readKindTemplate"
  - "docsImpactDeclaration"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema gains a Readiness section listing every check and the exit code; the README command map lists ledger ready."
  docs:
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D005"
related:
  - "0106"
  - "0107"
release: "v0.6.0"
---

# 0108: Add The Ready Gate For Records That Are Ready To Land

## Summary

`ledger ready` distinguishes a structurally valid draft from a record that is
ready to land. It checks draft change entries by default, or any records named
by id or path, or a `--kind` and `--status` selection. A record is ready when
validation is clean for it (errors and warnings, including missing `files` and
`docs` references), no line carries a `TODO:` marker, no line still equals a
line from the kind's template, every required section has a body, change
entries list Verification and Invariants bullets beyond the template, and the
`docsImpact` declaration is reviewed with docs named when it says `updated`.
The command exits 1 when anything is not ready and is exposed as the
`ledger_ready` MCP tool.

## Why

Backlog B007 asks for a gate that fails on a draft with TODO placeholders and
passes on a finished entry. Validation only checks structure, so a receipt
drafted by `ledger new --from-diff` or by the upcoming session hooks is valid
the moment it is written, which is exactly when it must not land. Reading the
placeholders from the project's own template keeps the check data-driven: a
project that customizes `.ledger/templates/change.md` gets its own placeholders
flagged without configuration. The `TODO` pattern only matches marker forms
such as `TODO:` so prose that discusses TODOs, like B007 itself, is not flagged.

## Changed Files

### Readiness module and operation

- Files: `src/ready.ts`, `src/operations/definitions/readiness.ts`
- Changed: selection by targets or kind and status, per-record validation
  issues, TODO and placeholder line scanning with line numbers, empty
  required sections, verification, invariants, and docs impact checks, and
  the `ready` operation with exit code 1 on failure.
- Anchor: `checkReadiness`
- On conflict: Placeholder bullets never satisfy Verification or Invariants;
  keep `templatePlaceholderLines` skipping headings and `{{variable}}` lines.

### Shared helpers

- Files: `src/authoring.ts`, `src/docsImpact.ts`, `src/workspace.ts`
- Changed: `readKindTemplate` resolves the project template or the built-in
  fallback for every kind; `docsImpactDeclaration` and the built-in template
  functions are exported.
- Anchor: `readKindTemplate`
- On conflict: The fallback for each kind must stay identical to what
  `ledger init` writes, since readiness compares records against it.

### Registry, tests, and docs

- Files: `src/operations/registry.ts`, `src/index.ts`, `test/ready.test.ts`,
  `test/fixtures/operations-contract.json`, `README.md`, `docs/SCHEMA.md`
- Changed: registration after `validate`, public exports, tests for a fresh
  draft, a finished entry, missing references, empty sections, updated docs
  impact without docs, and CLI selection; regenerated contract; docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Maintainers and hooks can ask whether a draft is ready before marking it
landed. A fresh `ledger new` draft fails with line-numbered reasons; the
receipts 0106 and 0107 in this repository pass. No other command changed.

## Invariants

- `ledger ready` with no arguments checks exactly the change entries whose
  status is `draft`.
- A record with any validation issue, TODO marker, or template placeholder is
  never reported ready.
- The exit code is 1 when any checked record is not ready and 0 otherwise,
  including when nothing is selected.

## Verification

- `npm run typecheck`
- `npx vitest run` (254 tests, including `test/ready.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js ready 0106 0107` and `node dist/cli.js ready B007` in this
  repository
- `npm run ci`

## Notes

Milestone three of 0.6 capture (B007). Next: `ledger hooks install --host
claude-code`, which drafts receipts on Stop and can point agents at `ready`.
