---
id: "0132"
kind: "change"
title: "Configure one Ledger command for hooks, instructions, and context"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "capture"
  - "agents"
  - "config"
files:
  - "src/types.ts"
  - "src/config.ts"
  - "src/workspace.ts"
  - "src/hooks.ts"
  - "src/skills.ts"
  - "src/operations/definitions/hooks.ts"
  - "src/operations/definitions/agents.ts"
  - "test/hooks.test.ts"
  - "test/skills.test.ts"
  - "test/config.test.ts"
  - "test/workspace.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
symbols:
  - "renderConfigWithAgentsCommand"
  - "agentsCommandRule"
  - "isValidAgentsCommand"
  - "hostHookFile"
  - "InstallHooksOptions"
  - "claudeMdImportsAgents"
  - "installHostHooks"
  - "buildSessionStartContext"
  - "trimToBudget"
  - "HooksInstallInput"
  - "agentInstructions"
  - "renderLedgerSkill"
  - "writeAgentsBlock"
docs:
  - "README.md"
  - "docs/SCHEMA.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "A new config key, a persisted hooks install flag, and --import-agents change what adopters configure and see; the README rows, the SCHEMA Agents Config section, and the ARCHITECTURE hook notes describe them."
  docs:
    - "README.md"
    - "docs/SCHEMA.md"
    - "docs/ARCHITECTURE.md"
commits: []
backlog:
  - "B010"
decisions:
  - "D005"
related:
  - "0127"
  - "0131"
  - "S0002"
---

# 0132: Configure One Ledger Command For Hooks, Instructions, And Context

## Summary

`agents.command` in `.ledger/config.yaml` is the one command prefix that runs
Ledger in a repository, default `ledger`. `ledger hooks install --command`
saves it there, rewriting the YAML through the document API so comments,
quoting, and key order survive, in the same transaction as the hook file.
Every agent-facing surface renders it: the hook files, the installer's next
steps, the `AGENTS.md` block, the skill, the SessionStart context and its
truncation notice, the pre-compact handoff, and the Stop notice. For Claude
Code, `hooks install` reports whether `CLAUDE.md` imports `AGENTS.md` and the
opt-in `--import-agents` appends the import or creates the file.

## Why

Product note 0127: Kore had the pinned invocation in four places, and the
agents block, the skill, and the hook context all told the agent to run a
`ledger` binary that on Kyle's machine is the ledger-cli accounting tool; the
live session in 0129 skipped those steps for that reason. B010 asks for one
configured command rendered everywhere and one place to bump it.

## Changed Files

### Config schema and rewrite

- Files: `src/types.ts`, `src/config.ts`, `src/workspace.ts`
- Changed: `agents.command` in the type, defaults, partial config, merge,
  and validation (non-empty, single line, no backticks, no surrounding
  whitespace); `renderConfigWithAgentsCommand` rewrites raw YAML in place,
  keeps CRLF endings, and returns the input when the value already matches;
  `agentsCommandRule` and `isValidAgentsCommand` shared with the installer;
  the scaffold writes the agents block after sessions.
- Anchor: `renderConfigWithAgentsCommand`
- On conflict: Keep the document-based rewrite; never regenerate an existing
  `config.yaml` from the scaffold serializer.

### Hook installer and hook renderers

- Files: `src/hooks.ts`
- Changed: `hostHookFile(host, command)` renders next steps with the command
  and the `--command` hint only for the default; `InstallHooksOptions.command`
  is optional and `importAgents` is new; `installHostHooks` validates the
  command, persists it through the config path derived from
  `workspace.configPath`, runs `claudeMdImportsAgents` (fenced blocks and
  code spans stripped, managed block counts as present), appends or creates
  `CLAUDE.md` under `--import-agents`, and writes the hook file, the config,
  and `CLAUDE.md` in one transaction with expected hashes; project files are
  read through the bounded reader so a BOM cannot break the hash; dry runs
  write nothing and report `configured: false`; `buildSessionStartContext`,
  `trimToBudget`, and the Stop notice render the configured command.
- Anchor: `installHostHooks`, `claudeMdImportsAgents`
- On conflict: Keep the single transaction and the `expectedHash` guards;
  `--import-agents` stays opt-in and Claude Code only, and it fails with
  `invalid-argument` for other hosts before any write. Never add a throwing
  path inside `runHookEvent`.

### Operations and skill

- Files: `src/operations/definitions/hooks.ts`,
  `src/operations/definitions/agents.ts`, `src/skills.ts`
- Changed: `hooks.install` input `command` optional with no default,
  `importAgents` and the `--import-agents` flag, output `configured` and
  `agentsImport`, help and format lines; exported `HooksInstallInput`;
  `agentInstructions(project, docsMode, role, command)` builds every span
  from the command and the agents operation returns `command`;
  `renderLedgerSkill` and `writeAgentsBlock` render the configured command.
- Anchor: `agentInstructions`
- On conflict: Command spans in agent-facing text are built from
  `agents.command`, never a literal; static usage and help strings stay
  literal because they document the product.

### Tests and contract

- Files: `test/hooks.test.ts`, `test/skills.test.ts`, `test/config.test.ts`,
  `test/workspace.test.ts`, `test/fixtures/operations-contract.json`
- Changed: persist in place on the scaffold and reuse on a later install;
  append to a Kore-shaped commented config with a byte-identical remainder;
  CRLF preserved; dry run untouched; malformed command exits 2; context,
  truncation notice, Stop notice, handoff, and next steps render the command;
  detector cases (bare, inline, `./` prefix, managed block, single and double
  backticks, fenced block, `@AGENTS.md.bak`); import append, idempotence,
  create-when-missing, Codex rejection; the regenerated contract
  (`hooks.install` and `agents` only).
- Anchor: `installHostHooks`
- On conflict: Keep the default-command assertions beside the configured
  command cases; keep the 30 second timeouts on end-to-end hook cases.

### Docs

- Files: `README.md`, `docs/SCHEMA.md`, `docs/ARCHITECTURE.md`
- Changed: the hooks install row, Skill And Instructions, and Host Hooks
  describe the persisted command and the import; SCHEMA gains an Agents
  Config section and a validation bullet; ARCHITECTURE names the renderers
  that read the command.
- Anchor: `Agents Config`
- On conflict: Keep `verification.allow` documented as a separate literal
  list that is not derived from `agents.command`.

## Behavior And UX Impact

`hooks install` without `--command` uses `agents.command` (default `ledger`,
so existing workspaces are unchanged). With `--command` it also saves the
prefix, reports it, and every later install, `agents --write`, `skills
install`, and hook context uses it. For Claude Code the installer reports
whether `CLAUDE.md` imports `AGENTS.md` and offers `--import-agents`. Kore's
upgrade becomes one `hooks install --command` plus re-rendering, with
`verification.allow` edited by hand. This repository's own surfaces are
regenerated in release prep.

## Invariants

- Every command span in agent-facing text is built from `agents.command`.
- `hooks install` persists the command only when `--command` was given and
  the YAML changed; a dry run writes nothing.
- The hook file, `.ledger/config.yaml`, and `CLAUDE.md` are written in one
  transaction with `expectedHash` guards.
- `renderConfigWithAgentsCommand` preserves comments, quoting, key order,
  and line endings.
- An invalid `agents.command` fails workspace load, and the hook operation
  still prints `{}` with exit 0.
- `verification.allow` is not derived from `agents.command`.

## Verification

- `npx vitest run test/hooks.test.ts test/skills.test.ts test/config.test.ts test/workspace.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (`hooks.install` and `agents` only)
- `node dist/cli.js ready 0132`
- `npm run ci`

## Notes

Milestone two of B010 (release 0.8.0). Reviewers found and the fixer resolved
a BOM hash mismatch on persisted files, CRLF loss in the rewrite, dry-run
import fields, double-backtick spans, and `@AGENTS.md.bak` matching. Codex and
Cursor hook shapes are unchanged here; the lifecycle and host fixes are the
next milestone.
