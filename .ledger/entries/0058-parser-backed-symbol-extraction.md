---
id: "0058"
kind: "change"
title: "Parser-backed symbol extraction"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "drafting"
  - "symbols"
  - "architecture"
files:
  - ".ledger/entries/0022-draft-symbol-extraction.md"
  - ".ledger/entries/0058-parser-backed-symbol-extraction.md"
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
  - "src/index.ts"
  - "src/newEntry.ts"
  - "src/symbols.ts"
  - "test/symbols.test.ts"
symbols:
  - "extractFileSymbols"
  - "extractCodeSymbols"
  - "extractMarkdownSymbols"
  - "extractCodeSymbolsWithRegex"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/IMPLEMENTATION_PLAN.md"
  - "docs/ROADMAP.md"
docsImpact:
  status: "updated"
  reason: "Documented parser-backed symbol extraction and the remaining language-parser scope."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/IMPLEMENTATION_PLAN.md"
    - "docs/ROADMAP.md"
backlog:
  - "B005"
commits: []
release: "v0.1.13"
---

# 0058: Parser-Backed Symbol Extraction

## Summary

Moved symbol extraction into a reusable module and added a TypeScript parser
path for top-level TypeScript and JavaScript symbols, with regex fallback for
portable installs.

## Why

Regex-only extraction could record nested implementation details as durable
anchors, which increases stale-symbol noise and weakens agent retrieval. A
parser-backed path gives cleaner top-level symbols while keeping the package
usable in projects that do not have TypeScript installed.

## Changed Files

### src/symbols.ts and src/newEntry.ts

- What changed: Added reusable Markdown, parser-backed code, and regex-fallback
  extraction helpers; changed entry drafting to call the shared module.
- Anchor: `extractFileSymbols`, `extractCodeSymbols`
- On conflict: Keep parser loading optional and keep draft creation best-effort
  when files cannot be read.

### src/index.ts

- What changed: Exported symbol extraction helpers for downstream command,
  MCP, and editor adapters.
- Anchor: `symbols`
- On conflict: Keep exported APIs small and deterministic.

### test/symbols.test.ts

- What changed: Covered parser extraction, regex fallback, and Markdown heading
  extraction.
- Anchor: `symbol extraction`
- On conflict: Preserve the assertion that parser extraction ignores nested
  implementation details.

### docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/IMPLEMENTATION_PLAN.md

- What changed: Documented parser-backed extraction and narrowed the remaining
  open question to additional language parsers.
- Anchor: `symbol extraction`
- On conflict: Keep docs clear that TypeScript is optional at runtime.

### .ledger/entries/0022-draft-symbol-extraction.md

- What changed: Updated the historical symbol extraction record to reference
  the new `src/symbols.ts` home.
- Anchor: `extractFileSymbols`
- On conflict: Keep old records free of stale symbol anchors.

## Behavior And UX Impact

`ledger new --from-diff` should produce cleaner symbols for TypeScript and
JavaScript changes when TypeScript is available in the host project. Projects
without TypeScript still get deterministic regex extraction.

## Invariants

- Symbol extraction must never block draft creation for unreadable files.
- TypeScript parser loading must stay optional.
- Markdown heading extraction remains deterministic.
- Regex fallback remains available for portability.

## Verification

- `npm test -- --run test/symbols.test.ts test/newEntry.test.ts`
- `npm run typecheck`

## Notes

This closes the regex-only extraction item for TypeScript and JavaScript. Other
languages can be added through the same module when the benefit justifies the
parser surface.
