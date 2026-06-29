---
id: "D002"
kind: "decision"
title: "Use .ledger as the default root directory"
date: "2026-06-29"
updated: "2026-06-29"
status: "accepted"
areas: ["architecture", "cli"]
---

# D002: Use .ledger As The Default Root Directory

## Context

Ledger should feel repo-native and visible without competing with product docs,
API docs, or release notes. A root-level directory makes the system easy for
humans and agents to discover.

## Decision

Ledger uses `.ledger/` as the default project directory. Projects can map to a
different layout through config, but new projects should initialize `.ledger/`.

## Consequences

The source records are easy to find and can include generated indexes, reports,
and static output without cluttering existing docs. Some tools may hide dot
directories by default, so README links and CLI output should point to the
directory clearly.

## Revisit Criteria

Revisit if broad adoption shows dot-directory discoverability is a serious
problem, or if a different convention becomes clearly better.
