---
id: "0127"
kind: "product-note"
title: "Agent instructions name a ledger binary the project may not have"
date: "2026-09-16"
updated: "2026-09-16"
status: "resolved"
areas:
  - "capture"
  - "agents"
tags:
  - "dogfood"
---

# 0127: Agent Instructions Name A Ledger Binary The Project May Not Have

## Context

Kore has no Node toolchain, so its hooks were installed with
`--command "npx --yes @kylebegeman/ledger@0.7.0"`. On this machine `ledger` on
`PATH` is `/opt/homebrew/bin/ledger`, ledger-cli 0.1.12, the plain-text
accounting program.

## Finding

The hook command is configurable, but every instruction an agent reads is
not. The `AGENTS.md` block from `ledger agents --write`, the installed skill,
and the SessionStart context all tell the agent to run `ledger packet`,
`ledger session note`, `ledger new`, and `ledger ready`. An agent in Kore that
follows them runs the accounting program. A hand-written note above the
managed block now tells agents to use the npx command.

Related friction from the same install:

- The pinned version appears in four places (two hook files, the verification
  allowlist, and the `AGENTS.md` note), and Codex pins a hash of each hook
  definition, so upgrading Ledger means editing all four and re-approving.
- `npx` adds roughly 0.35 to 0.75 seconds to every hook call, and
  PostToolUse runs on every edit.
- `hooks install` asks the user to add `@AGENTS.md` to `CLAUDE.md` by hand;
  Kore needed it.

## Impact

The capture loop depends on the agent running Ledger commands between hook
events. When the instructions name the wrong program, the agent either fails
silently, runs an unrelated tool, or improvises, and receipts stay drafts.

## Recommendation

Persist the invocation in config (for example `agents.command`), write it from
`hooks install --command`, and render it in the agents block, the skill, and
hook context so every surface names one command. Offer to add the
`CLAUDE.md` import when `hooks install --host claude-code` finds a `CLAUDE.md`
without it. Consider one upgrade command that re-renders hooks, allowlist
patterns, and blocks for a new pinned version.

## Follow-ups

- A configured Ledger command used by hooks, the agents block, the skill, and
  hook context.
- `hooks install` adds the `@AGENTS.md` import to `CLAUDE.md` when asked.
- Measure hook latency through npx and document a faster install for
  repositories without Node.
- Resolved: 0132 saves one configured command for the hooks, the agents
  block, the skill, and hook context, and adds the `@AGENTS.md` import. 0164
  measured hook latency through npx and documents the installed alternative in
  the README.
