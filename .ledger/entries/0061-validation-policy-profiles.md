---
id: "0061"
kind: "change"
title: "Validation policy profiles"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "validation"
  - "config"
  - "architecture"
files:
  - ".ledger/config.yaml"
  - ".ledger/entries/0061-validation-policy-profiles.md"
  - "docs/SCHEMA.md"
  - "src/config.ts"
  - "src/types.ts"
  - "src/validate.ts"
  - "src/workspace.ts"
  - "test/config.test.ts"
  - "test/validate.test.ts"
symbols:
  - "LedgerValidationProfile"
  - "validationWarningLevel"
  - "validation.profile"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Documented validation profiles and strict warning escalation."
  docs:
    - "docs/SCHEMA.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0061: Validation Policy Profiles

## Summary

Added `validation.profile` with `standard` and `strict` profiles. Standard keeps
existing behavior; strict escalates validation warnings to errors.

## Why

B005 calls for validation policy profiles that are additive and do not break
existing records. A profile-level severity control lets stricter projects fail
CI on quality and reference findings without changing every individual
validation flag.

## Changed Files

### src/types.ts, src/config.ts, src/workspace.ts, .ledger/config.yaml

- What changed: Added the `LedgerValidationProfile` type, defaulted config to
  `standard`, validated allowed profile names, and exposed the setting in
  scaffolded config.
- Anchor: `validation.profile`
- On conflict: Keep `standard` as the default profile.

### src/validate.ts

- What changed: Routed validation warning creation through the active profile so
  `strict` turns warnings into errors.
- Anchor: `validationWarningLevel`
- On conflict: Required structural validation errors should stay errors in all
  profiles.

### test/config.test.ts and test/validate.test.ts

- What changed: Covered default profile parsing, invalid profile rejection, and
  strict escalation behavior.
- Anchor: `strict profile`
- On conflict: Preserve standard-profile tests as the backwards compatibility
  contract.

### docs/SCHEMA.md

- What changed: Documented `standard` and `strict` validation profiles.
- Anchor: `Validation Profiles`
- On conflict: Keep the docs clear that individual validation booleans still
  decide whether checks run.

## Behavior And UX Impact

Existing workspaces behave the same because `standard` is the default. Projects
that opt into `strict` get CI-failing validation errors for quality,
unknown-frontmatter, and missing-reference findings.

## Invariants

- Standard profile preserves existing warning behavior.
- Strict profile escalates warnings to errors without changing which checks run.
- Invalid profile names fail config parsing.

## Verification

- `npm test -- --run test/config.test.ts test/validate.test.ts`
- `npm run typecheck`

## Notes

Future profiles can add more policy dimensions after there are concrete project
needs. For now, severity escalation is the smallest useful profile boundary.
