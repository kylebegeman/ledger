---
id: "S0003"
kind: "session"
title: "Claude Code session 2026-09-17"
date: "2026-09-17"
updated: "2026-09-17"
status: "active"
expires: "2026-09-24"
areas:
  - "ci"
  - "docs"
  - "git"
  - "newentry"
  - "operations"
  - "reader"
  - "render"
  - "renderhtml"
  - "scripts"
  - "stale"
  - "symbols"
  - "tests"
files:
  - "src/renderHtml.ts"
  - "test/render.test.ts"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "src/stale.ts"
  - "test/stale.test.ts"
  - "docs/SCHEMA.md"
  - "src/render.ts"
  - "test/readerRuntime.test.ts"
  - "src/reader/runtime.ts"
  - "test/sessions.test.ts"
  - "test/git.test.ts"
  - "test/fileTransaction.test.ts"
  - "test/hooks.test.ts"
  - ".github/workflows/release.yml"
  - "README.md"
  - "test/frontmatterEdit.test.ts"
  - "test/skills.test.ts"
  - "test/draftLimits.test.ts"
  - "test/delegation.test.ts"
  - "scripts/readme-clock.mjs"
  - "vitest.config.ts"
  - "docs/ROADMAP.md"
  - "src/symbols.ts"
  - "src/git.ts"
  - "src/newEntry.ts"
  - "src/sessions.ts"
  - "src/ci.ts"
  - "src/operations/definitions/changes.ts"
  - "src/skills.ts"
  - "test/draftFit.test.ts"
  - "test/release.test.ts"
  - "CONTRIBUTING.md"
  - ".github/dependabot.yml"
host: "claude-code"
hostSession: "71358ecc-08f4-4086-aa8b-4fbccb7ed699"
related:
  - "0141"
  - "0146"
  - "0147"
  - "0148"
  - "0149"
  - "0150"
  - "0151"
  - "0152"
  - "0153"
  - "0154"
  - "0155"
  - "0156"
  - "0157"
  - "0158"
  - "0159"
  - "0160"
  - "0161"
  - "0162"
  - "0163"
  - "0164"
  - "0165"
  - "0166"
  - "0167"
---

# S0003: Claude Code session 2026-09-17

## Summary

Resumed S0002 after its usage limit. Finished inline code in the reader
(0146), including double-backtick spans and shortened summaries, and
recaptured the three README screenshots that showed literal backticks. Fixed
`ledger stale` and `ledger doctor` failing on a receipt that lists a PNG
(0147), and folded 0142 to 0147 into the v0.8.0 release record, receipt
0141, and the handoff. Then merged #20, stopped the reader from logging
skipped view transitions as unhandled rejections (0148) on branch
`reader-transition-abort`, and added that fix to v0.8.0. Merged #21, tagged
and published v0.8.0, moved Kore to it in kylebegeman/forge#25, then audited
the 0.8.0 slice with three parallel reviews and fixed what they found in
0149 to 0154 for 0.8.1 (0155). Kyle delegated the two open questions:
earlier receipts under `git.coverage: any` now count only for files they
name (0156), and the README demo runs on a pinned clock with a CI check on
the cards (0157). Published 0.8.1 from #22, whose README check passed on
Linux on its first run, and moved Kore to it in kylebegeman/forge#26 (0158).
The records-only #23 failed two tests on the Windows Node 24 runner on speed
alone, so it also gave Windows test runs a 30 second default timeout (0159).
Merged #23 and, once Kore's checks passed, forge#26. Kyle then ran the second
live Kore session from a prompt written here, and it passed: Kore receipt
0005, drafted by the hook and finished unprompted, is in
kylebegeman/forge#27. B010 is landed (0162), and product notes 0160 and 0161
record the draft problems the session exposed.

Kyle then asked for everything left to be finished. On branch `patch-0.8.2`,
drafts now take symbols from changed lines, and mid-turn checks name the
hooked session (0163). Historical stale references and resolved product notes
are curated, and the npx hook latency is measured (0164). `release --update`
landed (0165). A dependency review found that 0.8.1 crashes drafts beside
TypeScript 7 or TypeScript 5.0 to 5.4, fixed with the Dependabot updates in
0166, and 0167 prepares v0.8.2. A background agent fixed Kore's OCI staging
checks in kylebegeman/forge#28 (merged), and another wrote the Dossier 0.7.2
porting spec for B009.

## Learned

- `serve` without `--watch` renders once at startup, so a capture server has
  to restart after records change. Servers left by another session can hold
  ports 4173 and 4174.
- Receipts join an existing release record with
  `release <version> --include-unreleased --assign --update` since 0165;
  before, that took `--assign` without `--write` and a hand edit.
- TypeScript 7.0.2 exports only `version` from its package root.
  `@typescript/typescript6` is published up to 6.0.2, and its parser reports
  6.0.3.
- The auto-mode permission check refused deleting a remote branch (Dossier's
  merged `next`) as a destructive Git action.
- Timing hooks with a cached Ledger package found through `~/.npm/_npx` can
  pick an older version without newer guards; 0.7.0 recorded a session for a
  payload without a session id.
- In a hidden Chromium tab, `startViewTransition` still runs the update, and
  only `ready` rejects with `InvalidStateError`; `finished` rejects only when
  the update throws.
- The Claude Code auto-mode permission check refused `gh pr merge` for #20 as
  a merge without review until Kyle told the assistant to stop waiting and
  merge it.
- Claude Code runs PostToolUse hooks for parallel tool calls at the same
  time; before 0151 the workspace lock made all but one of them drop their
  paths silently.

## Next

- Publish 0.8.2, then move Kore's pin to it with the installers.
- Port Dossier 0.7.2's visual system into the reader for B009, from the spec
  recorded in the B009 receipt.
- Kyle deletes Dossier's merged `next` branch, and decides whether MCP
  protocol 2026-07-28 may add the v2 SDK packages.
