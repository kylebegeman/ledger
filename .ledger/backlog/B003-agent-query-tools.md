---
id: "B003"
kind: "backlog"
title: "Agent query tools"
date: "2026-06-29"
updated: "2026-06-29"
status: "proposed"
areas: ["agents", "mcp", "query"]
---

# B003: Agent Query Tools

## Problem

Coding agents need compact, precise context about files, invariants, decisions,
and conflict rules. Asking an agent to read the whole catalog does not scale.

## Desired Outcome

Ledger exposes query commands and, later, MCP tools that return targeted records
for a file, symbol, release, area, or backlog item.

## Scope

Included:

- `ledger explain`
- JSON output mode
- compact agent digest output
- MCP server prototype later

Excluded:

- hosted vector search
- product-specific agent orchestration

## Acceptance Checks

- `ledger explain path/to/file` returns relevant entries and invariants.
- JSON output is stable enough for agent tools.
- The command works from generated indexes and falls back to source parsing.

## Risks

- Overly verbose output can hurt agent context efficiency.
- Indexes must stay fresh or the command must clearly report staleness.

## Promotion Notes

Promote in stages: CLI query first, MCP second.
