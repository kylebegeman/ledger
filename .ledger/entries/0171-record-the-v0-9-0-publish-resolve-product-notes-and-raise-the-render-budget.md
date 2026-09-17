---
id: "0171"
kind: "change"
title: "Record the v0.9.0 publish, resolve product notes, and raise the render budget"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "records"
  - "release"
  - "adoption"
files:
  - "docs/HANDOFF.md"
  - "docs/SCHEMA.md"
  - ".ledger/config.yaml"
  - ".ledger/entries/0122-hook-drafted-receipts-collide-with-hand-written-receipt-ids.md"
  - ".ledger/entries/0125-adopting-ledger-in-a-go-repository-needs-hand-tuned-configuration.md"
  - ".ledger/entries/0126-docs-reconcile-overwrites-curated-routing-docs-under-partial-adoption.md"
  - ".ledger/entries/0127-agent-instructions-name-a-ledger-binary-the-project-may-not-have.md"
  - ".ledger/entries/0129-a-live-kore-session-never-learned-about-its-drafted-receipt.md"
  - ".ledger/entries/0136-the-reader-shows-markdown-backticks-as-literal-text.md"
  - ".ledger/entries/0138-coverage-any-does-not-relax-ledger-ci-for-adopted-repositories.md"
  - ".ledger/entries/0139-the-ci-action-posts-a-new-pull-request-comment-on-every-run.md"
  - ".ledger/entries/0140-the-verification-allowlist-ignores-agents-command.md"
  - ".ledger/entries/0160-hook-drafts-anchor-a-changed-file-s-first-symbols-not-the-changed-ones.md"
  - ".ledger/entries/0161-ledger-ci-fails-mid-turn-until-the-hook-drafts-the-receipt.md"
  - ".ledger/sessions/S0003-claude-code-session-2026-09-17.md"
symbols: []
docs:
  - "docs/HANDOFF.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The handoff records the 0.9.0 publish, Kore's move to it, the resolved note rule, and the remaining slices; the schema lists the product note statuses and when a note becomes resolved."
  docs:
    - "docs/HANDOFF.md"
    - "docs/SCHEMA.md"
commits: []
related:
  - "0094"
  - "0120"
  - "0158"
  - "0164"
  - "0168"
  - "0169"
  - "0170"
---

# 0171: Record The V0.9.0 Publish, Resolve Product Notes, And Raise The Render Budget

## Summary

Records that 0.9.0 published from kylebegeman/ledger#26 and that Kore moved
to it in kylebegeman/forge#30 (Kore receipt 0008). The handoff's next slices
are now MCP protocol 2026-07-28, which waits for Kyle's approval of new
production dependencies, and new features. It also notes that Kore's changed
Codex hooks need Kyle's `/hooks` approval, and it records Kyle's request that
later releases be patch releases.

All eleven product notes change from `captured` to `resolved`. Each already
ended with a `Resolved:` line naming its fixes (0164). The schema now lists
the product note statuses and says when a note becomes resolved.

This repository's `render.budgets.maxTotalBytes` rises from 3.5 MB to 4.5 MB.
The reader measured 3,420,012 bytes with this receipt, so the next few
receipts would have failed `ledger doctor`.

## Why

The handoff has to describe the published state, as 0158 did for 0.8.1.

The notes' status is the record's lifecycle field, and `captured` said they
were still open. The reader now colors `captured` violet with in-progress
work, so eleven closed notes looked like open work, and a status filter for
open notes returned all eleven. `resolved` falls in the reader's neutral
tone with the other finished-but-inactive states, so no code changed.
Leaving the status alone and relying on the `Resolved:` lines, as 0164 did,
was rejected because neither the reader nor a query can see those lines.

The reader grew by about 100 KB in this release's four receipts, and it
holds 215 documents at about 16 KB each across the page, the search index,
the graph, the detail chunks, and the Markdown sources. 0169 already removed
the formatting waste, and every per-file budget has room, so the remaining
size is history. The total counts every generated file and is raised
deliberately as history grows, as 0094 and 0120 did. 4.5 MB leaves room for
about 65 more records.

## Changed Files

### Handoff and schema

- Files: `docs/HANDOFF.md`, `docs/SCHEMA.md`
- Changed:
  - The handoff's product state names 0.9.0, #26, and forge#30.
  - Its decisions add the resolved note rule.
  - Its next slices drop the publish step, and its open threads add the
    Codex hook approval in Kore.
  - Its conventions say releases after 0.9.0 are patch releases unless Kyle
    asks otherwise.
  - The schema's per-kind status lists add product notes (`captured`,
    `resolved`), with the rule for moving between them, and the common
    status list names `resolved`.
- Anchor: `Where the product stands`, `Next slices, in order`,
  `Status Vocabulary`
- On conflict: Keep the handoff describing the current state.

### Render budget

- Files: `.ledger/config.yaml`
- Changed: `render.budgets.maxTotalBytes` is 4500000. The per-file budgets
  are unchanged.
- Anchor: `maxTotalBytes`
- On conflict: Raise the total only for measured growth; fix waste first,
  as 0169 did.

### Product notes and session

- Files: the eleven `.ledger/entries/` product notes listed above,
  `.ledger/sessions/S0003-claude-code-session-2026-09-17.md`
- Changed: each note's status is `resolved`, with its text unchanged. The
  session record summarizes the rest of the session and is closed, because
  the desktop app never sends SessionEnd.
- Anchor: `status`, `Resolved:`
- On conflict: A note with an open follow-up stays `captured`.

## Behavior And UX Impact

The reader shows the eleven notes with a neutral `resolved` status, and
filtering by `captured` finds only open notes, of which there are none. No
command changed.

## Invariants

- A product note is `resolved` only when its Follow-ups section ends with a
  `Resolved:` line.
- The handoff names the published version and Kore's current pin.

## Verification

- `node dist/cli.js ready 0171`
- `node dist/cli.js validate`
- `node dist/cli.js stale`
- `node dist/cli.js render`
- `node dist/cli.js doctor`
- `npm run ci`

## Notes

This receipt stays unreleased until the next release, as 0158 did. The npm
package ships `docs/SCHEMA.md`, so the product note statuses reach npm with
that release. The package ships neither the records nor the handoff. The
product note template still starts notes as `captured`.
