---
id: "0136"
kind: "product-note"
title: "The reader shows Markdown backticks as literal text"
date: "2026-09-17"
updated: "2026-09-17"
status: "captured"
areas:
  - "reader"
tags:
  - "dogfood"
---

# 0136: The reader shows Markdown backticks as literal text

## Context

Capturing screenshots of the internal and public readers for the README
overhaul, in light and dark themes, against this repository's records and a
small demo repository.

## Finding

Receipts use backticks for commands, paths, config keys, and symbols, and the
reader prints them as plain characters. Literal backticks appear in library
summaries, the record panel summary, Invariants and Verification bullets, and
the public changelog's release notes, for example `` `npm test` `` and
`` `git.coverage: current` ``. Record text is escaped as plain text when the
page is rendered and set through `textContent` in the runtime, so no inline
code styling exists anywhere in the reader.

## Impact

The reader is the human face of Ledger and now the main image in the README.
Literal backticks make polished records look unfinished, and they are worse in
the public changelog, which is written for people outside the project.

## Recommendation

Render paired backticks in record text as inline code in both the static HTML
and the runtime, building the markup from escaped text or DOM nodes so record
content can never inject HTML. Leave unpaired backticks as text. Apply it to
summaries, invariants, verification, conflict rules, and public notes, and keep
search indexes on the raw text.

## Follow-ups

- Add a reader test that a summary with `` `code` `` renders a code element and
  that a summary containing HTML inside backticks stays escaped.
- Recapture the README screenshots once inline code renders.
