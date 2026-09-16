---
id: "0117"
kind: "change"
title: "Ship a GitHub Action with annotations and a job summary"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "ci"
  - "trust"
files:
  - "action.yml"
  - "src/ci.ts"
  - "src/operations/definitions/changes.ts"
  - "src/index.ts"
  - ".github/workflows/ci.yml"
  - "test/ci.test.ts"
  - "test/workflows.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
symbols:
  - "formatCiAnnotations"
  - "formatCiSummaryMarkdown"
  - "ciOperation"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "The README's pull request section shows the action usage; the architecture CI summary describes --github output and the composite action; the roadmap marks Phase 7 shipped."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/ROADMAP.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0112"
  - "0113"
release: "v0.7.0"
---

# 0117: Ship A GitHub Action With Annotations And A Job Summary

## Summary

`ledger ci --github` prints one GitHub Actions workflow command per failing
signal, with the file path for coverage, docs impact, and validation issues
and with data escaped per the workflow command rules, and appends a Markdown
summary table with a "What to fix" list to the file named by
`GITHUB_STEP_SUMMARY`. The new `action.yml` at the repository root is a
composite action that sets up Node, runs the command against the pull
request's base and head, exposes an `ok` output, and can post the summary as
a pull request comment when `comment` is `true`. This repository's own CI now
runs the action with `command: node dist/cli.js` on every pull request.

## Why

B008's CI item (D6): the proven `ci --base --head` logic was only reachable
by copying a workflow snippet, and failures were a wall of text in the log.
With coverage bound to the change set and docs impact judged per file, each
failure now names a path, which is exactly what an annotation needs. Using
the action in Ledger's own workflow means the wrapper is exercised before any
adopter sees it, and the pinning test keeps the composite action's
`setup-node` on a commit SHA like the workflows.

## Changed Files

### CI output

- Files: `src/ci.ts`, `src/operations/definitions/changes.ts`, `src/index.ts`
- Changed: `formatCiAnnotations` and `formatCiSummaryMarkdown`; the
  `--github` flag prints annotations before the report and appends the
  summary; the JSON output carries `github`.
- Anchor: `formatCiAnnotations`
- On conflict: Annotation data must keep the percent, newline, comma, and
  colon escaping or GitHub truncates the message.

### Action and workflow

- Files: `action.yml`, `.github/workflows/ci.yml`
- Changed: the composite action with `base`, `head`, `command`,
  `node-version`, and `comment` inputs and an `ok` output; the pull request
  step uses the local action.
- Anchor: `action.yml`
- On conflict: The comment step needs `pull-requests: write`, which this
  repository does not grant; keep `comment` off here.

### Tests and docs

- Files: `test/ci.test.ts`, `test/workflows.test.ts`,
  `test/fixtures/operations-contract.json`, `README.md`,
  `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`
- Changed: annotation and summary tests including escaping; the action
  structure test and the local `uses: ./` allowance; regenerated contract;
  docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Pull requests in this repository get inline annotations and a summary tab
from the next run on. Adopters add one `uses:` line. `ledger ci` without
`--github` is unchanged.

## Invariants

- Every failing coverage, docs impact, and validation signal produces exactly
  one annotation.
- The action exits with the CLI's exit code.
- Third-party actions remain pinned to commit SHAs.

## Verification

- `npm run typecheck`
- `npx vitest run` (287 tests, including the GitHub output tests)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `GITHUB_STEP_SUMMARY=/tmp/summary.md node dist/cli.js ci --github` in this repository
- `npm run ci`

## Notes

Milestone six of 0.7 trust (B008). The pull request for 0.7 is the first live
run of the action. Next: the typed API client generated from the operations
contract.
