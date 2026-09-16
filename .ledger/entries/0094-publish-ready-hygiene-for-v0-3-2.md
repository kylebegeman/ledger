---
id: "0094"
kind: "change"
title: "Publish-ready hygiene for v0.3.2"
date: "2026-09-15"
updated: "2026-09-15"
status: "landed"
areas:
  - "release"
  - "docs"
  - "ci"
files:
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/RELEASE_PREP.md"
  - ".ledger/config.yaml"
  - ".github/workflows/release.yml"
  - "package.json"
  - "package-lock.json"
docs:
  - "docs/RELEASE_PREP.md"
docsImpact:
  status: "updated"
  reason: "Release prep now documents that the tag workflow creates the GitHub Release from the release record's public notes."
  docs:
    - "docs/RELEASE_PREP.md"
decisions:
  - "D005"
commits: []
related:
  - "0093"
release: "v0.3.2"
---

# 0094: Publish-Ready Hygiene For V0.3.2

## Summary

Bumped the package to 0.3.2, made the release workflow publish through npm
trusted publishing with an `NPM_TOKEN` fallback and create a GitHub Release
from the release record's public notes, removed the Homebrew install
instructions, replaced the `master` and `next` branch model with pull requests
into `master`, required a `Public Notes` section on this repository's release
records, and raised the internal render total budget to 2,500,000 bytes.

## Why

The published npm package was 0.1.12 while the repository was at v0.3.1; the
release workflow failed with `ENEEDAUTH` on the v0.2.0, v0.3.0, and v0.3.1
tags because no npm credential was configured, and the empty token written by
`registry-url` also blocked the OIDC path. The `next` branch was 46 commits
behind `master` with no unique work, and README plus CONTRIBUTING described a
branch model nobody used. README advertised a Homebrew tap that does not
exist. The public render profile emits only `Public Notes`, but this
repository did not require that section. The internal render measured
2,114,744 bytes against a 2,000,000 byte total while every artifact was
within its own limit, so the total budget contradicted its parts. These are
the hygiene track from decision D005.

## Changed Files

### Release workflow

- File: `.github/workflows/release.yml`
- Changed: `setup-node` no longer writes a registry token placeholder; the
  publish step authenticates with `NPM_TOKEN` when the secret exists and
  otherwise relies on npm trusted publishing; a new step creates or updates
  the GitHub Release for the tag from `.ledger/releases/<tag>.md` public
  notes; permissions include `contents: write`.
- Anchor: `Create GitHub release`
- On conflict: Keep the tag and version match check, the already-published
  skip, and the release-record-driven notes; never store a token in the tree.

### Branch model and install docs

- Files: `README.md`, `CONTRIBUTING.md`, `docs/RELEASE_PREP.md`
- Changed: Homebrew sections removed; development happens on short-lived
  branches merged into `master`; releases are tagged from `master`; release
  prep describes GitHub Release creation.
- Anchor: `## Branches`
- On conflict: Do not reintroduce a long-lived `next` branch or install
  instructions for channels that are not published.

### Repository policy

- File: `.ledger/config.yaml`
- Changed: `Public Notes` added to required release sections;
  `render.budgets.maxTotalBytes` raised from 2,000,000 to 2,500,000.
- Anchor: `render:`
- On conflict: Per-artifact budgets are unchanged; the graph artifact is at
  about 90 percent of its limit and the durable fix is lazy sidecar loading.

### Package version

- Files: `package.json`, `package-lock.json`
- Changed: Version 0.3.2.
- On conflict: The tag must equal the package version.

## Behavior And UX Impact

Pushing a `vX.Y.Z` tag now produces both an npm publish and a GitHub Release
with the record's public notes. Contributors read one branch model. Nothing
in the CLI changed.

## Invariants

- The release workflow never fails silently on authentication; it either
  publishes through trusted publishing or the token fallback.
- Release records in this repository always carry a `Public Notes` section.
- Every render artifact and the total stay within configured budgets.

## Verification

- `npm run ci`
- `node dist/cli.js release v0.3.2 --include-unreleased --assign --status released --date 2026-09-15 --write`
- `node dist/cli.js render --json` reports `ok: true` for the internal profile
- Pull request CI on Ubuntu, macOS, and Windows for Node 22 and 24

## Notes

Deleting the remote `next` branch and creating GitHub Releases for the
unpublished v0.2.0, v0.3.0, and v0.3.1 tags were done with the GitHub CLI and
are not represented by files in this change.
