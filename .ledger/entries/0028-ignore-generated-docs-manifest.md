---
id: "0028"
kind: "change"
title: "Ignore generated docs manifest"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs", "coverage", "config", "git"]
files:
  - ".gitignore"
  - ".ledger/config.yaml"
  - "docs/SCHEMA.md"
  - "package.json"
  - "src/config.ts"
  - "src/workspace.ts"
  - ".ledger/entries/0028-ignore-generated-docs-manifest.md"
symbols:
  - "defaultConfig"
  - "coveragePolicy"
docs:
  - "docs/SCHEMA.md"
release: "v0.1.2"
commits: ["967193a"]
---

# 0028: Ignore Generated Docs Manifest

## Summary

Adds `docs/llm/manifest.json` to Git and Ledger coverage ignore paths. The
generated docs routing manifest no longer appears as untracked work or missing
Ledger coverage after `ledger docs reconcile`.

## Why

`ledger docs reconcile` writes a generated routing artifact. The first
implementation correctly generated the manifest, but the generated file was
still treated like a normal docs change by the worktree and coverage checks.

## Changed Files

### .gitignore

- What changed: Ignores `docs/llm/manifest.json`.
- Anchor: `docs/llm/manifest.json`
- On conflict: Keep generated routing manifests out of normal source-control
  churn unless a project explicitly chooses otherwise.

### .ledger/config.yaml and src/config.ts

- What changed: Adds `docs/llm/manifest.json` to Ledger coverage ignore paths
  for this repo and default config.
- Anchor: `git.ignore`
- On conflict: Keep generated docs routing artifacts excluded from coverage
  requirements.

### src/workspace.ts

- What changed: Adds the generated manifest path to the scaffolded coverage
  policy.
- Anchor: `coveragePolicy`
- On conflict: Keep scaffolded policy aligned with default config behavior.

### docs/SCHEMA.md

- What changed: Documents the generated manifest ignore path in the coverage
  config example.
- Anchor: `Coverage Config`
- On conflict: Keep docs and defaults in sync.

### package.json

- What changed: Narrows packaged docs from the full `docs/` tree to durable
  root Markdown docs so generated routing manifests are not packed from local
  worktrees.
- Anchor: `files`
- On conflict: Keep package contents focused on durable docs and runtime assets.

## Behavior And UX Impact

Running `ledger docs reconcile` no longer leaves projects with an immediate
coverage failure for the generated manifest.

## Invariants

- Generated docs routing manifests are derived artifacts.
- Durable docs still require Ledger coverage when changed.
- Projects can still override ignore behavior in their own config.

## Verification

- `npm run check`
- `npm run build`
- `node dist/cli.js docs reconcile`
- `node dist/cli.js ci`
- `npm pack --dry-run`

## Notes

If a project wants to commit generated routing manifests, it can remove this
path from its own `.gitignore` and Ledger config.
