---
name: ledger
description: Use Ledger, the change memory in .ledger/ for ledger, before editing a file, when you learn something worth keeping, and when you finish work that needs a receipt. Covers packets, explain, search, session notes, drafting and promoting records, and the ready gate.
---

# Ledger

Ledger keeps ledger's change memory as Markdown records under `.ledger/`: change entries with invariants and verification, backlog items, decisions, releases, and session records that are committed with the rest and pruned only when nothing links them. Every command accepts `--json` and returns a machine envelope; the same operations exist as MCP tools when `node dist/cli.js mcp` or `node dist/cli.js serve --api` is running.

## Before editing a file

- `node dist/cli.js packet <path> --budget 1200` returns the records that mention the path with their conflict rules, invariants, and verification. Read it before changing the file.
- `node dist/cli.js search-packet "<topic>" --budget 1600` when you know the topic but not the path.
- `node dist/cli.js explain <path> --agent` for only invariants and verification.
- `node dist/cli.js conflict <path>` before resolving a merge conflict.

## While working

- `node dist/cli.js session note "<fact>"` records something the next session should know; `--section Next` records a follow-up; `--section Summary` states the intent of the work and titles the receipt the hooks draft.
- Host hooks (installed with `node dist/cli.js hooks install`) already track the paths you touch on the active session record and draft a receipt when you stop. The draft is named in a notice on your next prompt and as `Linked receipt:` in the session start context.

## When work is done

- With hooks installed, finish the hook-drafted receipt named in the prompt notice and the session start context; do not create another with `node dist/cli.js new`.
- `node dist/cli.js new "<title>" --from-diff --area <area>` drafts a change entry from the Git diff in repositories without hooks.
- `node dist/cli.js promote <id>` turns a backlog item or session record into a linked change entry.
- Give the draft a real title, fill Summary, Why, Changed Files, Invariants, and Verification, and declare `docsImpact`.
- `node dist/cli.js ready` must pass before a draft is marked `landed`; it reports the drafted default title, TODO markers, template placeholders, missing verification, and unreviewed docs impact with line numbers.
- `node dist/cli.js ci` (or `node dist/cli.js ci --base <rev> --head <rev>` in a clean checkout) runs validation, docs audit, coverage, and docs impact.

## Draft receipt lifecycle

- Drafted: the Stop or SessionEnd hook creates one change entry from the paths the session touched and the Git diff, with `status: draft`, a neutral title, and `related` naming the session record.
- Refreshed: later stops add newly touched paths to that draft instead of creating another; a new draft appears only for paths no linked receipt covers.
- Finished: you retitle it and fill it in, then `node dist/cli.js ready` gates it.
- Landed: a person sets `status: landed` after the work merges; hooks never re-draft a landed receipt for the same paths.
- Session records stay committed and are linked from the receipt through `related`; they expire after `sessions.expiresInDays`, and an expired active session is treated as inactive.

## Recording plans and decisions

- `node dist/cli.js backlog new "<title>" --area <area>` and `node dist/cli.js decision new "<title>"` create records from the project templates.
- `node dist/cli.js scratch "<title>"` starts a session record for notes that expire unless promoted.

Docs adoption mode is `partial`; do not assume Ledger owns all docs unless config says `managed`.
