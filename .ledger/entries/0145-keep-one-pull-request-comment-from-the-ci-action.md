---
id: "0145"
kind: "change"
title: "Keep one pull request comment from the CI action"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "ci"
files:
  - "action.yml"
  - "test/workflows.test.ts"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols: []
docs:
  - "docs/ARCHITECTURE.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's CI section, the README's CI section, and the action's comment input describe the single updated comment and the fork behavior."
  docs:
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
related:
  - "0117"
  - "0139"
---

# 0145: Keep One Pull Request Comment From The CI Action

## Summary

With `comment: "true"`, the composite action now keeps the Ledger summary in
one pull request comment. It appends a hidden `<!-- ledger-ci-summary -->`
marker, looks for a `github-actions[bot]` comment that carries it, and updates
that comment in place, posting a new one only on the first run. A pull
request from a fork gets a notice instead of a comment, and a failed GitHub
API call prints a warning without failing the step.

## Why

Product note 0139: the comment step created a new comment on every run, so a
pull request pushed ten times collected ten summaries, and on pull requests
from forks the read-only token made the step fail for reasons unrelated to the
change. Matching on the bot author as well as the marker keeps the action
from trying to edit a human comment that quotes the marker.

## Changed Files

### Action

- Files: `action.yml`
- Changed: the comment step reads the head repository, skips forks with a
  notice, lists comments with `gh api --paginate` and a jq filter on author
  and marker, takes the first id without a pipe that could break under
  `pipefail`, then patches it or posts once; both writes fall back to a
  warning. The `comment` input description says so.
- Anchor: `Comment on the pull request`
- On conflict: The step must exit 0 whatever the GitHub API answers, and the
  summary must stay available in the job summary.

### Tests and docs

- Files: `test/workflows.test.ts`, `docs/ARCHITECTURE.md`, `README.md`
- Changed: the action test pins the marker, the in-place update, the fork
  check, and both warning fallbacks; the architecture and README CI sections
  describe the behavior.
- Anchor: `ships a composite action that runs ledger ci with annotations`
- On conflict: Keep the test asserting the fork check and the warning
  fallbacks.

## Behavior And UX Impact

Pull requests keep a single Ledger comment that reflects the latest run.
Contributors from forks see a notice and the job summary instead of a failed
step.

## Invariants

- At most one comment per pull request carries the marker from this action.
- The comment step never fails the job.
- A fork pull request makes no write call.

## Verification

- `npx vitest run test/workflows.test.ts`
- The comment step's script, extracted from action.yml and run with
  `bash --noprofile --norc -eo pipefail` against a fake gh, posted on the
  first run, patched comment 111 when the listing returned 111 and 222,
  printed the fork notice without calling gh, and printed the warning and
  exited 0 when listing and posting both failed.
- `npm run ci`

## Notes

Resolves product note 0139. The step only runs in real pull requests with
`comment: "true"`, which this repository's own CI does not set, so the live
GitHub behavior is verified by the fake-gh run above rather than in CI.
