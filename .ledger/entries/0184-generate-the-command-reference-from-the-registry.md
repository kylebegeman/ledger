---
id: "0184"
kind: "change"
title: "Generate the command reference from the registry"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "docs"
  - "operations"
files:
  - "AGENTS.md"
  - "README.md"
  - "docs/COMMANDS.md"
  - "docs/HANDOFF.md"
  - "src/operations/reference.ts"
  - "test/commandReference.test.ts"
symbols:
  - "renderCommandReference"
  - "commandReferencePath"
docs:
  - "AGENTS.md"
  - "README.md"
  - "docs/COMMANDS.md"
  - "docs/HANDOFF.md"
docsImpact:
  status: "updated"
  reason: "docs/COMMANDS.md is new and generated; the README links it, and the agent guide and handoff say how to regenerate it."
  docs:
    - "docs/COMMANDS.md"
    - "README.md"
    - "AGENTS.md"
    - "docs/HANDOFF.md"
commits: []
decisions:
  - "D005"
related:
  - "0183"
release: "v0.9.2"
---

# 0184: Generate the command reference from the registry

## Summary

`docs/COMMANDS.md` is a command reference generated from the operation
registry, the same source as `ledger help`, the MCP tools, and the JSON API.
For every command it gives:

- the usage and help exactly as `ledger help` prints them
- a table of flags with their values and descriptions
- whether it prints JSON, whether it writes files, and its MCP tool,
  including whether that tool asks the user to confirm
- its aliases

`ledger hook`, which host hooks run, comes last. A test fails when the file
is stale, and `LEDGER_UPDATE_COMMANDS=1` regenerates it. The README links it.

## Why

Readers had only `ledger help` and the README's summary tables, which name
some flags and drift by hand. The registry already generates help, MCP tools,
and the contract, so a reference generated from it cannot fall out of date
unnoticed.

Rejected:

- **Hand-written command docs.** They drift the way the README tables did.
- **Rendering help prose as Markdown.** Help text is plain wrapped text that
  names paths and flags. A `text` block shows it exactly as the terminal does.

## Changed Files

### Reference generator

- Files: `src/operations/reference.ts`, `test/commandReference.test.ts`,
  `docs/COMMANDS.md`
- Changed:
  - `renderCommandReference` builds the page from the registry and
    `operationHelp`, with a contents list whose anchors match GitHub's
    headings.
  - The test compares the page with the committed file, and rewrites the
    file under `LEDGER_UPDATE_COMMANDS=1`. It also checks that:
    - every usage line and flag appears
    - every contents link resolves
    - confirmed MCP tools are marked
    - no em dashes appear
- Anchor: `renderCommandReference`, `commandReferencePath`
- On conflict: The page must stay generated; fix the registry, not the file.

### Pointers

- Files: `README.md`, `AGENTS.md`, `docs/HANDOFF.md`
- Changed:
  - The README's command section and docs table link the reference.
  - The agent guide and the handoff say to regenerate it after changing an
    operation, next to the contract.
- Anchor: `LEDGER_UPDATE_COMMANDS`
- On conflict: Keep both regeneration commands together.

## Behavior And UX Impact

The repository and the npm package gain a complete command reference. A
change to any command's usage, help, or flags now fails the tests until the
reference is regenerated.

## Invariants

- `docs/COMMANDS.md` matches the registry exactly.
- Every listed command links to a heading that exists.

## Verification

- `LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts`
- `npx vitest run test/commandReference.test.ts`
- `npm run typecheck`
- `npm run ci`

## Notes

The docs audit counts a doc as referenced when a record lists it under
`docs`, so this receipt lists the new page.
