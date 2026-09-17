---
id: "0143"
kind: "change"
title: "Match agents.command in the verification allowlist"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "verification"
  - "agents"
files:
  - "src/verify.ts"
  - "src/operations/definitions/verify.ts"
  - "test/verify.test.ts"
  - "docs/SCHEMA.md"
symbols:
  - "parseVerificationBullet"
  - "VerificationCommandOptions"
  - "configuredLedgerPrefix"
docs:
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema doc's verification and agents sections say how allowlist patterns treat agents.command, and the verify help text says the same."
  docs:
    - "docs/SCHEMA.md"
commits: []
related:
  - "0115"
  - "0132"
  - "0140"
---

# 0143: Match Agents.command In The Verification Allowlist

## Summary

`ledger verify --run` now understands `agents.command`. When it is not plain
`ledger`, a Verification command written with it, such as
`npx ledger validate` or a pinned `npx --yes @kylebegeman/ledger@0.8.0 ready`,
matches the same `ledger` pattern in `verification.allow`, and a bare
`ledger` command runs through the configured command instead of whatever
`ledger` is on the PATH. `parseVerificationBullet` takes the command through
a new optional `VerificationCommandOptions` argument.

## Why

Product note 0140: the skill and the `AGENTS.md` block teach agents to write
commands with `agents.command`, but the allowlist only knew `ledger` and
`node dist/cli.js`, so those bullets were skipped as not allowed and never
produced evidence in repositories that run Ledger through npx. Rewriting the
allowlist on `hooks install --command` was rejected because the allowlist is
a hand-reviewed security boundary; matching keeps it literal.

## Changed Files

### Matching and execution

- Files: `src/verify.ts`, `src/operations/definitions/verify.ts`
- Changed: the written argv is allowed when it matches a pattern directly or
  when its configured prefix, replaced by `ledger`, matches; the returned
  `argv` swaps a bare leading `ledger` for the configured words unless the
  command already starts with them. The verify help text describes both.
- Anchor: `parseVerificationBullet`, `configuredLedgerPrefix`
- On conflict: A command outside the allowlist in both forms stays skipped,
  and plain `ledger` or an unset command keeps the literal behavior.

### Tests and docs

- Files: `test/verify.test.ts`, `docs/SCHEMA.md`
- Changed: parsing cases for npx, a pinned release, `node dist/cli.js`, a
  prefix that starts with `ledger`, and refusals; an end-to-end run with a fake
  Ledger script as `agents.command` that records which arguments ran; the
  schema doc's verification and agents sections.
- Anchor: `runs bare ledger bullets through agents.command and accepts bullets written with it`
- On conflict: Keep the end-to-end case asserting the arguments the
  configured command received.

## Behavior And UX Impact

In a repository with `agents.command: npx ledger`, `verify --run` runs
`npx ledger validate` bullets and records their evidence, and a receipt that
says `ledger validate` runs the repository's Ledger rather than an unrelated
`ledger` program.

## Invariants

- A command is allowed only when it, or its Ledger form under the configured
  prefix, matches a `verification.allow` pattern.
- Evidence records the command as written in the receipt.
- With `agents.command` unset or plain `ledger`, parsing and execution are
  unchanged.

## Verification

- `npx vitest run test/verify.test.ts`
- `npx vitest run test/operations.test.ts test/cliHelp.test.ts`
- `npm run ci`

## Notes

Resolves product note 0140.
