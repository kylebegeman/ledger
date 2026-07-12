---
id: "B001"
kind: "backlog"
title: "Git-aware entry drafting"
date: "2026-06-29"
updated: "2026-07-12"
status: "shipped"
areas: ["cli", "git", "automation"]
---

# B001: Git-Aware Entry Drafting

## Problem

Writing change entries manually is valuable but repetitive. The files changed,
staged diff, probable areas, and commit metadata are already available from Git.

## Desired Outcome

`ledger new --from-diff` creates a useful draft entry with touched files,
starter changed-file sections, and a verification placeholder.

## Scope

Included:

- changed file detection
- staged and unstaged modes
- starter `Changed Files` content
- optional area flags

Excluded from the first slice:

- deep semantic symbol extraction
- pull request API calls
- AI-generated prose

## Acceptance Checks

- A repo with changed files can generate a draft entry.
- Generated drafts are valid enough for `ledger validate` after the user fills
  required prose.
- The command does not overwrite an existing entry.

## Risks

- Drafts may look more complete than they are.
- Git output differs across unusual repository states.

## Promotion Notes

Shipped through the initial drafting work and later parser-backed symbol,
docs-impact, and staged-diff improvements. Ledger now dogfoods this workflow for
its own milestone receipts.
