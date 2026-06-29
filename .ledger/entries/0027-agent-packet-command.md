---
id: "0027"
kind: "change"
title: "Add agent packet command"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["agents", "cli", "query", "conflict", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/packet.ts"
  - "test/packet.test.ts"
  - ".ledger/entries/0027-agent-packet-command.md"
symbols:
  - "buildAgentPacket"
  - "formatAgentPacket"
  - "packetCommand"
docs:
  - "docs/ROADMAP.md"
  - "docs/ARCHITECTURE.md"
commits: ["e81f6b4"]
---

# 0027: Add Agent Packet Command

## Summary

Adds `ledger packet <path>`, a compact agent handoff command that combines
matching entry metadata, symbols, docs references, conflict rules, invariants,
and verification checks for a target file.

## Why

The roadmap calls for compact retrieval packets for agents. Existing `explain`
and `conflict` commands each expose part of the needed context; packet output
combines those pieces into one handoff-friendly model.

## Changed Files

### src/packet.ts

- What changed: Adds `buildAgentPacket` and `formatAgentPacket`.
- Anchor: `buildAgentPacket`
- On conflict: Keep packet output derived from source Ledger records and the
  existing conflict model.

### src/cli.ts

- What changed: Adds `ledger packet <path> [--json]` command dispatch and help.
- Anchor: `packetCommand`
- On conflict: Preserve both Markdown and JSON output modes.

### src/index.ts

- What changed: Exports the packet module from the public library API.
- Anchor: `packet`
- On conflict: Keep CLI features available to library consumers where practical.

### test/packet.test.ts

- What changed: Covers packet model assembly and Markdown formatting.
- Anchor: `formatAgentPacket`
- On conflict: Keep tests focused on compact agent-relevant context.

### README.md

- What changed: Documents `ledger packet` in the command map and agent
  workflow.
- Anchor: `Agent Workflow`
- On conflict: Keep packet guidance next to explain and conflict usage.

## Behavior And UX Impact

Agents can request one compact packet for a target file before editing, reducing
manual catalog reading and making handoffs more predictable.

## Invariants

- Packet output must be derived from Ledger records.
- JSON output must remain parseable for agent tools.
- Markdown output should stay compact enough for prompt context.

## Verification

- `npm run typecheck`
- `npx vitest run test/packet.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js packet src/cli.ts`
- `node dist/cli.js packet src/cli.ts --json`

## Notes

Future agent integrations can expose this same model through MCP.
