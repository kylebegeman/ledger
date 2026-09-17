---
id: "0166"
kind: "change"
title: "Read TypeScript 5.0 to 5.4 and skip TypeScript 7, and update dependencies and actions"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "symbols"
  - "dependencies"
files:
  - ".github/dependabot.yml"
  - ".github/workflows/ci.yml"
  - ".github/workflows/release.yml"
  - "action.yml"
  - "CONTRIBUTING.md"
  - "docs/ARCHITECTURE.md"
  - "package-lock.json"
  - "package.json"
  - "README.md"
  - "src/symbols.ts"
  - "src/doctor.ts"
  - "src/operations/definitions/authoring.ts"
  - "test/client.test.ts"
  - "test/symbols.test.ts"
symbols:
  - "resolveTypeScriptModule"
  - "hasCompilerApi"
  - "loadTypeScript"
  - "typeScriptPackages"
  - "typeScriptFallbackAdvice"
docs:
  - "docs/ARCHITECTURE.md"
  - "CONTRIBUTING.md"
  - "README.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc and README say which TypeScript versions the extractor reads and what to install beside TypeScript 7; CONTRIBUTING gives the development Node floor and the Dependabot holds."
  docs:
    - "docs/ARCHITECTURE.md"
    - "CONTRIBUTING.md"
    - "README.md"
commits: []
related:
  - "0058"
  - "0114"
  - "0163"
release: "v0.8.2"
---

# 0166: Read TypeScript 5.0 To 5.4 And Skip TypeScript 7, And Update Dependencies And Actions

## Summary

The symbol extractor now finds the TypeScript compiler API wherever it is,
and treats a module without one as unavailable. `resolveTypeScriptModule`
reads TypeScript 5.0 to 5.4 through their default export. It rejects
TypeScript 7.0, which ships no JavaScript API, and then tries
`@typescript/typescript6`, the package TypeScript's side-by-side setup
installs. Before this change, published 0.8.1 threw
`Cannot read properties of undefined (reading 'Latest')` from
`ledger new --from-diff` beside TypeScript 7 or 5.0 to 5.4, instead of
falling back to regex, and `ledger doctor` called the parser available.

The four Dependabot pull requests are settled. `actions/checkout` v7.0.1 and
`actions/setup-node` v7.0.0 are pinned by commit in both workflows and the
composite action. The lockfile takes `@modelcontextprotocol/sdk` 1.30.0,
`yaml` 2.9.1, and `zod` 4.6.5, and `npm audit fix` moved `qs` to 6.16.0.
Vitest moves to 5.0.1 with no test changes beyond `toExtend`. `@types/node`
is pinned to `^22.20.3` to match the engines floor. TypeScript stays on
5.9.3, and Dependabot now skips major updates of `typescript` and
`@types/node` and groups only minor and patch updates.

## Why

A dependency review for Dependabot's grouped pull request found the
extractor bug. TypeScript 7.0.2 is npm's `latest`, and its package root
exports only `version`, so any project that upgrades would break Ledger's
drafts. Narrowing the optional peer range was rejected: npm 11 then refuses
to install Ledger next to TypeScript 7 at all. TypeScript 7 as Ledger's own
compiler was rejected for the same missing API, and `@types/node` 26 was
rejected because it would let code that runs only on Node 26 typecheck. The
grouped development update bundled three majors into one pull request, so
majors now arrive on their own.

## Changed Files

### TypeScript loader

- Files: `src/symbols.ts`, `src/doctor.ts`,
  `src/operations/definitions/authoring.ts`, `test/symbols.test.ts`
- Changed: `loadTypeScript` delegates to `resolveTypeScriptModule`, which
  tries `typescript`, then `@typescript/typescript6`. It accepts a module or
  its default export only when `hasCompilerApi` finds `createSourceFile`,
  `isVariableStatement`, `ScriptTarget`, and `ScriptKind`. Otherwise it
  records why: not installed, failed to load, or a version without a
  compiler API, with a hint for TypeScript 7. `typeScriptFallbackAdvice`
  adds "install the optional typescript peer" only when no TypeScript is
  installed, so `ledger doctor` and `ledger new` no longer tell a TypeScript
  7 project to install TypeScript. Tests cover named and default-only
  modules, TypeScript 7 alone and beside the 6 package, missing or broken
  packages, and the advice.
- Anchor: `resolveTypeScriptModule`, `hasCompilerApi`, `typeScriptPackages`,
  `typeScriptFallbackAdvice`
- On conflict: Keep the API check; a module that merely loads is not a
  parser.

### Dependencies and actions

- Files: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`,
  `.github/workflows/release.yml`, `action.yml`, `.github/dependabot.yml`,
  `test/client.test.ts`
- Changed: `vitest` is `^5.0.1` and `@types/node` is `^22.20.3`. The lockfile
  resolves the SDK, yaml, zod, and qs updates. The checkout and setup-node
  pins move to v7.0.1 (`3d3c42e`) and v7.0.0 (`8207627`). Dependabot groups
  only minor and patch updates and ignores majors of `@types/node` and
  `typescript`, with reasons. `expectTypeOf().toMatchTypeOf` became
  `toExtend`.
- Anchor: `actions/checkout`, `actions/setup-node`, `update-types`
- On conflict: Pin actions by full commit with the version comment, and keep
  `@types/node` on the major that matches `engines`.

### Docs

- Files: `docs/ARCHITECTURE.md`, `README.md`, `CONTRIBUTING.md`
- Changed: the architecture doc describes the loader's order and checks.
  The README Configuration section says which TypeScript versions give
  parsed symbols. CONTRIBUTING gives Node 22.12 for development and the
  Dependabot holds.
- Anchor: `resolveTypeScriptModule`, `Configuration`, `Development`
- On conflict: Keep the TypeScript 7 note until a JavaScript API ships.

## Behavior And UX Impact

A project on TypeScript 7 gets regex symbols and a doctor warning that says
why, instead of a crash. A project on TypeScript 5.0 to 5.4 gets parsed
symbols. Development needs Node 22.12 or newer. Nothing else changes for
users.

## Invariants

- `ledger new --from-diff` never fails because the installed `typescript`
  lacks a compiler API.
- `ledger doctor` reports the parser available only when it can parse.
- Action pins name a full commit SHA with the version in a comment.
- `@types/node` stays on the engines floor's major.

## Verification

- `npx vitest run test/symbols.test.ts`
- `npm audit --omit=dev --audit-level=high`
- `npm run typecheck`
- `node dist/cli.js ready 0166`
- `npm run ci`
- The research for this change ran published 0.8.1 beside TypeScript 7.0.2
  in a scratch project and saw the crash. It also parsed with a loader
  prototype on TypeScript 5.0.4, 5.4.5, 5.5.2, and 6.0.3, and on 7.0.2 with
  the 6.0.3 alias. `gh api` confirmed both action tags point at the pinned
  commits.
- A packed build of this change, installed in a scratch Git project beside
  `typescript@7.0.2`, created a draft with `ledger new --from-diff` (exit 0,
  regex symbols, the TypeScript 7 reason). `ledger doctor` warned with the
  same reason. After `npm install @typescript/typescript6@^6.0.2`, `doctor`
  passed with the 6.0.3 parser and the next draft used the `typescript`
  extractor.

## Notes

Dependabot pull requests kylebegeman/ledger#2, #4, #5, and #9 are
superseded by this change. The MCP SDK stays on 1.x: 1.30.0 still speaks
protocol 2025-11-25, and 2026-07-28 support lives in the separate v2
packages (`@modelcontextprotocol/server` and related packages, stable since
2026-07-28).
