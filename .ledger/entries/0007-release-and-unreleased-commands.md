---
id: "0007"
kind: "change"
title: "Add release and unreleased commands"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "release", "agents", "tests"]
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/release.ts"
  - "test/release.test.ts"
symbols:
  - "getUnreleasedChanges"
  - "getReleaseChanges"
  - "buildReleaseDocument"
  - "releaseCommand"
  - "unreleasedCommand"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["7d0f134"]
---

# 0007: Add Release And Unreleased Commands

## Summary

Adds `ledger unreleased` for listing landed or shipped change entries that have
not been assigned to a release. Adds `ledger release <version>` for rendering a
valid Ledger release document from version-assigned entries or from the current
unreleased set.

## Why

Ledger needs a clear bridge from detailed implementation memory to release
records. The first release slice should not mutate existing change entries or
invent package-publishing behavior. It should deterministically select entries,
render a valid release source document, and optionally write that document only
when the user asks.

## Changed Files

### src/release.ts

- What changed: Adds release selection, unreleased selection, release Markdown
  rendering, and safe release-file writing.
- Anchor: `buildReleaseDocument`
- On conflict: Keep release selection deterministic and based on explicit
  Ledger metadata. Do not infer release membership from Git tags or package
  versions in this first slice.

### src/cli.ts

- What changed: Adds `ledger unreleased` and `ledger release <version>` with
  `--json`, `--include-unreleased`, and `--write` support.
- Anchor: `releaseCommand`
- On conflict: Preserve `--write` as explicit and non-overwriting so a release
  document is never replaced by accident.

### src/index.ts

- What changed: Exports the release helper API from the library entrypoint.
- Anchor: `export * from "./release.js"`
- On conflict: Keep release helpers importable for future CI, MCP, and editor
  integrations.

### test/release.test.ts

- What changed: Adds unit coverage for unreleased filtering, release filtering,
  and release Markdown rendering.
- Anchor: `getUnreleasedChanges`
- On conflict: Keep release tests fixture-based and independent from the local
  package version.

### README.md and docs/*

- What changed: Documents the unreleased and release commands in examples,
  command planning, and architecture notes.
- Anchor: `ledger release`
- On conflict: Keep the first-slice release behavior described as a Ledger
  source-document generator, not a publishing workflow.

## Behavior And UX Impact

Users can inspect unreleased work without manually querying status and release
fields. Release notes can be generated as normal Ledger release records, making
them reviewable, validateable, and useful to downstream tooling.

## Invariants

- `ledger unreleased` only selects landed or shipped change entries without a
  release assignment.
- `ledger release <version>` selects version-assigned entries unless
  `--include-unreleased` is supplied.
- `--write` creates a new release file and refuses to overwrite an existing
  release file.
- Rendered release output is valid Ledger release Markdown.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js unreleased`
- `node dist/cli.js unreleased --json`
- `node dist/cli.js release v0.1.0 --include-unreleased`
- `node dist/cli.js release v0.1.0 --include-unreleased --json`

## Notes

Later releases can add entry mutation, release status promotion, package-version
guards, changelog exports, and CI enforcement around versioned release records.
