---
id: "0078"
kind: "change"
title: "Verify integrity and add safe render profiles"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["security", "integrity", "render", "performance"]
files:
  - "README.md"
  - "SECURITY.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "docs/RELEASE_PREP.md"
  - "docs/SCHEMA.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/integrity.ts"
  - "src/machine.ts"
  - "src/mcp.ts"
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/integrity.test.ts"
  - "test/largeCatalog.test.ts"
  - "test/mcp.test.ts"
  - "test/render.test.ts"
symbols:
  - "readIntegrityReport"
  - "verifyIntegrityReport"
  - "LedgerRenderProfile"
  - "buildStaticReaderModel"
  - "writeStaticReader"
docs:
  - "README.md"
  - "SECURITY.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "docs/RELEASE_PREP.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "Public, API, architecture, schema, release, and security docs now define integrity check mode and the fail-closed public render profile."
  docs:
    - "README.md"
    - "SECURITY.md"
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
    - "docs/RELEASE_PREP.md"
    - "docs/SCHEMA.md"
commits: []
release: "v0.2.0"
---

# 0078: Verify Integrity And Add Safe Render Profiles

## Summary

Integrity artifacts can now be used as read-only baselines through CLI, MCP,
and library APIs. The static reader also has a separate fail-closed public
profile that exports only released release records and explicit public notes.

## Why

Writing hashes without comparing them did not detect drift, and the internal
reader contained repository metadata that should not be published by accident.
The new boundaries make provenance checks actionable and require an explicit,
sanitized export path for public release notes.

## Changed Files

### Integrity verification

- Files: `src/integrity.ts`, `src/machine.ts`, `src/cli.ts`, `src/mcp.ts`,
  `src/index.ts`, `test/integrity.test.ts`, `test/cliE2e.test.ts`,
  `test/mcp.test.ts`
- Rule: `--check` reads and validates the existing baseline, compares current
  content in memory, reports added, removed, and changed paths, and never
  replaces the baseline.
- On conflict: Preserve baseline validation, size and count limits, project
  identity checks, typed failures, and nonzero CLI status on mismatch.

### Public render profile

- Files: `src/render.ts`, `src/renderHtml.ts`, `src/cli.ts`, `test/render.test.ts`
- Rule: Public output is isolated under `.ledger/dist/public/` and includes
  only `status: released` release records plus `Public Notes` bullets.
- On conflict: Raw Markdown, repository paths, files, symbols, relationships,
  validation issues, invariants, verification details, and extension fields
  must remain absent from public HTML and JSON.

### Scale regression and documentation

- Files: `test/largeCatalog.test.ts`, `test/cliHelp.test.ts`, `README.md`,
  `SECURITY.md`, `docs/API.md`, `docs/ARCHITECTURE.md`,
  `docs/RELEASE_PREP.md`, `docs/SCHEMA.md`
- Rule: Keep a deterministic 1,500-record model and search regression test, and
  document the public export as data minimization rather than authentication.
- On conflict: Use a generous performance ceiling that detects major
  regressions without encoding machine-specific benchmark expectations.

## Behavior And UX Impact

`ledger verify-integrity --check` exits 1 on content or project mismatch and
returns structured verification details with `--json`. `ledger render --profile
public` creates publishable release-note artifacts without replacing the
internal reader.

## Invariants

- Integrity check mode never writes the expected baseline.
- Invalid or oversized integrity baselines fail before comparison.
- Public rendering is opt-in, isolated, and fail-closed.
- Planned releases and non-release records never enter public output.
- Public search and graph artifacts obey the same sanitization as public HTML.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm test`
- Focused integrity, render, CLI, MCP, and 1,500-record regression tests.

## Notes

The public profile does not provide authentication. Review explicit public
notes before publishing `.ledger/dist/public/`.
