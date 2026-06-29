---
id: "D001"
kind: "decision"
title: "Markdown is the source of truth"
date: "2026-06-29"
updated: "2026-06-29"
status: "accepted"
areas: ["architecture", "documents"]
---

# D001: Markdown Is The Source Of Truth

## Context

Ledger needs records that are useful to maintainers, reviewers, and coding
agents without requiring a hosted service or generated database. The source
format must survive normal Git workflows, code review, local search, and static
hosting.

## Decision

Ledger source records are Markdown files with YAML frontmatter. Generated JSON,
HTML, reports, search databases, and renderer-specific artifacts are derived
outputs.

## Consequences

Records remain readable and editable without Ledger installed. The parser and
validator must be reliable because source documents are intentionally flexible
enough for humans to author directly. Generated outputs can always be deleted
and recreated.

## Revisit Criteria

Revisit this decision only if Markdown prevents core workflows that cannot be
solved with frontmatter, indexes, or optional sidecar artifacts.
