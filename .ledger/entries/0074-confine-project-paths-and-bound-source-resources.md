---
id: "0074"
kind: "change"
title: "Confine project paths and bound source resources"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["security", "parser", "config"]
files:
  - ".ledger/config.yaml"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "src/config.ts"
  - "src/documents.ts"
  - "src/frontmatter.ts"
  - "src/migrate.ts"
  - "src/projectPaths.ts"
  - "src/stale.ts"
  - "src/symbols.ts"
  - "src/types.ts"
  - "src/validate.ts"
  - "src/workspace.ts"
  - "test/config.test.ts"
  - "test/documentLimits.test.ts"
  - "test/projectPaths.test.ts"
  - "test/validate.test.ts"
symbols:
  - "UnsafeProjectPathError"
  - "assertSafeProjectRelativePath"
  - "assertNoEscapingSymlink"
  - "readLedgerDocuments"
  - "validateDocuments"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Architecture and schema docs now define path confinement and source resource limits."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
release: "v0.2.0"
---

# 0074: Confine Project Paths And Bound Source Resources

## Summary

Ledger now confines configured paths and record references to the discovered
project root, including checks for existing symlink chains that escape the
workspace. Config and record YAML parsing plus source discovery now have
explicit size, count, alias, aggregate-byte, and nesting limits.

## Why

Agents and CI commonly run repository-owned configuration without inspecting
every value first. A malicious or accidental `../` output, external symlink, or
unbounded catalog could previously read outside the repository, write generated
artifacts outside it, or consume excessive resources. The protection belongs in
the shared workspace and parser boundaries so every CLI and MCP workflow gets
the same behavior.

## Changed Files

### Path and configuration boundary

- Files: `src/projectPaths.ts`, `src/config.ts`, `src/workspace.ts`,
  `src/types.ts`, `.ledger/config.yaml`
- Rule: Configured paths are project-relative and existing ancestors must not
  resolve outside the project. Resource limits are positive integers with safe
  defaults.
- On conflict: Preserve fail-closed path validation before any source or output
  workflow runs.

### Parser and reference boundary

- Files: `src/documents.ts`, `src/frontmatter.ts`, `src/validate.ts`,
  `src/stale.ts`, `src/symbols.ts`, `src/migrate.ts`
- Rule: Bound discovery and YAML aliases, reject unsafe file/docs references,
  and never open an unsafe reference during stale-symbol inspection.
- On conflict: Do not reintroduce direct joins of untrusted relative paths
  without the shared project-path guard.

### Verification and documentation

- Files: `test/config.test.ts`, `test/documentLimits.test.ts`,
  `test/projectPaths.test.ts`, `test/validate.test.ts`,
  `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Rule: Tests cover lexical traversal, cross-platform absolute paths, escaping
  symlinks, unsafe record references, document size, count, and nesting.
- On conflict: Keep the documented defaults synchronized with initialized
  workspace config.

## Behavior And UX Impact

Normal project-relative configurations continue to work. Unsafe paths now fail
workspace discovery or validation with a specific explanation. Very large
catalogs can raise their limits explicitly rather than consuming unbounded
resources by default.

## Invariants

- Markdown remains the source of truth.
- Ledger does not read or write outside the discovered project through
  configured paths or record references.
- Resource limits are configurable, positive, and enabled by default.
- Unsafe references are errors and are not opened by later diagnostics.

## Verification

- `npm run check`
- `npm run build`

## Notes

This milestone establishes the filesystem and parser boundary required before
adding transactional write workflows.
