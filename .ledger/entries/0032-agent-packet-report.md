---
id: "0032"
kind: "change"
title: "Add agent packet report output"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["agents", "cli", "reports", "tests"]
files:
  - "README.md"
  - "src/cli.ts"
  - "src/packet.ts"
  - "test/packet.test.ts"
  - ".ledger/entries/0032-agent-packet-report.md"
symbols:
  - "writeAgentPacketReport"
  - "packetCommand"
docs:
  - "docs/ROADMAP.md"
commits:
  - "88c9fe6"
release: "v0.1.3"
---

# 0032: Add Agent Packet Report Output

## Summary

Adds `ledger packet <path> --write-report`, which writes the compact agent
handoff packet to `.ledger/reports/packet.md`.

## Why

Agent packets are useful in terminal output, but a persisted Markdown artifact
is easier to review, attach to handoffs, and reuse across agent turns.

## Changed Files

### src/packet.ts

- What changed: Adds `writeAgentPacketReport`.
- Anchor: `writeAgentPacketReport`
- On conflict: Keep packet reports generated from the same model as normal
  packet output.

### src/cli.ts

- What changed: Adds `--write-report` to `ledger packet` and includes
  `reportPath` in JSON output when a report is written.
- Anchor: `packetCommand`
- On conflict: Preserve default stdout behavior and keep report writing opt-in.

### test/packet.test.ts

- What changed: Adds coverage for writing `.ledger/reports/packet.md`.
- Anchor: `writeAgentPacketReport`
- On conflict: Keep report tests focused on path and rendered packet content.

### README.md

- What changed: Documents packet report writing in the command map and agent
  workflow.
- Anchor: `Agent Workflow`
- On conflict: Keep examples aligned with CLI flags.

## Behavior And UX Impact

Users and agents can persist file-specific handoff context without copying
terminal output.

## Invariants

- Report writing is opt-in.
- JSON output remains parseable and includes `reportPath` when relevant.
- Packet report content remains derived from Ledger records.

## Verification

- `npm run typecheck`
- `npx vitest run test/packet.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js packet src/cli.ts --write-report`

## Notes

Future report work can support target-specific filenames when multi-target
packet support exists.
