---
id: "0013"
kind: "change"
title: "Polish CLI help output"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli", "docs", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "test/cliHelp.test.ts"
symbols:
  - "helpText"
  - "helpTopicForCommand"
docs: []
release: "v0.1.1"
commits: ["ec655d1"]
---

# 0013: Polish CLI Help Output

## Summary

Adds command-specific help, nested docs help, and `ledger version`. Updates the
README with first-run examples for `ledger help` and `ledger version`.

## Why

The broad usage list was enough for internal development but thin for a public
CLI. Users should be able to ask for focused help without reading source or the
full README.

## Changed Files

### src/cli.ts

- What changed: Adds `ledger help <command>`, command `--help` handling, nested
  docs help topics, and `ledger version`.
- Anchor: `helpText`
- On conflict: Keep help text short and command-oriented. Detailed product docs
  belong in Markdown.

### test/cliHelp.test.ts

- What changed: Adds focused coverage for general help, command help, nested
  docs help, and version output.
- Anchor: `captureRun`
- On conflict: Keep tests calling `run()` directly so they do not depend on a
  built `dist/` tree.

### README.md

- What changed: Adds help and version examples plus a short command help
  section.
- Anchor: `Command Help`
- On conflict: Keep README examples aligned with actual CLI help output.

## Behavior And UX Impact

Users can discover flags and command intent from the CLI itself. Nested docs
commands can be documented without expanding the top-level usage block further.

## Invariants

- `ledger help` exits 0.
- `ledger help <command>` exits 0 for known commands.
- `<command> --help` exits 0 without executing the command.
- `ledger version` prints the current package version string.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js help`
- `node dist/cli.js help new`
- `node dist/cli.js docs impact --help`
- `node dist/cli.js version`
- `node dist/cli.js coverage`

## Notes

The version string is currently kept in the CLI source and should be updated
with package releases.
