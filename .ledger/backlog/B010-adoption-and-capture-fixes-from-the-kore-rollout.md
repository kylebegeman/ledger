---
id: "B010"
kind: "backlog"
title: "Adoption and capture fixes from the Kore rollout"
date: "2026-09-16"
updated: "2026-09-16"
status: "proposed"
areas:
  - "adoption"
  - "capture"
decisions:
  - "D005"
  - "D007"
docs:
  - "docs/HANDOFF.md"
---

# B010: Adoption And Capture Fixes From The Kore Rollout

## Problem

Ledger 0.7.0's first outside adoption, in Kore, proved the capture mechanics in
a live Claude Code session but surfaced friction at every step: `adopt`
defaults shaped for a TypeScript package, a `docs reconcile` that overwrites
curated routing docs, instructions that name a `ledger` binary the project may
not have, and a draft receipt the agent is never told about. Product notes
0122, 0125, 0126, 0127, and 0129 hold the evidence.

## Desired Outcome

A repository like Kore adopts Ledger with one command and no hand tuning of
risky settings, Ledger never overwrites documents it did not generate, every
instruction names a command that runs Ledger, and an agent given an ordinary
task finishes the hook's draft receipt without being told it exists.

## Scope

Included, most urgent first:

- Data safety (0126): `docs reconcile` refuses to replace a routing file Ledger
  did not generate unless forced; `adopt` points `docs.routing` at
  Ledger-owned paths when routing files already exist.
- One configured Ledger command (0127): `hooks install --command` persists it,
  and the agents block, the skill, and hook context render it; `hooks install`
  offers the `@AGENTS.md` import for `CLAUDE.md`.
- The draft lifecycle (0122, 0129): agent-visible notice of a new or refreshed
  linked draft; instructions that prefer finishing the draft; the lifecycle
  documented in the skill; no re-draft after a linked receipt lands; no session
  paths or session headings in drafts; drafted titles and areas taken from the
  change; template placeholders tightened; sessions that close without
  SessionEnd, which the Claude desktop app did not fire on `/exit`.
- Toolchain-aware `adopt` (0125): coverage roots from the tracked tree,
  `git.coverage: any`, generated-code ignores, a marked `.gitignore` block, a
  verification allowlist from the detected toolchain, no empty docs folders,
  doctor's symbols check scoped to extractable languages, and the unused
  `.ledger/policies/coverage.yaml` removed.
- A rule for whether session records are committed and what pruning does to
  receipts that link them.

Excluded:

- New agent hosts.
- Go symbol extraction; propose it separately if Kore needs checked Go anchors.

## Acceptance Checks

- `ledger docs reconcile` leaves a curated `START_HERE.md` untouched and says
  why, covered by a test.
- `ledger adopt` in a fixture Go repository with an existing docs tree writes
  config that covers its source roots, uses `git.coverage: any`, and adds a
  `.gitignore` block, with no manual edits.
- The agents block, skill, and SessionStart context all name the configured
  Ledger command.
- A second live Claude Code session in Kore, given an ordinary task, finishes
  its hook-drafted receipt to `ledger ready` without being told the draft
  exists and without creating a second receipt. This carries B007's unmet
  no-friction check.
- Kore's pinned Ledger version moves to the release with these fixes.

## Risks

- Agent-visible hook output differs by host; keep one notice per draft so
  context does not grow on every prompt.
- New `adopt` defaults must not change existing workspaces.

## Promotion Notes

Not promoted yet. Sequenced ahead of B009 in `docs/HANDOFF.md`.
