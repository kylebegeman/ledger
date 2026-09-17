---
id: "0131"
kind: "change"
title: "Guard docs reconcile and detect curated routing files on adopt"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "docs"
  - "adoption"
  - "trust"
files:
  - "src/docs.ts"
  - "src/operations/definitions/docs.ts"
  - "src/workspace.ts"
  - "src/operations/definitions/records.ts"
  - "test/docs.test.ts"
  - "test/operations.test.ts"
  - "test/workspace.test.ts"
  - "test/coverage.test.ts"
  - "test/fixtures/operations-contract.json"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
symbols:
  - "docsStartHereMarker"
  - "docsStartHereLegacyLine"
  - "isLedgerGeneratedStartHere"
  - "isLedgerGeneratedManifest"
  - "inspectDocsRoutingFiles"
  - "writeDocsRoutingFiles"
  - "docsReconcileOperation"
  - "DocsReconcileInput"
  - "initWorkspace"
  - "InitWorkspaceResult"
  - "ledgerOwnedDocsRouting"
  - "detectCuratedDocsRouting"
  - "AdoptInput"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/DOCS_RELATIONSHIP.md"
docsImpact:
  status: "updated"
  reason: "User-facing behavior changed: reconcile refuses curated routing files unless forced and exits 1, and adopt points docs.routing at Ledger-owned paths when routing files exist. README, ARCHITECTURE, and DOCS_RELATIONSHIP state the ownership rule and the new defaults."
  docs:
    - "README.md"
    - "docs/ARCHITECTURE.md"
    - "docs/DOCS_RELATIONSHIP.md"
commits: []
backlog:
  - "B010"
decisions:
  - "D005"
related:
  - "0126"
  - "S0002"
release: "v0.8.0"
---

# 0131: Guard Docs Reconcile And Detect Curated Routing Files On Adopt

## Summary

`ledger docs reconcile` now refuses to replace a routing file Ledger did not
generate unless `--force` is passed. On refusal it writes neither routing file,
prints each refused file with its reason, what it would have written, and the
two remedies, and exits 1 with a machine-readable `written: false` and
`refused` list in the JSON envelope. A manifest counts as Ledger-generated when
it is a JSON object with `generatedBy: "ledger"`; a START_HERE counts when one
of its first five non-empty lines is the new marker
`<!-- ledger:docs:start-here -->` or the sentence every previously generated
file carries. `init --with-docs` and `adopt` detect an existing
`docs/llm/START_HERE.md` or `docs/llm/manifest.json` that Ledger did not
generate, point `docs.routing` at `.ledger/reports/docs-start-here.md` and
`.ledger/indexes/docs-routing.json`, and skip the sibling scaffold. The two
unguarded single-file writers are gone from the unstable library surface.

## Why

Product note 0126: in Kore one `ledger docs reconcile` would have replaced the
hand-maintained agent router in one transaction, with no check of who wrote
it. B010's first item is data safety: Ledger never overwrites documents it did
not generate, and `adopt` chooses Ledger-owned routing paths when routing files
already exist, which is what Kore's config had to do by hand.

## Changed Files

### Ownership predicates and the guarded write

- Files: `src/docs.ts`
- Changed: `docsStartHereMarker`, `docsStartHereLegacyLine`,
  `isLedgerGeneratedStartHere` (tolerates a BOM, CRLF, and trailing
  whitespace), `isLedgerGeneratedManifest`; `formatDocsStartHere` emits the
  marker as line 1; `inspectDocsRoutingFiles` reads both configured files
  with `readUtf8FileLimited`; `writeDocsRoutingFiles` refuses or writes both
  files in one transaction with `expectedHash` from the inspected content;
  `writeDocsRoutingManifest` and `writeDocsStartHere` deleted.
- Anchor: `writeDocsRoutingFiles`, `isLedgerGeneratedStartHere`
- On conflict: Keep the read-then-write guard with `expectedHash` and the
  all-or-nothing refusal; both routing files are written in a single
  transaction or not at all.

### The reconcile operation

- Files: `src/operations/definitions/docs.ts`
- Changed: exported `DocsReconcileInput` with `force`; the `--force` flag;
  output `written` and `refused`; exit code 1 when not written with the data
  still returned; refusal wording that names the file, the reason, what would
  have been written, `--force`, and the Ledger-owned paths; "(forced)" on a
  forced write. The audit report is still written first.
- Anchor: `docsReconcileOperation`
- On conflict: Keep exit code 1 with structured data, as `docs check` does,
  rather than a thrown error; keep the refusal wording accurate about the
  audit report being written first.

### Scaffold detection

- Files: `src/workspace.ts`, `src/operations/definitions/records.ts`
- Changed: `ledgerOwnedDocsRouting`, `defaultDocsRouting`,
  `detectCuratedDocsRouting`, and `InitWorkspaceResult`; `initWorkspace`
  returns the routing it configured and whether curated files were detected,
  reads the two docs/llm files with the bounded reader, and writes the YAML
  comment above the owned pair; the init scaffold starts with the marker;
  `InitOutput` carries `routing` and `routingFilesDetected`; exported
  `AdoptInput`; adopt's output and help say curated files are left alone.
- Anchor: `initWorkspace`, `adoptOperation`
- On conflict: Keep detection in `initWorkspace`, shared by init and adopt,
  and never let detection fail the scaffold; an unreadable file selects the
  owned pair. Config is still written only when missing.

### Tests and contract

- Files: `test/docs.test.ts`, `test/operations.test.ts`,
  `test/workspace.test.ts`, `test/coverage.test.ts`,
  `test/fixtures/operations-contract.json`
- Changed: predicate cases (marker, legacy sentence, BOM, CRLF, curated,
  empty, array); refusal, mixed ownership, forced, missing, Ledger-generated,
  and Kore-shaped owned-path cases; the CLI acceptance case where a curated
  START_HERE survives reconcile byte for byte with exit 1; the adopt case
  with curated routing files; `matchesGlob` checks for the owned paths; the
  regenerated contract (init, adopt, and docs.reconcile only).
- Anchor: `writeDocsRoutingFiles`
- On conflict: Never weaken the byte-for-byte survival assertions; they are
  B010's first acceptance check.

### Docs

- Files: `README.md`, `docs/ARCHITECTURE.md`, `docs/DOCS_RELATIONSHIP.md`
- Changed: the adopt and reconcile rows, the Adoption And Migration section,
  the ownership rule, the `--force` override, and the adopt default when
  routing files exist.
- Anchor: `Adoption And Migration`
- On conflict: Keep the ownership rule text in sync with
  `docsStartHereMarker` and `docsStartHereLegacyLine` in `src/docs.ts`.

## Behavior And UX Impact

`ledger docs reconcile` is unchanged when both routing files are missing or
Ledger-generated. When an existing routing file is curated it writes nothing,
explains why, and exits 1; `--force` replaces the files. `ledger adopt` and
`ledger init --with-docs` in a repository with curated docs/llm routing files
write a config whose `docs.routing` points under `.ledger/`, with an
explanatory comment, and say so. Existing workspaces are unchanged. A
regenerated START_HERE begins with the marker. Workspaces scaffolded by an
older init whose START_HERE is still the plain "LLM Start Here" text and that
never ran reconcile need `--force` once.

## Invariants

- `docs reconcile` never replaces a routing file Ledger did not generate
  unless `--force` is passed; on refusal both configured routing files stay
  byte-identical and the process exits 1.
- Both routing files are written in one `applyFileTransaction` with
  `expectedHash` from the inspected content, so a concurrent edit fails with
  `concurrent-file-change` instead of clobbering.
- A missing routing file is always writable.
- init and adopt never replace an existing docs/llm routing file, and
  `config.yaml` is still written only when missing.
- The Ledger-owned routing paths are excluded from coverage by the default
  `.ledger/reports/**` and `.ledger/indexes/**` ignores.

## Verification

- `npx vitest run test/docs.test.ts test/workspace.test.ts test/coverage.test.ts test/operations.test.ts test/cliE2e.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts` and a
  review of the contract diff (init, adopt, docs.reconcile only)
- `node dist/cli.js ready 0131`
- `npm run ci`

## Notes

Milestone one of B010 (release 0.8.0). Built by an implementer agent from the
verified subsystem map, then reviewed by two skeptics whose five findings were
fixed: the re-run report of routing paths on an existing workspace, the bounded
read in detection, README wording about where the legacy sentence sits, and a
duplicated refusal type. Session S0002 is this working session's record; the
hook drafted this receipt and it was finished rather than replaced.
