---
id: "0023"
kind: "change"
title: "Add conflict report output"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "conflict", "reports", "agents", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/conflict.ts"
  - "test/conflict.test.ts"
  - ".ledger/entries/0023-conflict-report-output.md"
symbols:
  - "formatConflictReport"
  - "writeConflictReport"
  - "conflictCommand"
docs:
  - "docs/ROADMAP.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["689eb72"]
---

# 0023: Add Conflict Report Output

## Summary

Adds Markdown report output for conflict guidance. `ledger conflict <path...>
--write-report` now writes `.ledger/reports/conflict.md` while preserving the
existing console and JSON workflows.

## Why

Phase 4 calls for a conflict report artifact. Persisting the guidance makes it
easier to review, hand off, and attach conflict context to agent or human merge
work without rerunning the command.

## Changed Files

### src/conflict.ts

- What changed: Adds `formatConflictReport` and `writeConflictReport` for
  deterministic Markdown output from conflict target models.
- Anchor: `formatConflictReport`
- On conflict: Keep the report derived from the same model used by console and
  JSON output.

### src/cli.ts

- What changed: Adds `--write-report` to `ledger conflict` and includes the
  report path in JSON output when a report is written.
- Anchor: `conflictCommand`
- On conflict: Preserve existing default console behavior and make report
  writing opt-in.

### test/conflict.test.ts

- What changed: Covers Markdown report rendering for matching and missing
  conflict targets.
- Anchor: `formatConflictReport`
- On conflict: Keep tests focused on stable report structure and guidance
  content.

### README.md

- What changed: Documents the report-writing conflict command shape.
- Anchor: `Command Map`
- On conflict: Keep command examples aligned with CLI flags.

## Behavior And UX Impact

Users can persist conflict guidance as a reviewable Markdown artifact while
still using quick terminal output for ad hoc checks.

## Invariants

- Report writing must be opt-in.
- JSON output must remain machine-readable and include `reportPath` when a
  report is written.
- Conflict report content must come from Ledger records, not generated guesses.

## Verification

- `npm run typecheck`
- `npx vitest run test/conflict.test.ts test/cliHelp.test.ts`

## Notes

Future work can add per-target report filenames or merge hook helpers.
