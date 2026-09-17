---
id: "0152"
kind: "change"
title: "Merge hooks per entry, announce every new draft, and cap drafts"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "hooks"
  - "agents"
  - "capture"
files:
  - "src/hooks.ts"
  - "src/operations/definitions/hooks.ts"
  - "src/newEntry.ts"
  - "src/skills.ts"
  - "src/config.ts"
  - "src/catalogCache.ts"
  - "test/hooks.test.ts"
  - "test/skills.test.ts"
  - "test/draftLimits.test.ts"
symbols:
  - "withoutLedgerHooks"
  - "forgetHookNotice"
  - "replaceAgentsBlock"
  - "defaultDraftTitle"
  - "inferAreas"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's hook section, updated with receipt 0151, describes the notice lifecycle, the cache clear, the title and area caps, and Cursor's draft signal."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
related:
  - "0132"
  - "0133"
  - "0142"
  - "0151"
release: "v0.8.1"
---

# 0152: Merge Hooks Per Entry, Announce Every New Draft, And Cap Drafts

## Summary

`hooks install` now removes Ledger's own entries from a host hook group and
keeps whatever else the group holds, so a command a user added to Ledger's
group survives a reinstall without a second Ledger group. `agents --write`
replaces the first managed block and removes any later copies instead of
leaving a stale second block. A draft created anew is announced on the next
prompt even when it reuses the id of a draft the agent deleted, because
creating a draft clears its id from the notice store; the store drops
sessions that no longer exist when it is written, and `cache clear` removes
it. Codex `apply_patch` bodies sent as an argv array record their paths. A
hook payload without a session id records nothing and says so on stderr
instead of touching whichever session is newest. Hook drafts name at most
three areas in their default title, keep the eight most touched areas, and
cap symbols at twelve per file and 120 in all. The Claude Code skill copy on
hosts without symlinks goes through the file transaction, and setting
`agents.command` in a config whose `agents` key is an alias fails with an
instruction instead of a YAML library message.

## Why

The 0.8.0 audit reproduced each case: a reinstall duplicated the SessionStart
group after a user added a command to it, so context was injected twice;
two managed blocks left an agent reading contradictory instructions; a
deleted draft's reused id suppressed the notice the 0133 fix exists to send;
an argv-shaped `apply_patch` recorded no paths; a 39-file Stop draft carried
a 387-character title and 691 symbols; and `touchSession` without a host id
fell back to the newest active session while `startSession` created a new
one, so a host that omits its id could route edits into another host's
record. Storing announcements by path was rejected because a deleted draft
recreated with the same touched paths gets the same path.

## Changed Files

### Hook install and payloads

- Files: `src/hooks.ts`, `src/operations/definitions/hooks.ts`
- Changed: `withoutLedgerHooks` filters Ledger entries out of each nested
  group and drops emptied groups; `normalizeHookPayload` reads a patch body
  from an argv array whose first word is `apply_patch` or whose element
  starts with `*** Begin Patch`; `runHookEvent` returns a `note` and `{}`
  when the payload has no session id, and the operation writes the note to
  stderr.
- Anchor: `withoutLedgerHooks`, `beginPatchPattern`, `note`
- On conflict: Never fall back to the newest session for a hook event.

### Notices

- Files: `src/hooks.ts`, `src/catalogCache.ts`
- Changed: `forgetHookNotice` clears a created draft's id after the stop and
  session-end hooks; `announcePendingDrafts` drops ids of sessions that no
  longer exist when it writes through `writeHookNotices`;
  `clearLedgerCatalogCache` removes `hook-notices.json`.
- Anchor: `forgetHookNotice`, `writeHookNotices`, `hook-notices.json`
- On conflict: Announcing is keyed by session and entry id; creation, not
  the path, resets it.

### Drafts, blocks, skill copy, and config

- Files: `src/newEntry.ts`, `src/skills.ts`, `src/config.ts`
- Changed: `draftTitleSubject` names `maxTitleAreas` areas and counts the
  rest, and `isDefaultDraftTitle` recognizes that shape; `inferAreas` counts
  files per area and keeps `maxInferredAreas`; `collectChangedSymbols` keeps
  `maxSymbolsPerFile` per file and `maxDraftSymbols` in all;
  `replaceAgentsBlock` walks every marker pair through `managedBlockRanges`;
  the skill copy uses `applyFileTransaction`; `renderConfigWithAgentsCommand`
  throws `invalid-config` with a remedy when the key cannot be set.
- Anchor: `draftTitleSubject`, `maxInferredAreas`, `managedBlockRanges`, `install skill copy`
- On conflict: Keep the title and the areas derived from the same list so
  `ready` still recognizes a default title.

### Tests

- Files: `test/hooks.test.ts`, `test/skills.test.ts`, `test/draftLimits.test.ts`
- Changed: cases for a user command inside Ledger's group, an argv
  `apply_patch`, a draft deleted and created anew under the same id, a payload
  without a session id, two managed blocks, the three-area title, and the
  eight-area cap.
- Anchor: `announces a draft created anew after the first one was deleted`, `replaces every managed block and keeps one`, `keeps the eight most touched areas of a wide diff`
- On conflict: Keep the deleted-draft case; it guards the notice the hooks
  exist to send.

## Behavior And UX Impact

Reinstalling hooks never doubles Ledger's entries. An agent that rejects a
draft and keeps working is told about the replacement. Wide refactors get a
readable draft title and file name. Cursor and Codex payloads that carry no
session id are ignored with a diagnostic instead of misfiled.

## Invariants

- A host hook file holds Ledger's entry for an event once after any number
  of installs.
- A managed file holds one Ledger agents block after `agents --write`.
- A created draft is announced on the next prompt regardless of its id.
- A hook event without a session id writes nothing.
- A default draft title names at most three areas.

## Verification

- `npx vitest run test/hooks.test.ts test/skills.test.ts test/draftLimits.test.ts test/newEntry.test.ts test/sessions.test.ts test/ready.test.ts test/authoring.test.ts`
- `npm run typecheck`
- `npm run ci`

## Notes

Found by the 0.8.0 audit. Cursor still gets no in-session draft signal
because its hooks carry no message channel; the docs say so.
