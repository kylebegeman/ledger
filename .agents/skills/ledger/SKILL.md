---
name: ledger
description: Use Ledger, the change memory in .ledger/ for ledger, before editing a file, when you learn something worth keeping, and when you finish work that needs a receipt. Covers packets, explain, search, session notes, drafting and promoting records, and the ready gate.
---

# Ledger

Ledger keeps ledger's change memory as Markdown records under `.ledger/`: change entries with invariants and verification, backlog items, decisions, releases, and short-lived session records. Every command accepts `--json` and returns a machine envelope; the same operations exist as MCP tools when `ledger mcp` or `ledger serve --api` is running.

## Before editing a file

- `ledger packet <path> --budget 1200` returns the records that mention the path with their conflict rules, invariants, and verification. Read it before changing the file.
- `ledger search-packet "<topic>" --budget 1600` when you know the topic but not the path.
- `ledger explain <path> --agent` for only invariants and verification.
- `ledger conflict <path>` before resolving a merge conflict.

## While working

- `ledger session note "<fact>"` records something the next session should know; `--section Next` records a follow-up.
- Host hooks (installed with `ledger hooks install`) already track the paths you touch on the active session record and draft a receipt when you stop.

## When work is done

- `ledger new "<title>" --from-diff --area <area>` drafts a change entry from the Git diff when no hook did.
- `ledger promote <id>` turns a backlog item or session record into a linked change entry.
- Fill Summary, Why, Changed Files, Invariants, and Verification; declare `docsImpact`.
- `ledger ready` must pass before a draft is marked `landed`; it reports TODO markers, template placeholders, missing verification, and unreviewed docs impact with line numbers.
- `ledger ci` (or `ledger ci --base <rev> --head <rev>` in a clean checkout) runs validation, docs audit, coverage, and docs impact.

## Recording plans and decisions

- `ledger backlog new "<title>" --area <area>` and `ledger decision new "<title>"` create records from the project templates.
- `ledger scratch "<title>"` starts a session record for notes that expire unless promoted.

Docs adoption mode is `partial`; do not assume Ledger owns all docs unless config says `managed`.
