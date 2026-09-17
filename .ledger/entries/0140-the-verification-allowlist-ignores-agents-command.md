---
id: "0140"
kind: "product-note"
title: "The verification allowlist ignores agents.command"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "verification"
tags:
  - "dogfood"
---

# 0140: The verification allowlist ignores agents.command

## Context

Fact-checking the README quick start, which installs hooks with
`--command "npx ledger"`.

## Finding

`verification.allow` defaults to `ledger <check> **` and
`node dist/cli.js <check> **` patterns. `hooks install --command` saves
`agents.command` but leaves the allowlist alone, and `adopt` proposes checks
with the default `ledger` command because it runs before hooks are installed.
After the quick start, a Verification bullet written with the configured
command, such as `npx ledger validate`, is skipped by `ledger verify --run` as
not on `verification.allow`.

## Impact

The skill and the `AGENTS.md` block teach agents to write commands with
`agents.command`, so their Verification bullets never produce evidence in
repositories that run Ledger through npx.

## Recommendation

Treat a Verification command that starts with `agents.command` as the same
check as the bare `ledger` form when matching the allowlist, or have
`hooks install --command` add the prefixed Ledger checks to
`verification.allow` in the same transaction.

## Follow-ups

- Add a `verify --run` test with `agents.command: npx ledger`.
- Resolved: 0143 matches `agents.command` in the verification allowlist,
  with a `verify --run` test.
