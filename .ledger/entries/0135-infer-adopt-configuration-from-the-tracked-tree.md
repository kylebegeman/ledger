---
id: "0135"
kind: "change"
title: "Infer adopt configuration from the tracked tree"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "adoption"
  - "config"
  - "doctor"
files:
  - "src/git.ts"
  - "src/toolchain.ts"
  - "src/workspace.ts"
  - "src/operations/definitions/records.ts"
  - "src/doctor.ts"
  - "src/symbols.ts"
  - ".ledger/policies/coverage.yaml"
  - "test/git.test.ts"
  - "test/toolchain.test.ts"
  - "test/workspace.test.ts"
  - "test/doctor.test.ts"
  - "test/operations.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/PRODUCT.md"
  - "docs/ARCHITECTURE.md"
staleRefs:
  - ".ledger/policies/coverage.yaml"
symbols:
  - "listTrackedFiles"
  - "detectToolchain"
  - "inspectToolchain"
  - "parseMakeTargets"
  - "ToolchainDetection"
  - "InitWorkspaceResult"
  - "renderGitignoreBlock"
  - "replaceGitignoreBlock"
  - "writeGitignoreBlock"
  - "gitignoreBlockStart"
  - "summarizeSymbolLanguages"
  - "codeExtensions"
  - "symbolsCheck"
docs:
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/PRODUCT.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "adopt and init now write different configuration and a .gitignore block, and the policies file is gone. The README, the SCHEMA coverage and verification sections, the PRODUCT tree, and ARCHITECTURE describe the new scaffold."
  docs:
    - "README.md"
    - "docs/SCHEMA.md"
    - "docs/PRODUCT.md"
    - "docs/ARCHITECTURE.md"
commits: []
backlog:
  - "B010"
decisions:
  - "D005"
related:
  - "0125"
  - "0131"
  - "S0002"
---

# 0135: Infer Adopt Configuration From The Tracked Tree

## Summary

`ledger adopt` reads `git ls-files` and writes a configuration that fits the
repository: coverage roots for every tracked top-level directory (hidden ones
only for `.github`) plus the root `Makefile` and primary manifest, ignores for
generated code and untracked build output (templ, sqlc output from every
tracked sqlc manifest, `.product`, `node_modules`) in both the `dir/**` and
`**/dir/**` forms, a proposed `verification.allow` for each detected
toolchain with release, deploy, and similar targets excluded, and
`git.coverage: any`. `init` and `adopt` write a marked, idempotent
`.gitignore` block for Ledger's derived files, never create
`.ledger/policies/coverage.yaml`, and add only `docs/llm` to an existing docs
tree. Doctor's symbols check stops warning about the TypeScript parser in
repositories with no TypeScript or JavaScript under coverage and names the
languages it cannot extract instead.

## Why

Product note 0125: adopting Ledger in Kore, a Go repository, needed hand edits
for every coverage root, ignore, and allowlist entry; `init` added empty docs
folders; the `.gitignore` entries were hand-written; the policies file was
never read; and doctor asked for a TypeScript peer Go code cannot use. B010's
acceptance asks that a Go repository with an existing docs tree adopts with no
manual edits.

## Changed Files

### Detection

- Files: `src/git.ts`, `src/toolchain.ts`
- Changed: `listTrackedFiles` lists tracked paths without throwing;
  `detectToolchain` derives roots, ignores, the allowlist, toolchains, and
  extensions as a pure function; `parseMakeTargets` applies the deny words;
  sqlc output rules handle nested manifests and an `out` of `.`;
  `inspectToolchain` reads only the manifests detection needs, bounded.
- Anchor: `detectToolchain`, `parseMakeTargets`
- On conflict: Emit every recursive directory ignore in both forms; never
  allow a target or script whose name contains release, publish, deploy,
  push, sign, upload, clean, or install.

### Scaffold and operations

- Files: `src/workspace.ts`, `src/operations/definitions/records.ts`,
  `.ledger/policies/coverage.yaml`
- Changed: `InitWorkspaceOptions` takes `coverage` and `detection`; the
  scaffold serializes them; the `.gitignore` markers are checked before any
  write and the block is written through the transaction layer; the policies
  directory and file are gone, including this repository's copy; adopt runs
  detection only when it writes a new config and reports coverage, roots,
  ignores, toolchains, and the `.gitignore` result; init reports the block.
- Anchor: `writeGitignoreBlock`, `adoptOperation`
- On conflict: `defaultConfig` stays unchanged so existing workspaces merge
  the same way; the block holds exactly seven derived entries.

### Doctor

- Files: `src/doctor.ts`, `src/symbols.ts`
- Changed: `codeExtensions` exported; `summarizeSymbolLanguages`;
  `symbolsCheck` reads covered tracked files.
- Anchor: `symbolsCheck`
- On conflict: The check name and position stay the same, and git-less
  workspaces keep the parser pass or warn.

### Tests, contract, and docs

- Files: `test/git.test.ts`, `test/toolchain.test.ts`,
  `test/workspace.test.ts`, `test/doctor.test.ts`, `test/operations.test.ts`,
  `test/fixtures/operations-contract.json`, `README.md`, `docs/SCHEMA.md`,
  `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`
- Changed: detection cases for a Kore-shaped tree and a TypeScript package,
  Makefile parsing, sqlc manifests, and ordering; the `.gitignore` block
  cases; Go and TypeScript doctor fixtures; the adopt acceptance case on a Go
  repository with an existing docs tree; the contract changes only in the
  init and adopt outputs; docs for adopt inference, the two-form ignore rule,
  the allowlist deny words, and the removed policies file.
- Anchor: `listTrackedFiles`
- On conflict: Keep the acceptance case byte-checking the curated
  `docs/llm/START_HERE.md`.

## Behavior And UX Impact

`ledger adopt` in a Go, Node, Rust, Python, or Swift repository produces a
config that covers its source, ignores its generated code, proposes checks it
can run, and starts on `git.coverage: any`, then says to prune the allowlist.
`ledger init` also writes the `.gitignore` block. Existing workspaces keep
their config.

## Invariants

- `defaultConfig` is unchanged, so existing configs merge the same way.
- The `.gitignore` block is replaced in place between its markers, holds
  exactly seven derived entries, and an unbalanced marker fails before any
  write.
- Every recursive directory ignore adopt emits has both forms.
- `verification.allow` never includes a denied target or script name.
- `detectToolchain` is pure and order independent.

## Verification

- `npx vitest run test/toolchain.test.ts test/workspace.test.ts test/git.test.ts test/doctor.test.ts test/operations.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (init and adopt only)
- `node dist/cli.js ready 0135`
- `npm run ci`

## Notes

Milestone five of B010 (release 0.8.0), run on Opus. Reviewers found raw
control bytes in a regex, sqlc `out: .` ignoring hand-written files, a
root-level `*.sql.go` gap, a `.gitignore` write after the scaffold, adopt
reporting inferred values over an existing config, and a SCHEMA wording
slip; all were fixed. The Stop hook drafted this receipt with the neutral
default title from 0133, and it was finished rather than replaced. Nested
toolchains such as `examples/*/go.mod` do not add roots or checks.
