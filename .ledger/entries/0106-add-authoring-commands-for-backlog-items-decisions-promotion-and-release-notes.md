---
id: "0106"
kind: "change"
title: "Add authoring commands for backlog items, decisions, promotion, and release notes"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "authoring"
  - "cli"
files:
  - "src/authoring.ts"
  - "src/frontmatterEdit.ts"
  - "src/newEntry.ts"
  - "src/template.ts"
  - "src/release.ts"
  - "src/config.ts"
  - "src/types.ts"
  - "src/workspace.ts"
  - "src/machine.ts"
  - "src/index.ts"
  - "src/operations/definitions/authoring.ts"
  - "src/operations/registry.ts"
  - "src/operations/runtime.ts"
  - "test/authoring.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/API.md"
  - "docs/PRODUCT.md"
  - "docs/SCHEMA.md"
symbols:
  - "createBacklogItem"
  - "createDecision"
  - "promoteRecord"
  - "readReleaseNotes"
  - "nextRecordId"
  - "draftChangeEntry"
  - "setFrontmatterScalars"
  - "ensureFrontmatterArrays"
  - "replaceSectionBody"
  - "backlogNewOperation"
  - "decisionNewOperation"
  - "promoteOperation"
  - "releaseNotesOperation"
docs:
  - "docs/API.md"
  - "docs/PRODUCT.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The product brief replaces the manual promotion recipe with ledger promote, the schema names the commands and id config for backlog items and decisions, and the API stable surface lists record authoring."
  docs:
    - "docs/API.md"
    - "docs/PRODUCT.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D005"
  - "D007"
---

# 0106: Add Authoring Commands For Backlog Items, Decisions, Promotion, And Release Notes

## Summary

Four operations join the registry: `backlog new`, `decision new`, `promote
<id>`, and `release notes <version>`. The first two render the project's
backlog and decision templates with the next sequential id, area tags, and
optional decision, related, and docs links. `promote` drafts a change entry
linked to a backlog item through the `backlog` frontmatter field, copies the
item's areas and decisions, carries its Acceptance Checks into the Verification
section, and marks the item `in-progress`, all in one file transaction.
`release notes` prints a release record's Public Notes so the GitHub Release
step can stop parsing Markdown in shell. The receipt you are reading was
created with `ledger promote B007 --from-diff`.

## Why

Backlog B007 asks for authoring commands through the transaction layer with
`--json` envelopes so agents can create every record kind. Until now only
change entries and product notes had generators; backlog and decision
templates were written by `init` and then ignored, and `ids.backlogPrefix` and
`ids.decisionPrefix` were validated but never read. Promotion was a manual
recipe in the product brief. `nextRecordId` counts only records of the same
kind so backlog and decision numbering stay independent of entry numbering,
and the widths are configurable (`ids.backlogWidth`, `ids.decisionWidth`,
both default 3) to match the existing `B007` and `D005` ids.

## Changed Files

### Authoring module

- Files: `src/authoring.ts`, `src/frontmatterEdit.ts`
- Changed: record creation from templates, `promoteRecord`, `readReleaseNotes`,
  and small frontmatter editing helpers that replace scalars, add missing list
  fields, and replace a section body without reformatting the file.
- Anchor: `promoteRecord`
- On conflict: Promotion must write the new entry and the updated backlog item
  in one `applyFileTransaction` call with `expectedHash` on the item, so a
  concurrent edit fails the whole promotion instead of half of it.

### Entry drafting

- Files: `src/newEntry.ts`, `src/template.ts`, `src/release.ts`
- Changed: `draftChangeEntry` renders without writing so callers can batch it;
  `CreateEntryOptions` gained `files`, `backlog`, `decisions`, `related`, and
  `sectionBodies`; the template engine replaces `proposed` and `active` status
  placeholders; `assignReleaseInMarkdown` uses the shared scalar helper.
- Anchor: `draftChangeEntry`
- On conflict: Keep `createChangeEntry` as draft plus one transaction; the Git
  file order of `files` is preserved unless explicit files are merged in.

### Config and registry

- Files: `src/config.ts`, `src/types.ts`, `src/workspace.ts`, `src/machine.ts`,
  `src/operations/definitions/authoring.ts`, `src/operations/registry.ts`,
  `src/operations/runtime.ts`, `src/index.ts`
- Changed: `ids.backlogWidth` and `ids.decisionWidth` with validation and
  serialization; `record-not-found` error code; the four operations, help
  examples, and public exports; `backlogTemplate` and `decisionTemplate` are
  exported for the fallback path.
- Anchor: `backlogNewOperation`
- On conflict: Operation names must match `[a-z][a-z0-9.-]*` because the engine
  derives HTTP routes from them; write operations stay without MCP tools until
  the SDK supports multi round-trip confirmation.

### Tests and docs

- Files: `test/authoring.test.ts`, `test/fixtures/operations-contract.json`,
  `README.md`, `docs/API.md`, `docs/PRODUCT.md`, `docs/SCHEMA.md`
- Changed: helper, id, CLI, promotion, and release notes tests; regenerated
  contract; command map, promotion workflow, schema notes, and stable surface.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1` and
  review the diff as a contract change.

## Behavior And UX Impact

Agents and maintainers can create backlog items and decisions without copying
templates, promote a backlog item with one command, and print release notes
from a record. Existing configs without the new width fields keep working
through defaults. No existing command changed its output.

## Invariants

- Backlog and decision ids are numbered per kind and never collide with entry
  ids.
- `promote` writes the entry and the backlog update in a single transaction.
- Fallback templates match what `ledger init` writes.

## Verification

- `npm run typecheck`
- `npx vitest run` (245 tests, including `test/authoring.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js promote B007 --from-diff --json` in this repository
- `npm run ci`

## Notes

Milestone one of 0.6 capture (B007). Next: the expiring session record kind
and `scratch`, then `ready`, then host hook installation.
