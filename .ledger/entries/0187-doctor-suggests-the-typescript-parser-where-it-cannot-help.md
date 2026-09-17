---
id: "0187"
kind: "product-note"
title: "Doctor suggests the TypeScript parser where it cannot help"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "doctor"
  - "symbols"
tags:
  - "dogfood"
---

# 0187: Doctor suggests the TypeScript parser where it cannot help

## Context

This came from the smoke test of the published 0.9.2 package in a fresh Go
repository, and from `ledger doctor` in Kore after its move to 0.9.2.

## Finding

The doctor symbols check gives TypeScript advice where it does not help:

- **Nothing under coverage.** In a repository where no tracked file is under
  `git.requireEntryFor`, the check falls through to the TypeScript parser's
  status. That happens after a fresh `ledger init` when the code sits outside
  the default roots (`src/**`, `test/**`, and `docs/**`). The check then
  warns "regex fallback for code anchors ... install the optional typescript
  peer", although no code is extracted at all.
- **Mixed languages.** When TypeScript or JavaScript and an outlined language
  such as Go are both under coverage, as in Kore, the warning about
  TypeScript is right. It does not say that the Go symbols come from Ledger's
  outlines and need nothing installed.

## Impact

A Go-first repository is told to install TypeScript, and the warning adds
noise to a doctor run that is otherwise clean.

## Recommendation

- When nothing is under coverage, pass with a note that names the coverage
  roots.
- When outlined languages are covered alongside TypeScript or JavaScript,
  name them in the message too.

## Follow-ups

- Fix both messages in the next release when work on Ledger resumes.
