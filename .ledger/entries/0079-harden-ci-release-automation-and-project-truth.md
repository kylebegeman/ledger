---
id: "0079"
kind: "change"
title: "Harden CI release automation and project truth"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["ci", "security", "release", "docs"]
files:
  - ".github/dependabot.yml"
  - ".github/workflows/ci.yml"
  - ".github/workflows/release.yml"
  - ".ledger/backlog/B001-git-aware-entry-drafting.md"
  - ".ledger/backlog/B002-static-reader.md"
  - ".ledger/backlog/B003-agent-query-tools.md"
  - ".ledger/backlog/B004-managed-docs-plane.md"
  - ".ledger/backlog/B005-architecture-and-token-efficiency-hardening.md"
  - ".ledger/backlog/B006-static-search-and-agent-context-site.md"
  - "README.md"
  - "SECURITY.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/PRODUCT.md"
  - "docs/RELEASE_PREP.md"
  - "docs/ROADMAP.md"
  - "package-lock.json"
  - "package.json"
  - "src/projectPaths.ts"
  - "test/projectPaths.test.ts"
  - "test/workflows.test.ts"
symbols:
  - "assertSafeProjectRelativePath"
  - "repository automation"
docs:
  - "README.md"
  - "SECURITY.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/PRODUCT.md"
  - "docs/RELEASE_PREP.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "Runtime support, release authentication, shipped backlog state, roadmap status, and current product workflows are now documented from the hardened implementation."
  docs:
    - "README.md"
    - "SECURITY.md"
    - "docs/IMPLEMENTATION_PLAN.md"
    - "docs/PRODUCT.md"
    - "docs/RELEASE_PREP.md"
    - "docs/ROADMAP.md"
commits: []
---

# 0079: Harden CI Release Automation And Project Truth

## Summary

CI now covers maintained Node LTS releases across Linux, macOS, and Windows,
audits production dependencies, and installs the packed package. Release
automation validates tag and package versions, supports npm OIDC trusted
publishing with a token fallback, and no longer silently succeeds without
publishing credentials.

## Why

Node 20 reached end of life in March 2026, the workflows used older unpinned
action releases, and the release job could finish successfully without
publishing. Several roadmap and backlog records also described shipped work as
proposed. Production readiness requires maintained runtimes, explicit release
failure, supply-chain checks, and documentation that matches behavior.

## Changed Files

### CI and supply chain

- Files: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `package.json`,
  `package-lock.json`, `test/workflows.test.ts`, `README.md`
- Rule: Support Node 22 and newer, test Node 22 and Node 24 on all three hosted
  operating systems, pin third-party actions to full commits, audit production
  dependencies, and smoke-test the installed tarball with scripts disabled.
- On conflict: Do not reintroduce end-of-life runtimes, floating action tags, or
  a package check that only exercises the source checkout.

### Release automation

- Files: `.github/workflows/release.yml`, `docs/RELEASE_PREP.md`, `SECURITY.md`
- Rule: A release tag must match `package.json`; an unpublished version must
  either publish with OIDC or the migration token fallback, or fail visibly.
- On conflict: Keep `contents: read`, `id-token: write`, a GitHub-hosted runner,
  exact action revisions, full verification, and provenance publishing.

### Path edge cases and durable truth

- Files: `src/projectPaths.ts`, `test/projectPaths.test.ts`,
  `.ledger/backlog/*.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/PRODUCT.md`,
  `docs/ROADMAP.md`
- Rule: Empty, current-directory, drive-absolute, drive-relative, and traversal
  paths are rejected. Durable docs distinguish shipped workflows from planned
  convenience commands and future scale adapters.
- On conflict: Preserve the fail-closed path boundary and do not present a CLI
  command as shipped unless it exists in help and has tests.

## Behavior And UX Impact

Package consumers now need Node 22 or newer. Contributors get broader CI
coverage and automated dependency update pull requests. Maintainers get a
release workflow that fails on tag drift or missing authentication instead of
producing a false successful release.

## Invariants

- CI covers every declared minimum LTS line and all advertised operating systems.
- GitHub Actions use immutable commit revisions.
- Release tags and package versions agree before registry lookup or publish.
- Release authentication prefers short-lived OIDC credentials.
- Packed-package smoke tests do not execute dependency lifecycle scripts.
- Durable docs and backlog status reflect current implementation truth.

## Verification

- Workflow and Dependabot YAML parsing.
- Workflow contract tests for matrix, audit, install smoke, pinned actions,
  release tag checks, provenance, and OIDC permission.
- Deterministic path traversal and Windows drive-path tests.
- `npm audit --omit=dev --audit-level=high` with zero vulnerabilities.
- Clean tarball installation and `ledger version` execution.
- `npm run ci`.

## Notes

Current runtime and publishing decisions were checked against the official Node
release schedule and npm trusted publishing documentation on 2026-07-12.
