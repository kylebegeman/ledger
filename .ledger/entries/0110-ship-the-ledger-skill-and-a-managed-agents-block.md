---
id: "0110"
kind: "change"
title: "Ship the Ledger skill and a managed AGENTS.md block"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "agents"
  - "capture"
  - "cli"
files:
  - "src/skills.ts"
  - "src/operations/definitions/skills.ts"
  - "src/operations/definitions/agents.ts"
  - "src/operations/registry.ts"
  - "src/operations/runtime.ts"
  - "src/index.ts"
  - "test/skills.test.ts"
  - "test/fixtures/operations-contract.json"
  - ".agents/skills/ledger/SKILL.md"
  - "AGENTS.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
symbols:
  - "renderLedgerSkill"
  - "installLedgerSkill"
  - "writeAgentsBlock"
  - "replaceAgentsBlock"
  - "skillsInstallOperation"
  - "agentsOperation"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc's capture section describes the skill and the managed block; the README documents skills install and agents --write with the CLAUDE.md caveat."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
backlog:
  - "B007"
decisions:
  - "D005"
related:
  - "0109"
release: "v0.6.0"
---

# 0110: Ship The Ledger Skill And A Managed AGENTS.md Block

## Summary

`ledger skills install` writes `.agents/skills/ledger/SKILL.md`, an Agent
Skills entry that tells a skills-aware agent when to call `packet`, `explain`,
`search-packet`, `conflict`, `session note`, `new`, `promote`, `backlog new`,
`decision new`, `scratch`, and `ready`, and what `--json` and MCP offer.
Codex and Cursor read `.agents/skills/` natively; Claude Code gets a relative
symlink at `.claude/skills/ledger`, or a copied file where symlinks are not
available, and `--host` narrows the hosts. `ledger agents --write` maintains
the role instructions as a fenced block between
`<!-- ledger:agents:start -->` and `<!-- ledger:agents:end -->` in
`AGENTS.md` (or `--file <path>`), replacing the block in place, appending it
when absent, creating the file when missing, and refusing an unbalanced
marker. This repository now carries both.

## Why

B007 asks for a shipped `SKILL.md` with host links and for `ledger agents
--write` to maintain a block instead of printing text to paste. The brainstorm
landscape notes that Agent Skills under `.agents/skills/` are honored by
Claude Code, Codex, Cursor, Gemini CLI, and Copilot, so one file reaches every
host, and the skill is the piece that makes the hooks explainable to the
agent: the hooks capture, the skill says what to do with what was captured.
The block keeps the instructions current across releases without clobbering
hand-written guidance around it.

## Changed Files

### Skill and block module

- File: `src/skills.ts`
- Changed: skill rendering from workspace config, installation with the
  transaction layer, host exposure with symlink or copy, and block
  maintenance with marker replacement.
- Anchor: `writeAgentsBlock`
- On conflict: The symlink is relative so the repository stays portable;
  the block markers are the contract that lets later writes replace only
  Ledger's text.

### Operations

- Files: `src/operations/definitions/skills.ts`,
  `src/operations/definitions/agents.ts`
- Changed: the `skills.install` operation and the `--write` and `--file`
  flags on `agents`, which becomes a mutating operation.
- Anchor: `skillsInstallOperation`
- On conflict: `agents` without `--write` must keep printing the same text
  the `ledger_agent_instructions` MCP prompt serves.

### Registry, tests, docs, and dogfood

- Files: `src/operations/registry.ts`, `src/operations/runtime.ts`,
  `src/index.ts`, `test/skills.test.ts`,
  `test/fixtures/operations-contract.json`, `.agents/skills/ledger/SKILL.md`,
  `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`
- Changed: registration and help examples, exports, tests for rendering,
  installation, idempotence, host selection, block creation, appending,
  replacement, and unbalanced markers, the regenerated contract, the
  installed skill and block in this repository, and docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Agents in this repository see the Ledger skill in their skill list and the
workflow block at the end of `AGENTS.md`. Users must import `AGENTS.md` from
`CLAUDE.md` for Claude Code, which the help text and README state. The
`.claude/skills/ledger` symlink is committed as a link.

## Invariants

- `skills install` and `agents --write` are idempotent.
- The block never touches text outside its markers.
- Codex and Cursor need no host-specific file for the skill.

## Verification

- `npm run typecheck`
- `npx vitest run` (270 tests, including `test/skills.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js skills install` and `node dist/cli.js agents --write` in
  this repository
- `npm run ci`

## Notes

Milestone five of 0.6 capture (B007). Next: verify Codex and Cursor hook
installation end to end, then prepare v0.6.0.
