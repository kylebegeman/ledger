---
id: "0114"
kind: "change"
title: "Report which symbol extractor ran and make typescript an optional peer"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "symbols"
  - "cli"
  - "trust"
files:
  - "src/symbols.ts"
  - "src/newEntry.ts"
  - "src/doctor.ts"
  - "src/operations/definitions/authoring.ts"
  - "src/index.ts"
  - "package.json"
  - "test/symbols.test.ts"
  - "test/doctor.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
symbols:
  - "extractCodeSymbolsDetailed"
  - "extractFileSymbolsDetailed"
  - "symbolExtractorStatus"
  - "LedgerSymbolExtraction"
  - "createChangeEntryDetailed"
  - "collectChangedSymbols"
docs:
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "The architecture Git section explains the optional typescript peer, the regex fallback report, the doctor symbols check, and the forced parser error; the README notes the peer and the doctor check."
  docs:
    - "docs/ARCHITECTURE.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0113"
release: "v0.7.0"
---

# 0114: Report Which Symbol Extractor Ran And Make Typescript An Optional Peer

## Summary

Symbol extraction now says what it did. `extractCodeSymbolsDetailed` and
`extractFileSymbolsDetailed` return the symbols together with the extractor
that produced them (`typescript`, `regex`, `markdown`, or `none`) and a
fallback reason when the parser was unavailable; asking for the TypeScript
parser explicitly now throws instead of silently returning regex output.
`ledger new` reports the per-extractor file counts and the fallback reason,
`ledger doctor` gains a `symbols` check, `symbolExtractorStatus` exposes
availability and the parser version, and `typescript` is declared as an
optional peer dependency so installs advertise the choice without pulling the
compiler in.

## Why

B008's parser item (A5): installed users got regex symbols with no signal,
and the parser path only worked in this repository because `typescript` is a
dev dependency. Decision D005 chose an optional peer over a production
dependency. Honest reporting matters because anchors feed conflict rules,
packets, and the stale-symbol check; a caller should know whether an anchor
list came from the parser or from patterns that also catch nested
declarations.

## Changed Files

### Extraction

- File: `src/symbols.ts`
- Changed: detailed extraction results, extractor status, a recorded load
  failure reason, a test seam for the loader, and the forced-parser error.
- Anchor: `extractCodeSymbolsDetailed`
- On conflict: `parser: "auto"` must keep falling back to regex; only an
  explicit `typescript` request may throw.

### Drafting, doctor, and command output

- Files: `src/newEntry.ts`, `src/doctor.ts`,
  `src/operations/definitions/authoring.ts`, `src/index.ts`
- Changed: `collectChangedSymbols` tallies extractors, `DraftedRecord` and
  the `new` output carry `symbolExtractors`, the doctor `symbols` check, and
  exports.
- Anchor: `symbolsCheck`
- On conflict: The doctor check warns, never fails, when the parser is
  missing.

### Packaging, tests, and docs

- Files: `package.json`, `test/symbols.test.ts`, `test/doctor.test.ts`,
  `test/fixtures/operations-contract.json`, `README.md`,
  `docs/ARCHITECTURE.md`
- Changed: `peerDependencies` and `peerDependenciesMeta` for `typescript`;
  tests for provenance, fallback, the forced error, status, markdown, and
  unsupported files; the doctor check list; regenerated contract; docs.
- Anchor: `peerDependenciesMeta`
- On conflict: Keep `typescript` in devDependencies for this repository's own
  build; the peer entry is for consumers.

## Behavior And UX Impact

`ledger new --from-diff` prints a Symbols line and, when the parser is
missing, a one-line hint to install `typescript`. Doctor output has one more
line. Consumers installing the package see an optional peer notice and can
opt in.

## Invariants

- Every extraction result names its extractor.
- An explicit TypeScript parser request never returns regex output.
- Production dependencies are unchanged.

## Verification

- `npm run typecheck`
- `npx vitest run` (275 tests, including `test/symbols.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js doctor` shows the `symbols` check
- `npm run ci`

## Notes

Milestone three of 0.7 trust (B008). Next: `ledger verify --run` with
evidence sidecars.
