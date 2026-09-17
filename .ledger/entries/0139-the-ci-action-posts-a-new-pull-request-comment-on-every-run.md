---
id: "0139"
kind: "product-note"
title: "The CI action posts a new pull request comment on every run"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "ci"
tags:
  - "dogfood"
---

# 0139: The CI action posts a new pull request comment on every run

## Context

Fact-checking the README's CI section against `action.yml`.

## Finding

With `comment: "true"`, the action's comment step calls the issue comments
endpoint and creates a new comment on every run. A pull request that is
pushed ten times gets ten Ledger summaries. On pull requests from forks the
`GITHUB_TOKEN` is read-only, so the step fails there.

## Impact

Repositories that turn on comments get noisy pull requests, and fork
contributors see a failed step that has nothing to do with their change.

## Recommendation

Update one comment in place, found by a hidden marker in its body, and skip
the step with a notice when the token cannot write.

## Follow-ups

- Keep the README's note on `comment` until the action updates in place.
