---
id: "0138"
kind: "product-note"
title: "coverage any does not relax ledger ci for adopted repositories"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "ci"
tags:
  - "dogfood"
---

# 0138: coverage any does not relax ledger ci for adopted repositories

## Context

Fact-checking the rewritten README against the code, in temporary repositories
built with this checkout's build.

## Finding

`ledger adopt` writes `git.coverage: any` so a repository's history counts,
and `ledger coverage` then accepts a changed file that an older receipt lists.
`ledger ci` still fails that pull request, because docs impact only counts
change entries that are part of the change set. A repository with
`coverage: any`, an old receipt for `src/a.ts`, and a pull request that changes
`src/a.ts` got coverage pass, docs-impact fail, exit 1. Under `any`, CI only
relaxes changes whose paths need no docs impact decision.

## Impact

Adopters read `coverage: any` as the gentle mode for existing history, but
their first pull requests fail in CI exactly as they would under `current`.
The adopt output and the 0.7 notes both suggest otherwise.

## Recommendation

Decide which behavior is intended. Either let docs impact accept the same
historical receipts `any` accepts, or keep docs impact strict and say plainly
in adopt's output and the docs that `any` only affects `ledger coverage`.

## Follow-ups

- Add a `ledger ci` test on a range under `coverage: any` that pins the chosen
  behavior.
- Resolved: 0144 judges docs impact under the coverage mode, with a range
  test, and 0156 counts earlier receipts under `any` only for the files they
  name.
