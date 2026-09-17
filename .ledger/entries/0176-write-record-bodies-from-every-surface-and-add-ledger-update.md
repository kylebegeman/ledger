---
id: "0176"
kind: "change"
title: "Write record bodies from every surface and add ledger update"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "authoring"
  - "mcp"
files:
  - ".agents/skills/ledger/SKILL.md"
  - "README.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "src/authoring.ts"
  - "src/frontmatterEdit.ts"
  - "src/mcp.ts"
  - "src/newEntry.ts"
  - "src/operations/definitions/authoring.ts"
  - "src/operations/definitions/server.ts"
  - "src/operations/definitions/sessions.ts"
  - "src/operations/registry.ts"
  - "src/operations/shared.ts"
  - "src/operations/types.ts"
  - "src/sections.ts"
  - "src/sessions.ts"
  - "src/skills.ts"
  - "src/template.ts"
  - "test/fixtures/operations-contract.json"
  - "test/mcpWriteTools.test.ts"
  - "test/operations.test.ts"
  - "test/recordBodies.test.ts"
symbols:
  - "checkSectionBodies"
  - "applySectionBodies"
  - "replaceSectionBody"
  - "setFrontmatterBlock"
  - "renderLedgerTemplate"
  - "updateRecord"
  - "prepareRecordFlags"
  - "updateOperation"
  - "runConfirmedLedgerMcpTool"
docs:
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The README, API, and architecture docs describe section bodies, the new fields, ledger update, and MCP prechecks."
  docs:
    - "README.md"
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
commits: []
decisions:
  - "D008"
related:
  - "0173"
release: "v0.9.2"
---

# 0176: Write record bodies from every surface and add ledger update

## Summary

Records can be written whole from the CLI, the JSON API, and MCP.

- **Section bodies.** `new`, `feedback`, `backlog new`, `decision new`,
  `promote`, and the new `update` accept `sections`, keyed by heading.
  - On the CLI, they come from `--section Heading=text` and
    `--sections-file`, which reads every `## Heading` block of a Markdown
    file.
  - `new` also takes `--file`, `--doc`, `--symbol`, `--related`,
    `--decision`, `--backlog`, and `--docs-impact` with its reason and docs.
  - One command can therefore write a receipt that passes `ready`.
- **`ledger update <id>`.** It rewrites a record's title (and its `# id:
  title` heading), status, list fields, docs impact, or sections in place.
  It sets `updated`, and the file keeps its path.
- **MCP.**
  - `ledger_update` joins the confirmed tools.
  - Every confirmed tool now dry-runs its write through `mcp.precheck`
    before asking, so the user is never asked to approve a call that would
    fail.
  - Confirmation messages name the sections a call writes.

## Why

D008 left one gap: records created over MCP were templates, because the
authoring operations took no body text. Kyle asked for body text and for
every other open item in one release. An agent without file access also
could not finish a hook-drafted receipt, so `update` closes that gap too.

Rejected:

- **Accepting whole Markdown bodies.** Per-section bodies keep the
  template's structure and let `update` touch one section.
- **Silently ignoring unknown headings.** The error lists the kind's
  sections instead.

While writing user text into records, a latent bug turned up. Template
rendering and the frontmatter helpers passed values as string replacements,
so `$$`, `$&`, and the other `$` patterns in a title or reason were
rewritten. They now use replacer functions.

## Changed Files

### Sections and frontmatter

- Files: `src/sections.ts`, `src/frontmatterEdit.ts`, `src/template.ts`
- Changed:
  - `checkSectionBodies` validates bodies:
    - known headings only
    - no line starting with `#` or `##`, even inside a fence, because the
      section parser does not skip fences
    - no NUL characters
    - at most 20,000 characters
  - `applySectionBodies` writes bodies and can append a missing section.
    `parseSectionBodies` reads `--sections-file`.
  - `replaceSectionBody` matches headings the way the parser does and
    leaves one blank line for an empty body.
  - `setFrontmatterBlock` replaces a nested block such as `docsImpact`.
  - All replacements use replacer functions.
- Anchor: `checkSectionBodies`, `applySectionBodies`, `replaceSectionBody`,
  `setFrontmatterBlock`, `renderLedgerTemplate`
- On conflict: Keep refusing `#` and `##` lines in bodies unless the section
  parser learns to skip fences.

### Authoring

- Files: `src/newEntry.ts`, `src/authoring.ts`, `src/sessions.ts`
- Changed:
  - `draftChangeEntry` takes caller `sections`, `docs`, `symbols`, and
    `docsImpact`, rendered by `docsImpactLines`.
  - The product note, backlog, decision, and promote paths take `sections`
    and a `dryRun` option.
  - `updateRecord` edits a record in one checked transaction and parses
    the result before writing. It limits docs impact and symbols to change
    entries.
  - `findRecordByPath` addresses records by path, and
    `assertSessionSelectable` lets session tools check a selector.
- Anchor: `draftChangeEntry`, `updateRecord`, `retitleHeading`,
  `promoteRecord`, `assertSessionSelectable`
- On conflict: `update` never moves the file; links and session lists name
  the path.

### Operations and MCP

- Files: `src/operations/types.ts`, `src/operations/shared.ts`,
  `src/operations/registry.ts`, `src/operations/definitions/authoring.ts`,
  `src/operations/definitions/sessions.ts`,
  `src/operations/definitions/server.ts`, `src/mcp.ts`
- Changed:
  - `sectionsInput` and `docsImpactInput` are shared input schemas.
  - The section and docs impact flags declare `preparedInto`, and
    `prepareRecordFlags` folds them into the input.
  - The contract shows `preparedInto`.
  - `updateOperation` is registered after `promote`, with a confirmed MCP
    tool.
  - `LedgerOperationMcp.precheck` runs before the confirmation for new,
    feedback, backlog new, decision new, promote, update, session note, and
    session close.
- Anchor: `prepareRecordFlags`, `updateOperation`, `LedgerOperationMcp`,
  `runConfirmedLedgerMcpTool`
- On conflict: Every confirmed tool whose write can fail on the target keeps
  a precheck.

### Skill, tests, and docs

- Files: `src/skills.ts`, `.agents/skills/ledger/SKILL.md`,
  `test/recordBodies.test.ts`, `test/mcpWriteTools.test.ts`,
  `test/operations.test.ts`, `test/fixtures/operations-contract.json`,
  `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`
- Changed:
  - The skill mentions `update` for finishing drafts.
  - New tests cover:
    - the section rules, `$` literals, and block replacement
    - a finished receipt in one command that passes `ready`
    - bodies on every record kind, and `update` in place and by path
    - appended sections and refusals
    - MCP confirmation text, and prechecks that stop four kinds of failing
      call before asking
  - The injection test moved to `update`, because promote now refuses an
    unknown id before asking.
  - The flag test honors `preparedInto`, and the contract adds `update`
    and the new fields.
  - The README, API, and architecture docs describe record bodies and
    `update`.
- Anchor: `records written with body text`,
  `MCP writes with body text`, `Record Bodies`
- On conflict: Keep a test that a one-command receipt passes `ready`.

## Behavior And UX Impact

- Agents and scripts can create finished records without editing files, and
  MCP-only clients can fill hook drafts.
- `ledger update` is a new command.
- MCP clients see a tenth write tool, confirmation text naming the
  sections, and immediate errors in place of confirmations for calls that
  would fail.
- Titles and reasons keep their `$` characters.

## Invariants

- A caller-written section body never contains a `#` or `##` line.
- Every heading written by a caller exists in the kind's template or, for
  `update`, in the record.
- `update` writes one file, keeps its path, and sets `updated` to today.
- A confirmed MCP tool asks only after its precheck passes.
- Record text with `$` sequences is written literally.

## Verification

- `npx vitest run test/recordBodies.test.ts test/mcpWriteTools.test.ts test/operations.test.ts`
- `npm run typecheck`
- `npm run ci`

## Notes

The receipt itself was written with `ledger new --sections-file`.
