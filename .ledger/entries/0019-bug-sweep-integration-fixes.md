---
id: "0019"
kind: "change"
title: "Complete bug sweep and integration fixes"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "config", "git", "render", "drafting", "package", "tests"]
files:
  - "package.json"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/frontmatter.ts"
  - "src/git.ts"
  - "src/newEntry.ts"
  - "src/render.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/config.test.ts"
  - "test/frontmatter.test.ts"
  - "test/git.test.ts"
  - "test/newEntry.test.ts"
  - ".ledger/entries/0019-bug-sweep-integration-fixes.md"
symbols:
  - "run"
  - "packageVersion"
  - "readLedgerConfig"
  - "parseMarkdownWithFrontmatter"
  - "getChangedFileDetails"
  - "renderTemplate"
  - "renderStaticReaderHtml"
docs:
  - "docs/IMPLEMENTATION_PLAN.md"
commits: ["31c7f0b"]
---

# 0019: Complete Bug Sweep And Integration Fixes

## Summary

Completes an active bug sweep and integration pass across the Ledger package.
The pass fixes safe issues in CLI testability, config and frontmatter
diagnostics, git coverage, generated entry escaping, rendered search payloads,
and npm package contents.

## Why

Ledger is now using itself as its own QA workflow. The package needed a tighter
integration pass before the next feature slice so routine development can
exercise the CLI without global cwd mutations, missing untracked files, stale
version strings, or unclear parse failures.

## Changed Files

### src/cli.ts

- What changed: Adds an injectable `cwd` run context for command execution and
  resolves `ledger version` from package metadata with a fallback.
- Anchor: `run`
- On conflict: Keep command implementations using the explicit run context so
  tests and embedded callers do not mutate process-wide cwd.

### src/config.ts

- What changed: Prefixes YAML parse failures with the config path and normalizes
  configured paths and git glob patterns after merge.
- Anchor: `readLedgerConfig`
- On conflict: Preserve path-aware errors and normalized slash-separated config
  values before downstream commands consume them.

### src/frontmatter.ts

- What changed: Prefixes Ledger document frontmatter parse failures with the
  offending document path.
- Anchor: `parseMarkdownWithFrontmatter`
- On conflict: Keep document parse failures actionable for both humans and
  agents running `ledger validate` or `ledger ci`.

### src/git.ts

- What changed: Expands unstaged git status with `--untracked-files=all` so
  untracked directories report their contained files.
- Anchor: `getChangedFileDetails`
- On conflict: Keep coverage based on file-level changes, not directory summary
  placeholders.

### src/newEntry.ts

- What changed: Escapes YAML-string placeholders while preserving raw Markdown
  title output in generated entries.
- Anchor: `renderTemplate`
- On conflict: Keep frontmatter safe for quotes, backslashes, and newlines while
  preserving readable Markdown headings.

### src/render.ts

- What changed: Removes full Markdown source from the card search attribute
  while keeping source available in details and embedded data.
- Anchor: `renderStaticReaderHtml`
- On conflict: Keep rendered search useful without duplicating entire document
  source in every card attribute.

### package.json

- What changed: Includes contributing and security docs in package contents.
- Anchor: `files`
- On conflict: Keep public project docs that users expect available in npm
  package tarballs.

### test/*

- What changed: Adds focused coverage for cwd-injected CLI runs, dynamic
  version output, path-normalized config, parse diagnostics, untracked directory
  file discovery, and YAML-safe entry generation.
- Anchor: `npm run check`
- On conflict: Keep these tests exercising real edge cases rather than only
  string-shape snapshots.

## Behavior And UX Impact

CLI commands are easier to embed and test, invalid YAML errors are easier to
act on, coverage no longer misses files inside new untracked directories,
generated entries tolerate quoted titles, and packaged installs include the
expected public project docs.

## Invariants

- CLI commands must resolve the workspace from the explicit run context.
- Config and document parse errors must include the relevant file path.
- Coverage must evaluate concrete changed files.
- Generated Ledger frontmatter must remain valid YAML.
- Rendered records must keep Markdown source accessible without bloating search
  attributes.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js validate`
- `node dist/cli.js index`
- `node dist/cli.js render`
- `node dist/cli.js docs check`
- `node dist/cli.js coverage`
- `node dist/cli.js ci`
- `node dist/cli.js release v0.1.0 --include-unreleased --status released --date 2026-06-29 --json`
- `node dist/cli.js release invalid --include-unreleased` exits non-zero
- `npm pack --dry-run`

## Notes

Deferred items should remain limited to decisions that change product behavior,
storage compatibility, or public workflow expectations.
