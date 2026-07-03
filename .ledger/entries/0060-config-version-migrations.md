---
id: "0060"
kind: "change"
title: "Config version migrations"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "config"
  - "architecture"
  - "tests"
files:
  - ".ledger/entries/0060-config-version-migrations.md"
  - "docs/SCHEMA.md"
  - "src/config.ts"
  - "test/config.test.ts"
symbols:
  - "currentConfigVersion"
  - "migrateLedgerConfigObject"
  - "LedgerConfigMigration"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Documented config version support, legacy version migration, and newer-version rejection."
  docs:
    - "docs/SCHEMA.md"
backlog:
  - "B005"
commits: []
---

# 0060: Config Version Migrations

## Summary

Added explicit config schema version support and an in-memory migration path for
legacy `version: 0` config objects.

## Why

B005 calls for config schema versioning and migrations. Ledger already required
a positive config version after defaults were merged, but it did not have a
dedicated migration boundary or clear handling for config files written by a
newer package version.

## Changed Files

### src/config.ts

- What changed: Added `currentConfigVersion`, migration metadata, legacy
  `version: 0` to `version: 1` migration, and explicit rejection for newer
  config versions.
- Anchor: `migrateLedgerConfigObject`
- On conflict: Run migrations before defaults are merged and keep migration
  functions free of filesystem writes.

### test/config.test.ts

- What changed: Covered legacy migration, migration metadata, source object
  immutability, and newer-version rejection.
- Anchor: `migrates legacy version 0`
- On conflict: Keep tests focused on object-level config parsing rather than
  workspace discovery.

### docs/SCHEMA.md

- What changed: Documented the supported config version and migration behavior.
- Anchor: `Config Versioning`
- On conflict: Keep user-facing docs clear that migrations happen in memory.

## Behavior And UX Impact

Existing version 1 config files continue to load unchanged. Legacy version 0
objects can be interpreted through the migration boundary, and future-version
config files fail early with a specific error.

## Invariants

- Config migrations must run before default merging.
- Config migration helpers must not mutate the source object.
- Config files newer than the installed package supports must fail loudly.

## Verification

- `npm test -- --run test/config.test.ts`
- `npm run typecheck`

## Notes

This creates the migration structure for future schema updates without adding a
file-rewriting command yet.
