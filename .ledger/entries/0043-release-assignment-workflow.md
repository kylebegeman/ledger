---
id: "0043"
kind: "change"
title: "Add release assignment workflow"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["release", "cli", "tests", "docs"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
  - "src/cli.ts"
  - "src/release.ts"
  - "test/release.test.ts"
  - ".ledger/entries/0043-release-assignment-workflow.md"
symbols:
  - "assignEntriesToRelease"
  - "assignReleaseInMarkdown"
  - "releaseCommand"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
commits: []
---

# 0043: Add Release Assignment Workflow

## Summary

Adds `ledger release <version> --assign`, which writes the selected release
version back to the selected change entries before optionally writing the
release record. Also updates the README positioning to make Ledger's
agent-first focus explicit while preserving full CLI support for humans.

## Why

Release generation could already render notes from assigned entries or preview
unreleased entries, but users still had to manually edit each entry to set the
release field. Explicit assignment makes the release workflow complete while
keeping source mutation opt-in.

## Changed Files

### src/release.ts

- What changed: Adds release assignment helpers for updating entry frontmatter.
- Anchor: `assignEntriesToRelease`
- On conflict: Keep mutation explicit and limited to selected Ledger entries.

### src/cli.ts

- What changed: Adds `--assign` to `ledger release` and reports assignment
  details in human and JSON output.
- Anchor: `releaseCommand`
- On conflict: Preserve preview-only behavior when `--assign` is absent.

### test/release.test.ts

- What changed: Adds coverage for assigning release frontmatter.
- Anchor: `assignReleaseInMarkdown`
- On conflict: Preserve replacement of existing `release` lines.

### README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md

- What changed: Documents the assignment workflow, roadmap status, and
  agent-first README positioning.
- Anchor: `Release Workflow`
- On conflict: Keep docs clear that `--assign` mutates source records.

## Behavior And UX Impact

Maintainers can promote unreleased landed entries into a patch release without
hand-editing each change record. README readers also get a clearer signal that
Ledger is primarily designed for agent use while remaining usable by humans.

## Invariants

- Release assignment is opt-in.
- Release records still refuse to overwrite existing release files.
- Preview release output remains non-mutating without `--assign`.
- Assigned entries keep existing frontmatter and body content.
- Public README positioning stays agent-first without minimizing CLI support.

## Verification

- `npm run typecheck`
- `npx vitest run test/release.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js release v0.1.8 --include-unreleased --status planned --json`

## Notes

Future release work can add public/internal note templates or changelog export
formats.
