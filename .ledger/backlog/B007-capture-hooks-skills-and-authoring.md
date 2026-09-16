---
id: "B007"
kind: "backlog"
title: "Capture: hooks, skills, authoring commands, readiness, and session records"
date: "2026-09-16"
updated: "2026-09-16"
status: "proposed"
areas:
  - "agents"
  - "cli"
  - "capture"
decisions:
  - "D005"
  - "D007"
docs:
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
---

# B007: Capture: Hooks, Skills, Authoring Commands, Readiness, And Session Records

## Problem

Ledger's memory still depends on someone remembering to write it. Competing
tools capture decisions automatically from the agent session. The 0.5 engine
gives agents a warm API and MCP surface, but nothing writes a record when a
session ends, and backlog, decision, and promotion records still require
manual template editing.

## Desired Outcome

Records get written by the workflow. An agent host installs Ledger hooks and
a skill once, every session starts with a budgeted packet, touched paths are
tracked, and a draft receipt exists when the session stops.

## Scope

Included, in this order (host priority Claude Code, then Codex CLI, then Cursor):

- `ledger hooks install --host claude-code|codex|cursor`: SessionStart injects
  a budgeted packet for likely areas; PostToolUse on edit tools records
  touched paths into a session record; Stop and SessionEnd draft a receipt
  from the diff plus touched paths; PreCompact writes a handoff packet.
- `ledger skills install`: writes `SKILL.md` into `.agents/skills/ledger/`
  with host symlinks; `ledger agents --write` maintains a fenced block in
  `AGENTS.md` instead of printing text.
- Authoring operations through the transaction layer with `--json`:
  `backlog new`, `decision new`, `promote <id>`, `scratch <title>`,
  `release notes`.
- `ledger ready`: distinguishes a structurally valid draft from a record ready
  to land (no TODO placeholders, verification present, docs impact declared,
  referenced files exist).
- Session and handoff records: a short-lived record kind with an expiry that is
  promoted into a change entry or expires.

Excluded:

- AI-generated prose inside records.
- Auto-spawning the engine; a SessionStart hook may start `ledger serve --api`
  explicitly.

## Acceptance Checks

- A fresh Claude Code session in a Ledger project receives a packet on start
  and leaves a draft receipt on stop without any prompt engineering.
- `ledger promote B00X` creates a linked change entry carrying the acceptance
  checks and updates the backlog record in one transaction.
- `ledger ready` fails on a draft with TODO placeholders and passes on a
  finished entry.
- Kore adopts Ledger with hooks installed and reports no friction in its
  agent workflow.

## Risks

- Host hook formats change; keep installers data-driven and versioned.
- Session records can become noise; expiry and promotion must be cheap.

## Promotion Notes

Promote into 0.6 change entries milestone by milestone. See
`docs/HANDOFF.md` for sequencing and conventions.
