---
id: "0014"
kind: "change"
title: "Harden config validation"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["config", "validation", "tests", "docs"]
files:
  - "docs/SCHEMA.md"
  - "src/config.ts"
  - "test/config.test.ts"
symbols:
  - "parseLedgerConfig"
  - "validatePartialConfig"
docs:
  - "docs/SCHEMA.md"
commits: []
---

# 0014: Harden Config Validation

## Summary

Adds runtime validation for `.ledger/config.yaml` so malformed nested config
values fail with explicit errors instead of being silently merged into defaults.

## Why

Config is a system boundary. Before public use, Ledger should reject bad config
shapes such as string-valued sections, non-string glob arrays, or empty required
section lists. Silent fallback makes projects look healthy when a user actually
misconfigured the tool.

## Changed Files

### src/config.ts

- What changed: Adds `parseLedgerConfig`, partial override shape validation, and
  merged config validation.
- Anchor: `parseLedgerConfig`
- On conflict: Keep validation strict at the boundary while preserving valid
  partial config merging with defaults.

### test/config.test.ts

- What changed: Adds tests for valid partial merges and malformed config
  failures.
- Anchor: `parseLedgerConfig`
- On conflict: Keep error messages field-specific enough for users to fix
  config without reading source.

### docs/SCHEMA.md

- What changed: Documents config validation expectations.
- Anchor: `Config Validation`
- On conflict: Keep docs aligned with runtime validation, especially required
  section and glob-list shapes.

## Behavior And UX Impact

Projects with malformed config now get immediate actionable errors during
workspace discovery. Valid partial config continues to merge with defaults.

## Invariants

- `.ledger/config.yaml` must be a YAML object.
- Known nested sections must have the expected primitive shapes.
- `ids.entryWidth` and `version` must be positive integers after merge.
- Required section lists must not be empty after merge.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js ci`
- `node dist/cli.js coverage`

## Notes

Future config work can add unknown-key warnings, but this slice only rejects
malformed known fields.
