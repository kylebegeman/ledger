---
id: "B005"
kind: "backlog"
title: "Architecture And Token Efficiency Hardening"
date: "2026-07-03"
updated: "2026-07-03"
status: "accepted"
areas:
  - "architecture"
  - "agents"
  - "cli"
  - "performance"
---

# B005: Architecture And Token Efficiency Hardening

## Problem

Ledger has grown from a small CLI into a multi-surface tool used by humans,
agents, MCP clients, generated reports, and a static reader. The current shape
works, but several internals can become thinner, easier to transport, more
stable, and cheaper for agents to consume.

## Desired Outcome

Ledger keeps Markdown as the source of truth while reducing drift between CLI,
MCP, reports, and renderer output. Agent context retrieval should be explicitly
budgeted, compact by default, and transparent about what was included or
omitted.

## Scope

Accepted internal improvements:

- split command handlers out of the large CLI module
- make canonical workflow result models shared by CLI, MCP, reports, and render
- narrow the public package API to intentional stable exports
- report Git availability and Git command failures explicitly
- replace regex-only symbol extraction with parser-backed extraction
- create a normalized record graph for files, docs, decisions, backlog,
  releases, symbols, invariants, and verification
- add generated-index freshness checks
- move validation toward named policy profiles
- strengthen docs-impact declarations with explicit `none`, `updated`, and
  `not-needed` states
- split renderer model, HTML shell, styles, and browser runtime
- add golden tests for generated artifacts
- add parse, validate, index, render, and search performance budgets
- replace ad hoc template replacement with a typed template renderer
- make operational errors machine-readable
- add config schema versioning and migrations

Token-efficiency techniques to prioritize:

- budgeted packets that report estimated tokens and omitted entries
- ranked retrieval by file, symbol, invariant, decision, and recent relevance
- search indexes that store compact terms separately from full Markdown source
- agent instructions that steer callers toward `packet --budget`, targeted
  `query`, and `explain --agent`
- short JSON summaries for MCP calls before full Markdown payloads
- stale-index diagnostics so agents do not reread source unnecessarily

## Acceptance Checks

- CLI command behavior can be tested through command modules or canonical
  result models without intercepting `console`.
- MCP and CLI packet calls support an explicit token budget.
- Generated static artifacts have size and freshness checks.
- `ledger doctor` reports Git availability, stale indexes, render readiness,
  and generated reader budget status.
- Validation policy changes are additive and do not break existing records.

## Risks

- Splitting modules can create churn without improving behavior if done as a
  broad refactor instead of command-by-command.
- Token estimates are approximate; Ledger should label them as estimates rather
  than exact accounting.
- Parser-backed symbol extraction must avoid adding heavy dependencies to the
  default package path.

## Promotion Notes

Promote this item through small slices that each improve a user-visible workflow:
packet budget first, health diagnostics second, command result models third,
then deeper parser and API cleanup.
