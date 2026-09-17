---
id: "0189"
kind: "change"
title: "Keep Codex hook approval across Ledger versions"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "hooks"
  - "doctor"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/COMMANDS.md"
  - "docs/SCHEMA.md"
  - "src/doctor.ts"
  - "src/hooks.ts"
  - "src/operations/definitions/hooks.ts"
  - "test/doctor.test.ts"
  - "test/fixtures/operations-contract.json"
  - "test/hooks.test.ts"
symbols:
  - "renderHookLauncher"
  - "installHostHooks"
  - "hostHookFile"
  - "ledgerHookPrefixes"
  - "isCurrentHookLauncher"
  - "hookLauncherTarget"
  - "hookLauncherPath"
  - "hooksCheck"
  - "launcherProblem"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/COMMANDS.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The README's Codex setup, the architecture and schema docs, and the generated command reference describe --launcher."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
    - "docs/COMMANDS.md"
commits: []
related:
  - "0172"
  - "0178"
  - "S0006"
release: "v0.9.3"
---

# 0189: Keep Codex hook approval across Ledger versions

## Summary

`ledger hooks install --host codex --launcher` writes Codex hooks that run
`node .ledger/bin/ledger.mjs hook <event> --host codex`. It also writes that
script, which runs `agents.command` with the hook's arguments. A later install
with a new `--command` rewrites only the script, so `.codex/hooks.json` stays
byte for byte the same and Codex keeps the hooks it approved.

- Later installs keep the form the hook file already uses.
- `--launcher=false` writes direct commands again and deletes the script.
- `--launcher` is rejected for other hosts.
- `ledger doctor` accepts the launcher. It warns when the script is missing,
  runs another command, or is out of date.
- The install output says when the hook file did not change and trust carries
  over, and that Codex must start at the project root.

## Why

Codex approves each hook by a hash of its definition, and the command is part
of that definition. Each pinned version bump changed all six commands, so
Codex skipped Ledger's hooks until someone approved them again. In the Codex
app, it may not say so. Kore needed a new approval after every bump.

Rejected:

- **An unpinned `npx` command.** It follows whatever version was published
  last, not the version the project chose.
- **Freezing an old version as a bootstrap.** The hooks would name a version
  they do not run, and every hook would start two packages.
- **A separate bootstrap package.** It adds a package to publish and keep in
  step.
- **Managed hooks.** Codex skips review for hooks from requirements.toml or
  MDM, but that needs machine configuration outside the repository.
- **Finding the project root in the hook command.** Codex runs commands in
  the user's login shell, which may be fish, or in cmd.exe. No single command
  can walk up to the root in all of them. The relative path works in every
  shell when the session starts at the root.

## Changed Files

### Launcher and install

- Files: `src/hooks.ts`, `src/operations/definitions/hooks.ts`,
  `test/hooks.test.ts`
- Changed:
  - `renderHookLauncher` renders the script. The script:
    - embeds the command as a JSON string
    - runs it through the shell from the project root, with the hook's stdio
    - quotes arguments that need it
    - forwards SIGINT and SIGTERM
    - exits with the command's status, or prints `{}` and exits 0 when the
      shell cannot start
  - `installHostHooks` takes `launcher` and keeps the file's current form
    when the flag is absent. It writes or deletes the script in the same
    transaction and reports it as `launcher: { path, state }`.
  - `hostHookFile` takes `launcher` for Codex next steps that point at the
    script.
  - `ledgerHookPrefixes` walks a parsed hook file for the doctor and the
    install.
  - `isCurrentHookLauncher` compares a script with the current rendering,
    ignoring line endings, and `hookLauncherTarget` reads its command.
  - `hooks install` gains the `--launcher` flag, its help, and output lines
    for a written or removed script.
  - Tests cover:
    - the launcher form
    - an upgrade that leaves the hook file unchanged
    - a repeat install that changes nothing
    - running the script with arguments, stdin, and an exit status
    - switching back
    - rejection for Claude Code
- Anchor: `renderHookLauncher`, `installHostHooks`, `hookLauncherPath`
- On conflict: The hook commands must not depend on `agents.command` in
  launcher form; anything version-specific belongs in the script.

### Doctor

- Files: `src/doctor.ts`, `test/doctor.test.ts`
- Changed:
  - `hooksCheck` accepts the launcher prefix and checks the script against
    `agents.command`.
  - The pass message names the hosts that start Ledger through the script.
- Anchor: `hooksCheck`, `launcherProblem`
- On conflict: A missing or stale script must warn, because Codex hooks fail
  silently.

### Docs and generated files

- Files: `README.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`,
  `docs/COMMANDS.md`, `test/fixtures/operations-contract.json`
- Changed:
  - The README's Codex setup uses `--launcher` and says why.
  - The architecture and schema docs describe the script and when to
    rewrite it.
  - The command reference and contract are regenerated.
- Anchor: `--launcher`
- On conflict: Regenerate the reference and contract rather than editing them.

## Behavior And UX Impact

Codex users who install with `--launcher` approve Ledger's hooks once. After
that, a version bump no longer silently turns off capture until someone
approves the hooks again. Existing installs keep direct commands until
someone passes `--launcher`, and that first switch changes the hook file
once. Codex sessions that start in a subdirectory cannot find the script, so
launcher users start Codex at the project root.

## Invariants

- In launcher form, `.codex/hooks.json` does not depend on `agents.command`.
- An install without `--launcher` never changes a hook file's form.
- Ledger deletes only a script it wrote.
- The script passes stdin, stdout, and the exit status through unchanged.

## Verification

- `npx vitest run test/hooks.test.ts test/doctor.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts`
- `npm run ci`

## Notes

In a scratch project, the built CLI installed the launcher. Through the
script, `version` printed the version, and a piped SessionStart payload
returned the session context. `doctor` passed the hooks check.
