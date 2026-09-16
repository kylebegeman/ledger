---
id: "0125"
kind: "product-note"
title: "Adopting Ledger in a Go repository needs hand-tuned configuration"
date: "2026-09-16"
updated: "2026-09-16"
status: "captured"
areas:
  - "adoption"
  - "config"
tags:
  - "dogfood"
---

# 0125: Adopting Ledger In A Go Repository Needs Hand-Tuned Configuration

## Context

Ledger 0.7.0 was adopted in Kore, Kyle's Go, SQLite or PostgreSQL, and HTMX
product factory, as the open B007 acceptance check. Kore has an established
history, its own curated `docs/` tree, committed generated code, and no
`package.json`. `ledger adopt`, `hooks install` for Claude Code and Codex,
`skills install`, and `agents --write` ran through
`npx --yes @kylebegeman/ledger@0.7.0`.

## Finding

The scaffold validated, but almost every default described a TypeScript
package rather than Kore:

- `git.requireEntryFor` named `src/**`, `test/**`, and `docs/**`, so no Kore
  source (`cmd`, `internal`, `blueprints`, `plugins`, `registry`, `examples`,
  and others) needed a receipt. The list had to be written by hand.
- `git.coverage` stayed `current`, although `adopt` exists for repositories
  with history and the 0.7.0 notes tell adopters to switch to `any` by hand.
- `git.ignore` treated `build/**` as output (Kore's OCI image source lives
  there) and `docs/llm/START_HERE.md` and `docs/llm/manifest.json` as
  generated (Kore curates both), while Kore's committed generated code
  (`*_templ.go`, sqlc stores, `.product/` composition provenance) was not
  ignored.
- `adopt` created empty `docs/api`, `docs/guides`, and `docs/reference`
  folders beside Kore's existing docs layout, under partial adoption.
- Nothing was added to `.gitignore`, so indexes, reports, the reader, the
  cache, transactions, the write lock, and the daemon record were one
  `git add .` away from being committed.
- `verification.allow` named `npm`, `npx vitest`, and `node dist/cli.js`
  commands that do not exist in a Go repository.
- `doctor` warned to install the optional `typescript` peer, which cannot
  help: symbol extraction covers TypeScript, JavaScript, and Markdown only, so
  Go symbols and anchors are never extracted or checked.
- `init` writes `.ledger/policies/coverage.yaml` with the same TypeScript
  coverage defaults, but no command reads it, so it silently contradicts the
  real `git` config after tuning. It was left out of Kore.
- `ledger new --from-diff` drafted Kore's first receipt with 48 symbols: every
  heading of every changed Markdown file, including untouched sections of
  `docs/PLAN.md`, Ledger's own templates, and placeholders such as
  `{{id}}: {{title}}` and `path/to/file.ts` (compare product note 0122).

## Impact

A fresh adopter gets a workspace that passes validation while enforcing
nothing useful: coverage misses the real source, flags every historical file
once source paths are added, and ignores the wrong paths. Each correction
needs knowledge of Ledger's config that the adopter does not have yet.

## Recommendation

Make `adopt` inspect the tracked tree before writing config: infer
`requireEntryFor` from top-level directories that contain tracked source,
default `git.coverage` to `any` for `adopt` (keep `current` for `init`), skip
docs taxonomy folders when a docs root already exists, append a marked
`.gitignore` block for derived state, and propose a verification allowlist
from the detected toolchain (Makefile targets, `go test`, package scripts).
Scope doctor's symbols check to repositories with TypeScript or JavaScript in
coverage, and say plainly when a language has no extractor.

## Follow-ups

- Toolchain-aware `adopt` defaults for coverage roots, ignores, and the
  verification allowlist.
- A marked `.gitignore` block written by `init` and `adopt`.
- Doctor's symbols check scoped to languages Ledger can extract.
- Remove `.ledger/policies/coverage.yaml` from the scaffold or read it.
- Draft Markdown symbols only from changed hunks, and skip Ledger's scaffold
  files when drafting.
