---
id: "D007"
kind: "decision"
title: "Ledger stays single-runtime TypeScript; Kore is an adopter, not a platform"
date: "2026-09-16"
updated: "2026-09-16"
status: "accepted"
areas:
  - "architecture"
  - "server"
  - "reader"
related:
  - "D003"
  - "D005"
  - "D006"
docs:
  - "docs/HANDOFF.md"
---

# D007: Ledger Stays Single-Runtime TypeScript; Kore Is An Adopter, Not A Platform

## Context

Kyle asked whether Ledger's server and web surfaces should be rebuilt on Kore,
his Go plus SQLite or PostgreSQL plus HTMX product factory designed for
agent-maintained SaaS products. The question came right after 0.5.0 shipped
the engine server, CLI delegation, live reload, and MCP over HTTP in
TypeScript.

## Decision

Ledger keeps one runtime. The CLI, library API, MCP server, engine server, and
reader stay TypeScript, distributed together through npm. Kore is not a
platform for any Ledger surface.

Two integrations are endorsed instead:

- Kore, and products it generates, adopt Ledger. Kore already uses
  `docs/llm/START_HERE.md` routing and is agent-maintained, so it is the
  intended first adopter and the consumer that shapes 0.6 capture. A Kore
  plugin that ships Ledger's skill and hook configuration is a natural
  follow-on.
- If a hosted, team-level memory product ever exists, it is a separate SaaS
  built on Kore that consumes Ledger's JSON API and operations contract, in
  the adapter pattern D003 uses for Dossier. Nothing couples inside Ledger core.

Borrow Kore's discipline of compile-time checks at every boundary in
TypeScript form: a typed API client generated from the operations contract,
and the typed, bundled, browser-tested reader runtime already planned as A4.

## Consequences

The operation registry remains the single implementation of every surface;
no second parser, retrieval, or scoring implementation is written in another
language. The reader stays a static, offline artifact that works from a
`file:` URL and any static host; server-rendered partials are not adopted.
Distribution stays one `npm install`. Decision D006's retirement of Go and
HTMX adapters stands, now with the reasoning recorded.

## Revisit Criteria

Revisit if a hosted multi-user product becomes a goal, in which case build it
on Kore as a separate product, or if npm distribution stops being the primary
channel for Ledger.
