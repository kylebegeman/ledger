---
id: "0081"
kind: "change"
title: "Complete production hardening audit"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas:
  - "cli"
  - "security"
  - "reliability"
  - "reader"
files:
  - "src/**"
  - "src/boundedFile.ts"
  - "src/fileTransaction.ts"
  - "src/render.ts"
  - "src/serve.ts"
  - "src/validate.ts"
  - "test/**"
  - ".github/workflows/release.yml"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "README.md"
  - "SECURITY.md"
symbols:
  - "applyFileTransaction"
  - "readUtf8FileLimited"
  - "serveStaticReader"
  - "validateDocuments"
  - "writeStaticReader"
docs:
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "README, security, API, architecture, and schema guidance now describe the hardened serving, transaction, validation, and file-boundary behavior."
  docs:
    - "README.md"
    - "SECURITY.md"
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
---

# 0081: Complete production hardening audit

## Summary

Completed an active production audit of the Ledger 2.0 hardening work. File
boundaries, recoverable writes, validation, public rendering, serving, CLI and
MCP inputs, migrations, releases, and publishing automation now fail safely and
consistently under malformed, oversized, concurrent, and adversarial inputs.
Generated reports, indexes, integrity data, and reader bundles now share the
journaled transaction layer.

## Why

The earlier hardening milestones established the right architecture but still
contained several partial integrations and race-prone paths. In particular,
untrusted recovery journals could influence filesystem work, corrupt locks could
remain permanent, generated outputs were not uniformly atomic, parser errors
could be hidden, CLI and MCP boundaries accepted ambiguous input, and the public
reader still exposed internal interaction concepts. These fixes make the safety
properties systemic rather than command-specific.

## Changed Files

### Filesystem, transactions, and generated artifacts

- Files: `src/boundedFile.ts`, `src/projectPaths.ts`,
  `src/fileTransaction.ts`, and generated-output writers under `src/`.
- Rule: Open bounded regular files through handles, reject unsafe paths and
  invalid UTF-8, validate journals before hydrating paths, serialize stale-lock
  recovery, and commit multi-file generated outputs atomically.
- On conflict: Never restore direct, unbounded, or symlink-following reads at an
  untrusted boundary. Never bypass the transaction layer for a generated output
  set that readers consume together.

### Validation, commands, and integrations

- Files: CLI, MCP, config, document, migration, release, integrity, validation,
  doctor, stale-symbol, and workspace modules under `src/`.
- Rule: Reject unknown or malformed inputs, preserve positional arguments after
  boolean flags, validate semantic dates and kinds, bound every catalog-derived
  operation, and propagate operational failures instead of treating them as
  missing data.
- On conflict: Compatibility handling must remain explicit. Corrupt baselines,
  invalid journals, and filesystem permission failures must fail closed.

### Reader and serving boundary

- Files: `src/render.ts`, `src/renderHtml.ts`, `src/renderAssets.ts`,
  `src/serve.ts`, and `src/cli.ts`.
- Rule: The public model is constructed from an allowlist of release fields and
  the public server serves only `.ledger/dist/public`. Watch rebuilds are
  debounced and single-flight; network exposure remains opt-in and authenticated.
- On conflict: Internal paths, source Markdown, relationships, validation data,
  invariants, verification, or extension fields must not enter public artifacts.

### Tests, release automation, and documentation

- Files: `test/**`, `.github/workflows/release.yml`, `README.md`, `SECURITY.md`,
  and durable docs listed in frontmatter.
- Rule: Regression coverage protects malformed boundaries and public isolation.
  npm publication proceeds only after a confirmed registry `E404`; network or
  authentication failures stop the workflow.
- On conflict: Do not interpret every failed `npm view` as an unpublished
  version, and keep operational documentation aligned with actual defaults.

## Behavior And UX Impact

Users receive precise failures for typos, invalid numeric flags, malformed
baselines, bad dates, unsafe paths, oversized inputs, and invalid UTF-8. Public
release notes have a focused release-only interface and can be previewed with
`ledger serve --profile public`. Maintainers get recoverable generated writes,
safe stale-lock repair, non-overlapping watch builds, stricter MCP contracts,
and publishing automation that stops on registry outages.

## Invariants

- Project-relative paths remain confined after canonicalization and symlink
  resolution.
- Recovery never trusts a journal filename, ID, path, hash, mode, or phase before
  schema validation.
- Concurrent or interrupted multi-file writes either commit together or recover
  the prior state.
- Public HTML and JSON contain only released release metadata and explicit
  public notes.
- CLI and MCP inputs reject unknown fields and invalid values without silently
  changing behavior.
- Source and baseline reads stay within configured count, depth, and byte limits.

## Verification

- `npm run ci`
- `npm audit --omit=dev --audit-level=high`
- packed-install smoke test in a fresh temporary project
- `node dist/cli.js doctor`
- `node dist/cli.js stale --check`
- public-render leak scan of `.ledger/dist/public`

## Notes

This receipt completes the safe implementation work discovered during the audit.
Broader product architecture choices remain separate from this hardening pass.
