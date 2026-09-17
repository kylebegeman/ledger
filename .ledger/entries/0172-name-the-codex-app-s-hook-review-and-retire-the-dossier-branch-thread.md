---
id: "0172"
kind: "change"
title: "Name the Codex app's hook review and retire the Dossier branch thread"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "capture"
  - "docs"
files:
  - "src/hooks.ts"
  - "test/hooks.test.ts"
  - "README.md"
  - "docs/HANDOFF.md"
symbols:
  - "hostHookFiles"
docs:
  - "README.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "The README and the handoff say where Codex app users trust hooks and that a changed hook is skipped until trusted; the handoff also retires the Dossier branch thread."
  docs:
    - "README.md"
    - "docs/HANDOFF.md"
commits: []
related:
  - "0109"
  - "0171"
---

# 0172: Name The Codex App's Hook Review And Retire The Dossier Branch Thread

## Summary

`ledger hooks install --host codex` now says to trust the hooks with `/hooks`
in the Codex CLI or on the Hooks page of the Codex app's settings. Its
second step says to trust them again whenever the hook file changes, because
Codex skips a changed hook until then. The README says the same.

The handoff says Kyle trusts Kore's hooks in the Codex app after each bump.
It notes that Kore's `docs/PLAN.md` still names only `/hooks`, and it
retires the Dossier `next` branch thread, because Kyle deleted the branch.

## Why

Kyle typed `/hooks` in the Codex app in Kore to trust the hooks that
kylebegeman/forge#30 changed. The app sent it to the model as a message,
which replied that it could not open the command. Codex documents `/hooks`
as a CLI command, and the Codex app reviews hooks in its settings (app
release 26.506 added that review flow). Ledger's next step named only
`/hooks`, so an app user had no working instruction. Codex also skips a
changed hook until it is trusted again. The CLI warns at startup, but a
reported VS Code extension bug skips such hooks silently, so a version bump
can stop session capture unnoticed.

Fixing Kore's plan now was rejected: its CI takes about 20 minutes, and the
next Kore bump edits that paragraph anyway.

## Changed Files

### Installer next steps

- Files: `src/hooks.ts`, `test/hooks.test.ts`
- Changed: the Codex entry in `hostHookFiles` names both review surfaces and
  says a changed hook is skipped until trusted again. The test checks both
  surfaces and the skip warning.
- Anchor: `hostHookFiles`,
  `names the configured command in the first next step and hints --command only for the default`
- On conflict: Keep both surfaces in the Codex next step.

### README and handoff

- Files: `README.md`, `docs/HANDOFF.md`
- Changed:
  - The README's Codex line names both surfaces and the re-trust after a
    changed hook command.
  - The handoff's Kore paragraph and open threads name the app's Hooks page
    and the silent skip, and they add the Kore plan follow-up.
  - The Dossier thread says Kyle deleted `next` on 2026-09-17.
  - The product state lists 0171 and 0172 as unreleased.
- Anchor: `In a Node project`, `Where the product stands`,
  `Open threads and small debts`
- On conflict: Keep the handoff describing the current state.

## Behavior And UX Impact

`hooks install --host codex` prints a next step that works in the Codex app
and the CLI. Nothing else changes, and installed hook files are unchanged.

## Invariants

- The Codex next steps name `/hooks` for the CLI and the Hooks page for the
  app.
- Hook files written by the installer do not change.

## Verification

- `npx vitest run test/hooks.test.ts`
- `node dist/cli.js ready 0172`
- `npm run readme:check`
- `npm run ci`

## Notes

This receipt ships with the next patch release. The Codex sources were the
Codex hooks documentation, which describes `/hooks` in the CLI, and the Codex
app 26.506 changelog entry for the in-app hook trust review.
