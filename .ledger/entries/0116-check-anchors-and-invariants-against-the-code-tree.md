---
id: "0116"
kind: "change"
title: "Check anchors and invariants against the code tree"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "stale"
  - "trust"
files:
  - "src/retrieval.ts"
  - "src/stale.ts"
  - "src/operations/definitions/health.ts"
  - "src/index.ts"
  - "test/stale.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
symbols:
  - "extractAnchors"
  - "extractAnchoredBlocks"
  - "anchorsMissingFromFiles"
  - "readReferencedFiles"
  - "detectStaleKnowledge"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "updated"
  reason: "The schema's Changed Files section defines what Anchor means and how stale checks and acknowledgements treat it; the architecture and README stale descriptions list the new signals and the corrected report path."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/SCHEMA.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
related:
  - "0115"
release: "v0.7.0"
---

# 0116: Check Anchors And Invariants Against The Code Tree

## Summary

`ledger stale` now reads the `- Anchor:` bullets of every Changed Files
block, resolves the block to the record's file references, and reports
`stale-anchor` when an anchor no longer appears in any of those files, naming
the file. When an invariant cites a stale anchor or a stale symbol in
backticks, it reports `stale-invariant` with the invariant text. Anchors can
be acknowledged as intentionally historical with `staleRefs:
["anchors:<name>"]`. The `stale` help text lists every signal and names the
report file it actually writes.

## Why

B008's freshness item (D4): the property competitors advertise as
"withholding stale knowledge" is computable from records Ledger already has.
Symbols were checked against the concatenation of all referenced files, so a
message could not say which file lost what, and anchors, the one place a
receipt says what matters in a file, were emitted by drafting and never read
back. Invariants that name a vanished anchor are the most misleading memory
an agent can receive before editing.

## Changed Files

### Anchor parsing

- File: `src/retrieval.ts`
- Changed: `extractAnchors` parses anchor bullets and drops
  placeholder anchors that start with TODO; `extractAnchoredBlocks` pairs each block with the record
  files its title names.
- Anchor: `extractAnchoredBlocks`
- On conflict: Block titles resolve through the same matcher conflict rules
  use, so a `Pattern:` block with no exact files contributes no anchors.

### Stale detection

- Files: `src/stale.ts`, `src/operations/definitions/health.ts`, `src/index.ts`
- Changed: `stale-anchor` and `stale-invariant` issue kinds, a shared bounded
  reader for referenced files, the acknowledgement namespace `anchors:`, help
  text, and exports.
- Anchor: `anchorsMissingFromFiles`
- On conflict: Missing files never produce anchor issues; validation already
  reports them as missing references.

### Tests and docs

- Files: `test/stale.test.ts`, `test/fixtures/operations-contract.json`,
  `README.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`
- Changed: tests for a stale anchor, its invariant, a healthy block, and the
  acknowledgement; regenerated contract; docs.
- Anchor: `operations-contract.json`
- On conflict: Regenerate the contract with `LEDGER_UPDATE_CONTRACT=1`.

## Behavior And UX Impact

Stale reports and the doctor `stale-knowledge` count can grow for
repositories whose anchors drifted; this repository's own receipts are
checked the same way. No command fails by default; `stale --check` exits 1 as
before.

## Invariants

- An anchor is checked only against the files its own block names.
- `stale-invariant` is reported only when the cited name is already a stale
  anchor or symbol of the same record.
- Acknowledged anchors produce neither signal.

## Verification

- `npm run typecheck`
- `npx vitest run` (284 tests, including `test/stale.test.ts`)
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `node dist/cli.js stale` in this repository
- `npm run ci`

## Notes

Milestone five of 0.7 trust (B008). Next: the first-party GitHub Action with
annotations and a job summary.
