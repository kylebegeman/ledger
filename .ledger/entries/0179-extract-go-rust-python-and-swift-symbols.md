---
id: "0179"
kind: "change"
title: "Extract Go, Rust, Python, and Swift symbols"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "symbols"
  - "drafting"
  - "stale"
files:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "src/doctor.ts"
  - "src/index.ts"
  - "src/stale.ts"
  - "src/symbolOutlines.ts"
  - "src/symbols.ts"
  - "src/unstable.ts"
  - "test/doctor.test.ts"
  - "test/publicApi.test.ts"
  - "test/stale.test.ts"
  - "test/symbolOutlines.test.ts"
  - "test/symbols.test.ts"
symbols:
  - "outlineSymbolSpans"
  - "outlineLanguageExtensions"
  - "extractFileSymbolsDetailed"
  - "summarizeSymbolLanguages"
  - "symbolsMissingFromFiles"
  - "anchorsMissingFromFiles"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The architecture doc describes the outline extractors, the README names the languages, and the schema documents member names."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
    - "README.md"
commits: []
decisions:
  - "D007"
related:
  - "0125"
  - "0058"
  - "0114"
  - "0163"
release: "v0.9.2"
---

# 0179: Extract Go, Rust, Python, and Swift symbols

## Summary

Drafts, hook drafts, and `ledger stale` now read Go, Rust, Python, and Swift
declarations. Before, only TypeScript, JavaScript, and Markdown yielded
symbols, so a Go receipt had to be written without them.

- **Go:** functions, methods as `Type.Method`, and types, constants, and
  variables, grouped or not.
- **Rust:** items, and the members of `impl` blocks, traits, and inline
  modules as `Type::name`.
- **Python:** functions, classes, and module or class assignments and
  annotations, with class members as `Class.name`.
- **Swift:** types, functions, properties, type aliases, and enum cases,
  with the members of types and extensions as `Type.name`.

Each declaration spans from the doc comments and attributes above it to its
end, and members sit inside their container. As a result, a draft names the
method a diff touched rather than the whole type. `ledger stale` counts a
member symbol or anchor, such as `Invoice.Charge` or `Parser::parse`, as
present when each segment appears. `ledger doctor` names the outlined
languages, and the package root exports `outlineSymbolSpans`.

## Why

Kore is a Go repository. Product note 0125 found that Go symbols and anchors
were never extracted or checked there, and Kyle's Rust, Python, and Swift
projects had the same gap.

Rejected:

- **tree-sitter grammars or language toolchains.** Native or WASM grammars
  for four languages are large dependencies. Running `go`, `python3`,
  `rustc`, or `swiftc` needs toolchains a repository may not have. D007
  keeps Ledger a single npm install.
- **A per-line regex like the TypeScript fallback.** It cannot tell a
  declaration inside a string or comment from code, or find where a
  declaration ends. The outlines mask comments and strings first, then
  follow braces, brackets, and indentation.

## Changed Files

### Outline extractors

- Files: `src/symbolOutlines.ts`
- Changed:
  - Each language's masking blanks comment and string contents, keeping
    every line break and recording the ones inside strings. It covers:
    - Go raw strings, and Rust raw strings and nested comments
    - Swift multi-line and raw strings, with interpolation
    - Python triple-quoted strings
  - Go reads top-level declarations. A `struct{...}` or `interface{...}`
    type in a signature is not taken for the body.
  - Rust and Swift share a brace scanner with rules for each language. It
    also reads the members of one-line bodies.
  - Python reads logical lines by indentation.
  - A declaration's leading lines include:
    - doc comments and block doc comments
    - attributes, including ones with nested or multi-line arguments or a
      trailing comment
    - decorators
    - in Rust, a `///` block separated from the item by blank lines
- Anchor: `outlineSymbolSpans`, `outlineLanguageExtensions`
- On conflict: Mask before matching, and keep members one level deep.

### Extraction, doctor, stale, and exports

- Files: `src/symbols.ts`, `src/doctor.ts`, `src/stale.ts`, `src/index.ts`,
  `src/unstable.ts`
- Changed:
  - `extractFileSymbolsDetailed` sends `.go`, `.rs`, `.py`, and `.swift`
    files to the outlines and names the language as the extractor.
    `symbolExtractorStatus` lists the four outline extractors.
  - `summarizeSymbolLanguages` returns `outlinedLanguages`. The doctor
    symbols check names those languages and any language that still has no
    extractor.
  - Stale symbol and anchor checks treat `Type.member` and `Type::member` as
    present when every segment appears. Symbols with `::` were previously
    skipped, and dotted member symbols were matched only as whole text.
  - The package root exports `outlineSymbolSpans` and
    `outlineLanguageExtensions`.
- Anchor: `extractFileSymbolsDetailed`, `summarizeSymbolLanguages`,
  `symbolsMissingFromFiles`, `anchorsMissingFromFiles`
- On conflict: Keep TypeScript and JavaScript on the parser path.

### Tests and docs

- Files: `test/symbolOutlines.test.ts`, `test/symbols.test.ts`,
  `test/doctor.test.ts`, `test/stale.test.ts`, `test/publicApi.test.ts`,
  `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, `README.md`
- Changed:
  - The fixture for each language covers:
    - declarations hidden in comments and strings
    - grouped declarations and several bindings in one statement
    - one-line bodies, and generic arguments that span lines
    - multi-line and stacked attributes, and block doc comments
    - which member a changed line belongs to
  - A Git test drafts only the Go method that a diff touched.
  - Stale tests cover member symbols and anchors. The doctor, extractor
    status, and public API tests cover the new languages and exports.
  - The architecture doc describes the outlines, the README names the
    languages, and the schema documents member names.
- Anchor: `symbolOutlines.test.ts`
- On conflict: Keep the fixtures' traps; each one was a real miss.

## Behavior And UX Impact

- Drafts in Go, Rust, Python, and Swift repositories list the symbols and
  anchors on the changed lines, as TypeScript drafts do. `ledger new` prints
  the count for each language.
- `ledger stale` no longer reports a Go or Swift method symbol such as
  `Invoice.Charge` as stale while both names are still in the file. It now
  checks Rust `Type::name` symbols too.
- `ledger doctor` says which languages get their symbols from Ledger's
  outlines.

## Invariants

- Outlines never read declarations from comments or string contents.
- A changed line inside a member names the member, not its container.
- Declarations inside function bodies are never listed.
- Symbol extraction adds no dependency and runs no external toolchain.
- Attribute patterns match in linear time, even on long lines.

## Verification

- `npx vitest run test/symbolOutlines.test.ts test/symbols.test.ts test/doctor.test.ts test/stale.test.ts test/publicApi.test.ts`
- `npm run typecheck`
- `npm run ci`
- Real parsers checked the outlines' names and line ranges on the tracked
  code in Kyle's local projects:
  - Go, against `go/parser`: 28,953 of 28,953 declarations in 2,155 files.
  - Python, against `ast`: 7,128 of 7,128 in 371 files.
  - Rust, against `syn` 2: 3,954 of 3,954 in 153 files.
  - Swift, against `swiftc -dump-parse` with `#if` lines blanked: 18,529 of
    18,530 in 1,154 files. The one miss is `extension String?`, which is
    skipped on purpose because its members have no valid anchor name.
  - The slowest file took 12 ms. The harness lived in the session
    scratchpad and is not part of the repository.

## Notes

This work fixed these misses:

- Newlines inside multi-line strings ended declarations.
- `struct{...}` types in Go signatures were read as function bodies.
- Several Python statements on one line produced only the first name.
- Swift problems:
  - Commas inside generic arguments produced bogus later bindings.
  - Attributes with nested arguments were not matched.
  - Generic arguments across lines ended declarations early.
  - Several attributes on one line were not all counted.
- Rust problems:
  - Inner doc comments and attributes were counted as an item's own.
  - `impl` blocks for `&mut Type` and `dyn Trait` read the wrong owner.
