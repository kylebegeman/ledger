---
id: "B008"
kind: "backlog"
title: "Trust, provenance, and TypeScript hardening"
date: "2026-09-16"
updated: "2026-09-16"
status: "proposed"
areas:
  - "ci"
  - "git"
  - "reader"
  - "search"
  - "architecture"
decisions:
  - "D005"
  - "D007"
docs:
  - "docs/ROADMAP.md"
  - "docs/HANDOFF.md"
---

# B008: Trust, Provenance, And TypeScript Hardening

## Problem

Coverage is satisfied by any historical record that mentions a path, one docs
touch satisfies a whole change set, verification is prose with no proof it
still holds, the reader runtime is 1,500 lines of untested template strings,
installed users get regex symbol extraction, and search cannot shard.

## Desired Outcome

Records carry proof: the current change has its own receipt, docs impact is
per file, verification commands run and leave evidence, stale anchors are
detected against the code tree, and CI annotates pull requests. The reader
runtime is typed, bundled, and browser-tested, the API has a generated typed
client, and search scales past one JSON artifact.

## Scope

Included (0.7):

- Current-change coverage provenance bound to the selected Git range.
- Per-file docs impact evidence.
- `ledger verify --run` with an allowlist and evidence sidecars recording
  command, exit status, duration, and commit; freshness surfaced by doctor,
  the reader, packets, and stale.
- Freshness checks: referenced files, symbols, and anchors against the tree.
- First-party GitHub Action with annotations, job summary, and optional PR
  comment.
- Typed browser runtime with a bundler and a browser test harness (A4).
- Typed API client generated from the operations contract, borrowing Kore's
  compile-time-boundary discipline in TypeScript form.
- Parser-backed symbols that ship: `typescript` as an optional peer, an
  extractor registry, honest fallback reporting (A5).
- Sharded search indexes, sqlite full-text search on the sqlite cache backend,
  and chunked reader artifacts.

Excluded:

- Signed records and transparency logs (D006).
- Repository federation (D006).

## Acceptance Checks

- A pull request that changes a required path without a current receipt fails
  coverage even when an old record mentions the path.
- `ledger verify --run` records evidence and `stale` ages it out.
- The reader runtime has executed browser tests and no duplicated logic with
  Node.
- The generated API client typechecks against the engine's responses.

## Risks

- Bundler and browser harness are new dev dependencies; keep production
  dependencies unchanged.
- Evidence must remain a derived sidecar under D001.

## Promotion Notes

Promote after B007 unless a trust item unblocks an adopter sooner.
