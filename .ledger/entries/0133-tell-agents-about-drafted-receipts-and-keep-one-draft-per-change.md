---
id: "0133"
kind: "change"
title: "Tell agents about drafted receipts and keep one draft per change"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "capture"
  - "hooks"
  - "sessions"
files:
  - "src/hooks.ts"
  - "src/sessions.ts"
  - "src/newEntry.ts"
  - "src/template.ts"
  - "src/ready.ts"
  - "src/workspace.ts"
  - "src/skills.ts"
  - "src/operations/definitions/agents.ts"
  - "src/operations/definitions/hooks.ts"
  - "src/operations/definitions/sessions.ts"
  - ".ledger/templates/change.md"
  - "test/hooks.test.ts"
  - "test/sessions.test.ts"
  - "test/newEntry.test.ts"
  - "test/ready.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "hookEvents"
  - "hookCommandPattern"
  - "renderNestedHooks"
  - "announcePendingDrafts"
  - "readHookNotices"
  - "linkedChangeEntries"
  - "buildSessionStartContext"
  - "normalizeHookPayload"
  - "findSession"
  - "findExpiredActiveSession"
  - "startSession"
  - "touchSession"
  - "draftSessionReceipt"
  - "sessionSummaryTitle"
  - "isLedgerScaffoldPath"
  - "defaultDraftTitle"
  - "isDefaultDraftTitle"
  - "inferAreas"
  - "replaceDefaultBlock"
  - "legacyChangedFilesPlaceholders"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Hook behavior agents and adopters rely on changed: a sixth hook, the linked-receipt rule, drafting exclusions and titles, and expired sessions. README Host Hooks, ARCHITECTURE Capture Hooks, and the SCHEMA session section describe them."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B010"
decisions:
  - "D005"
related:
  - "0122"
  - "0129"
  - "0132"
  - "S0002"
release: "v0.8.0"
---

# 0133: Tell Agents About Drafted Receipts And Keep One Draft Per Change

## Summary

A new `user-prompt-submit` hook for Claude Code and Codex tells the agent,
once per drafted receipt, which draft the Stop hook wrote for its session and
to finish it rather than create another; announcements are tracked in the
derived `.ledger/cache/hook-notices.json`. SessionStart context and the
pre-compact handoff list every linked receipt. A receipt the session links
counts as linked whatever its status: a draft is refreshed only with uncovered
touched paths, nothing is written when linked receipts already cover every
path, and a second draft appears only for an uncovered path. Drafts never list
session records or `.ledger/templates`, take their title from the session's
Summary note or a neutral "Changes to" default that `ledger ready` flags, and
prefer directory areas. An active session past `expires` is treated as
inactive; its replacement, started by a session start or a touch, inherits the
links of the most recent expired record, and a late SessionEnd still closes
it. The change template holds one `{{changedFiles}}` placeholder, legacy
template copies no longer leave bare bullets, and `ready` keeps flagging the
old sample block. SessionStart also matches `clear`, the Codex SessionEnd hook
fits its 3 second cap, and Codex `apply_patch` bodies in `tool_input.command`
now record touched paths.

## Why

Product notes 0122 and 0129: in the live Kore session the agent never learned
a draft existed, because the Stop hook's message only reaches the user; the
instructions pointed it at `ledger new`, which would have created a duplicate;
landing a linked receipt mid-session would draft a second one; drafts listed
their own session record, took headings from it, kept a generic title and
three bare bullets; and the Claude desktop app never fired SessionEnd, so the
session stayed active. `UserPromptSubmit` context is the channel both nested
hosts deliver to the model without spending a turn.

## Changed Files

### Hooks

- Files: `src/hooks.ts`, `src/operations/definitions/hooks.ts`
- Changed: `user-prompt-submit` in `hookEvents` and `hookCommandPattern`;
  `renderNestedHooks` adds UserPromptSubmit (timeout 15), matches
  `startup|resume|clear|compact`, and caps the Codex SessionEnd timeout at 3;
  `announcePendingDrafts` and `readHookNotices` deliver one notice per draft
  with no Git call and `{}` on any failure or for Cursor; Linked receipt lines
  from `linkedChangeEntries`; the Stop notice asks for a title; session-end
  falls back to `findExpiredActiveSession`; `normalizeHookPayload` parses
  `tool_input.command` only when it is an apply_patch body.
- Anchor: `announcePendingDrafts`, `linkedChangeEntries`
- On conflict: Keep the new event in both `hookEvents` and
  `hookCommandPattern`, keep the prompt hook free of Git calls and never
  throwing, and never let a hook exit non-zero.

### Sessions and drafting

- Files: `src/sessions.ts`, `src/newEntry.ts`, `src/template.ts`,
  `src/workspace.ts`, `.ledger/templates/change.md`
- Changed: `findSession` skips expired active records;
  `findExpiredActiveSession` feeds the carried links in `startSession` and
  `touchSession`; `draftSessionReceipt` implements the linked-receipt rule
  with `coveragePatternMatches` and titles drafts with `sessionSummaryTitle`
  or `defaultDraftTitle`; `isLedgerScaffoldPath` excludes session records and
  templates from drafts; `inferAreas` prefers directory areas; the template
  holds `{{changedFiles}}`, `replaceDefaultBlock` replaces the legacy block
  (CRLF tolerant), and a draft with no changes keeps TODO bullets.
- Anchor: `draftSessionReceipt`, `findExpiredActiveSession`
- On conflict: Linked means any status, and a new draft requires an uncovered
  touched path. By-id lookups must still reach expired records. Do not
  exclude `.ledger/config.yaml` or other `.ledger` paths from drafts.

### Readiness, instructions, and help

- Files: `src/ready.ts`, `src/skills.ts`,
  `src/operations/definitions/agents.ts`,
  `src/operations/definitions/sessions.ts`
- Changed: `isDefaultDraftTitle` flags any default title shape (areas, a file,
  or the working tree); `legacyChangedFilesPlaceholders` keeps the old sample
  block flagged; the skill and the contributor block tell agents to finish
  the hook's draft and describe its lifecycle; session help documents expired
  sessions and Summary titles.
- Anchor: `isDefaultDraftTitle`, `renderLedgerSkill`
- On conflict: Every command span still renders `agents.command`.

### Tests and contract

- Files: `test/hooks.test.ts`, `test/sessions.test.ts`,
  `test/newEntry.test.ts`, `test/ready.test.ts`,
  `test/fixtures/operations-contract.json`
- Changed: six-hook layout and upgrade, once-only notices for Claude Code and
  Codex, Cursor and missing-session silence, Linked receipt lines, no re-draft
  after landing and a second draft for an uncovered path, exclusions, expired
  replacement with carried links on start, on a touch, and across a second
  expiry, the late SessionEnd close, Summary and default titles, directory
  areas, the Codex patch body versus a heredoc, legacy CRLF templates, the
  default title shapes, and the legacy sample block in `ready`; the contract
  changes only in the hook operation.
- Anchor: `runHookEvent`
- On conflict: Git-backed and end-to-end cases keep 30 second timeouts and
  realpath their temp directories.

### Docs

- Files: `README.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: Host Hooks, Capture Hooks, and the session section describe the
  prompt notice, the linked-receipt rule, exclusions and titles, and expired
  sessions.
- Anchor: `findExpiredActiveSession`
- On conflict: `docs/HANDOFF.md` is updated in release prep.

## Behavior And UX Impact

Agents in Claude Code and Codex now hear about their drafted receipt on the
next prompt and at session start, so they finish it instead of creating a
second one. Landing a receipt mid-session no longer spawns a duplicate. Drafts
are cleaner and carry a title `ready` asks the agent to replace. A tab whose
host never ends the session stops collecting into an expired record, and its
replacement keeps the links. Adopters get the new hook by re-running `hooks
install`; Codex needs its hooks approved again.

## Invariants

- Hook commands never exit non-zero and always print a JSON object; the
  prompt hook never calls Git and returns `{}` on any failure.
- A draft is announced once per creation.
- A new draft is created only for a touched path no linked receipt covers.
- `findSession` with `activeOnly` never returns an expired active record, and
  its replacement inherits the most recent expired record's links.
- Drafts never list session records or `.ledger/templates`.
- `ledger ready` flags a default title and the legacy sample block whatever
  template the workspace holds.

## Verification

- `npx vitest run test/hooks.test.ts test/sessions.test.ts test/newEntry.test.ts test/ready.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (hook operation only)
- `node dist/cli.js ready 0133`
- `npm run ci`

## Notes

Milestone three of B010 (release 0.8.0). Implemented and reviewed by agents;
the review's six findings were fixed directly after the fix agent hit a usage
limit: carried links across a second expiry and through a touch, a late
SessionEnd closing the expired record, default titles by shape, the legacy
sample block in `ready`, and patch parsing limited to apply_patch bodies. The
notice store is per machine, so a fresh checkout announces an existing draft
once. This repository's own hooks and skill are regenerated in release prep.
