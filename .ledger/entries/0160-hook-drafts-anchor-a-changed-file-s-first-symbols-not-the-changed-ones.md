---
id: "0160"
kind: "product-note"
title: "Hook drafts anchor a changed file's first symbols, not the changed ones"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "capture"
  - "symbols"
tags:
  - "dogfood"
---

# 0160: Hook Drafts Anchor A Changed File's First Symbols, Not The Changed Ones

## Context

B010's last acceptance check, a second live Claude Code session in Kore on
2026-09-17 with Ledger 0.8.1 hooks. The session renamed Forge to Kore in the
`CHANGELOG.md` intro and in three Go test files, and the Stop hook drafted
Kore receipt 0005 from the diff.

## Finding

The draft listed `Added`, `Changed`, `Changelog`, `Fixed`, and `Unreleased` as
its symbols and as the `CHANGELOG.md` anchor. Those are the distinct headings
in the whole file, but the change was one line under `# Changelog`.
`collectChangedSymbols` in `src/newEntry.ts` runs
`extractFileSymbolsDetailed` on each changed file and keeps its first
`maxSymbolsPerFile` symbols, whichever lines the diff touched. The extractors
return names without line ranges, so nothing can narrow the list to the
change. The session replaced the list with the heading and the Go test
functions it had changed. The Go files had no drafted anchors at all because
Ledger has no Go extractor, which B010 excluded on purpose.

## Impact

Anchors reach packets, conflict rules, and `ledger stale`. A list that names
untouched symbols points a later agent at the wrong places, and `stale` flags
the receipt when someone later renames a section this change never touched.
The agent has to notice and replace the list, and the larger the changed file,
the longer and more plausible the wrong list looks.

## Recommendation

Scope drafted symbols to the diff. Extractors report each symbol's line range
(a Markdown heading's section, a TypeScript declaration), the draft reads the
hunk ranges Git already produces, and a symbol is kept only when its range
contains a changed line. When no range contains a change, the draft leaves
the anchor as the TODO placeholder instead of listing the file's first
symbols.

## Follow-ups

- Add line ranges to `LedgerSymbolExtraction` for the TypeScript, regex, and
  Markdown extractors.
- A draft test with a one-line change in a Markdown file with many headings
  and in a TypeScript file with many exports.
- Resolved: 0163 adds spans to every extractor and keeps only the symbols
  that hold a changed line.
