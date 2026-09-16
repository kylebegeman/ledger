---
id: "D005"
kind: "decision"
title: "Next version direction: a local memory engine"
date: "2026-09-15"
updated: "2026-09-15"
status: "accepted"
areas:
  - "product"
  - "architecture"
  - "agents"
  - "performance"
docs:
  - "docs/ROADMAP.md"
  - "docs/scratchpad/next-version-brainstorm-2026-09-15.md"
---

# D005: Next Version Direction: A Local Memory Engine

## Context

On 2026-09-15 a from-scratch brainstorm re-evaluated every recorded proposal
against what the code does, what is published, and the September 2026 agent
tooling landscape. It found that every command re-parses the whole catalog,
that the CLI is a single 1,830-line switch, that `ledger serve` is static-only,
that the MCP server is stdio-only without structured results, and that nothing
captures a record automatically. Four open questions needed an owner decision
before that brainstorm could become a plan. Kyle answered them the same day and
asked for the better engineering option regardless of effort.

## Decision

The next version moves Ledger from a CLI that re-reads Markdown to a local
memory engine that agents talk to, organized as five pillars plus a hygiene
track (see `docs/ROADMAP.md` Phase 11). Within that direction:

1. Dependency policy. A bundler and a browser test harness are allowed as dev
   dependencies so the reader runtime becomes typed modules with executed
   tests. The catalog cache is a derived artifact behind a backend interface:
   a JSON backend is the default and works on every supported Node line, and
   a `node:sqlite` backend is selected automatically when the runtime exposes
   it, adding FTS for large catalogs. No native addon dependencies. The
   `typescript` package becomes an optional peer dependency and drafts report
   which symbol extractor ran.
2. Host priority for capture hooks and skills: Claude Code first, then Codex
   CLI, then Cursor.
3. Server model. `ledger serve --api` is an explicit, foreground loopback
   process. While it runs it writes `.ledger/daemon.json`, and CLI commands
   that find a live server delegate to its warm cache. Ledger does not
   auto-spawn a background daemon. The explicit model keeps the process
   lifecycle deterministic, avoids orphaned processes and stale lock files in
   repositories, and reuses the existing loopback and token hardening
   unchanged; a `SessionStart` hook can start the server for agent sessions.
4. Version framing. Releases stay on the 0.x line with no contract freeze.
   Machine contracts still carry schema versions and change through Ledger
   receipts, but a 1.0 freeze is not scheduled.

## Consequences

The operation registry and the incremental cache become prerequisites for the
API, the MCP transport, and live reload, so they land first. Dev dependencies
grow by a bundler and a browser harness; production dependencies do not grow.
Users on Node 22 get the JSON cache; users on Node 24 get sqlite-backed search
without configuration. Anyone who wants warm-cache latency from the CLI starts
`ledger serve --api` or lets a hook do it. Contract consumers should expect
additive change during 0.x and read the schema version fields.

## Revisit Criteria

Revisit the server model if delegation proves valuable but users routinely
forget to start the server; the remedy is an explicit `--detach` mode with a
pid file, not implicit spawning. Revisit version framing when an outside team
adopts Ledger and needs a frozen contract. Revisit the sqlite backend if
`node:sqlite` fails to reach stable status in a maintained LTS line.
