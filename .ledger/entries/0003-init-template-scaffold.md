---
id: "0003"
kind: "change"
title: "Complete init template scaffold"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "templates", "tests"]
files:
  - "src/workspace.ts"
  - "test/workspace.test.ts"
symbols:
  - "initWorkspace"
  - "backlogTemplate"
  - "decisionTemplate"
  - "releaseTemplate"
  - "coveragePolicy"
commits: []
---

# 0003: Complete Init Template Scaffold

## Summary

Expands `ledger init` so new projects get the same core source templates Ledger
uses itself: change, backlog, decision, release, and coverage policy files. Adds
test coverage for `initWorkspace(..., { withDocs: true })` to ensure the Ledger
root, templates, policy file, and optional docs routing starter files are
created.

## Why

The initial `init` command only wrote the change template. That made generated
projects less complete than Ledger's own dogfood structure. New projects should
start with a coherent `.ledger/` setup rather than requiring manual template
copying before backlog, decision, release, or coverage workflows are usable.

## Changed Files

### src/workspace.ts

- What changed: Adds generated backlog, decision, release, and coverage policy
  templates to `initWorkspace`.
- Anchor: `initWorkspace`
- On conflict: Keep `initWorkspace` idempotent. Do not overwrite existing
  hand-edited template or policy files.

### test/workspace.test.ts

- What changed: Adds focused coverage proving `initWorkspace` creates Ledger
  templates, coverage policy, and optional docs routing files.
- Anchor: `creates Ledger templates and optional docs structure`
- On conflict: Preserve fixture isolation through temporary directories and
  cleanup.

## Behavior And UX Impact

Users running `ledger init` get a complete Ledger source scaffold. Users running
`ledger init --with-docs` get both the complete Ledger scaffold and the optional
durable docs skeleton.

## Invariants

- `ledger init` remains idempotent.
- Existing template and policy files are not overwritten.
- Generated starter docs are only created when `--with-docs` is requested.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- Temporary-directory smoke for `dist/cli.js init --with-docs`

## Notes

Future template work should render all document types through first-class
commands instead of only shipping static templates.
