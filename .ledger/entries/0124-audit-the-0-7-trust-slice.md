---
id: "0124"
kind: "change"
title: "Audit the 0.7 trust slice"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "trust"
  - "ci"
  - "stale"
  - "engine"
files:
  - "action.yml"
  - "src/operations/runtime.ts"
  - "src/verify.ts"
  - "src/stale.ts"
  - "src/client.ts"
  - "src/operations/delegate.ts"
  - "src/retrieval.ts"
  - "src/coverage.ts"
  - "src/docsImpact.ts"
  - "src/doctor.ts"
  - "src/commands/search.ts"
  - "test/ci.test.ts"
  - "test/workflows.test.ts"
  - "test/newEntry.test.ts"
  - ".ledger/releases/v0.7.0.md"
symbols:
  - "ReferencedFileCache"
  - "parseJsonBody"
  - "controlCharacterPattern"
  - "buildContext"
  - "connectLedgerClient"
docsImpact:
  status: "not-needed"
  reason: "Every change corrects behavior the 0.7 docs already describe: the action's pull request comment, JSON output of ledger ci --github, and the stale, client, and verify internals. No documented interface changed."
  docs: []
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0115"
  - "0116"
  - "0117"
  - "0118"
  - "0123"
release: "v0.7.0"
---

# 0124: Audit The 0.7 Trust Slice

## Summary

A release audit of receipts 0112 through 0123 with fixes applied inline. The
composite action's optional pull request comment read `GITHUB_STEP_SUMMARY`
from its own step, which GitHub gives every step as a different file, so the
comment step never found a summary; the Ledger step now copies its summary to
`RUNNER_TEMP` and the comment step reads that copy. `ledger ci --github --json`
printed annotations on stdout ahead of the JSON envelope; operation log lines go
to stderr in JSON mode, where GitHub still reads workflow commands. Stale
detection reads each referenced source file once per run through
`ReferencedFileCache` instead of once per record block. The engine client parses
every response through `parseJsonBody`, `delegateOperation` reuses
`connectLedgerClient`, `verify --run` quotes whitespace arguments for the
Windows shell and refuses nested runs before doing any work, and the evidence
sidecar's control-character guard is written as a readable escape. Smaller
cleanups: the dead `evidencePathFor` export, a duplicated normalization in
coverage, the doctor symbols message, the full-text fallback note, and the
evidence age default now read from `defaultConfig`.

## Why

The slice was complete but had not been read end to end as one change. Two of
the findings were user-visible defects in features new to 0.7 (the action
comment and the JSON output of the GitHub mode), and one was a quadratic read
pattern that would have grown with every receipt. Fixing them before the tag
keeps 0.7.0 honest about what the release notes claim.

## Changed Files

### GitHub Action and CLI runtime

- Files: `action.yml`, `src/operations/runtime.ts`
- Changed: the Ledger step copies the job summary to `RUNNER_TEMP`; the comment
  step reads the copy; `buildContext` routes `log` to stderr with `--json`.
- Anchor: `buildContext`
- On conflict: stdout with `--json` is exactly one JSON document; annotations
  may only appear on stderr in that mode.

### Verification and stale detection

- Files: `src/verify.ts`, `src/stale.ts`, `src/retrieval.ts`
- Changed: `controlCharacterPattern`; the nested-run guard first; simpler target
  selection; Windows argument quoting; `evidencePathFor` removed;
  `ReferencedFileCache` shared by symbol and anchor checks; the evidence age
  default from `defaultConfig`.
- Anchor: `ReferencedFileCache`
- On conflict: a combined read stays bounded by `limits.maxTotalDocumentBytes`;
  missing and non-regular files are skipped, never errors.

### Engine client and delegation

- Files: `src/client.ts`, `src/operations/delegate.ts`
- Changed: `parseJsonBody` for health, operations, and envelopes;
  `delegateOperation` connects through `connectLedgerClient`.
- Anchor: `parseJsonBody`
- On conflict: a non-JSON engine answer is an `operational-error`, never an
  uncaught parse failure.

### Small cleanups and tests

- Files: `src/coverage.ts`, `src/docsImpact.ts`, `src/doctor.ts`,
  `src/commands/search.ts`, `test/ci.test.ts`, `test/workflows.test.ts`,
  `test/newEntry.test.ts`, `.ledger/releases/v0.7.0.md`
- Changed: one normalization per current entry; kind check before normalizing;
  the symbols message; the full-text fallback note; a CLI test for
  `ci --github --json`; the action test checks the summary handoff; this
  receipt joins the release record.
- Anchor: `keeps stdout a single JSON document`
- On conflict: keep the CLI test running with `--local` so a live engine on
  the developer's machine cannot answer it.

## Behavior And UX Impact

`comment: "true"` on the action posts the summary. `ledger ci --github --json`
is parseable. `ledger stale` is faster on large catalogs with no change in
signals. `ledger search --full-text` explains the fallback as needing a warm
sqlite cache. Nothing else observable changes.

## Invariants

- Operation `log` output never interleaves with the JSON envelope on stdout.
- The action's comment step reads the summary the Ledger step wrote.
- Stale detection reads a referenced file at most once per run.

## Verification

- `npm run typecheck`
- `npx vitest run test/ci.test.ts test/workflows.test.ts test/verify.test.ts test/stale.test.ts test/client.test.ts test/delegation.test.ts`
- `npm run ci`

## Notes

Release audit for v0.7.0, after 0123 and before the tag.
