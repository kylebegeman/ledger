---
id: "0072"
kind: "change"
title: "Comprehensive audit correctness hardening"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas:
  - "audit"
  - "cli"
  - "parser"
  - "serve"
  - "agents"
  - "tests"
files:
  - ".ledger/entries/0072-comprehensive-audit-correctness-hardening.md"
  - "src/cli.ts"
  - "src/documents.ts"
  - "src/frontmatter.ts"
  - "src/git.ts"
  - "src/newEntry.ts"
  - "src/packet.ts"
  - "src/release.ts"
  - "src/renderAssets.ts"
  - "src/renderHtml.ts"
  - "src/search.ts"
  - "src/serve.ts"
  - "test/cliE2e.test.ts"
  - "test/cliHelp.test.ts"
  - "test/frontmatter.test.ts"
  - "test/git.test.ts"
  - "test/newEntry.test.ts"
  - "test/packet.test.ts"
  - "test/release.test.ts"
  - "test/render.test.ts"
  - "test/search.test.ts"
  - "test/serve.test.ts"
symbols:
  - "parseMarkdownWithFrontmatter"
  - "inspectGit"
  - "nextEntryId"
  - "buildSearchAgentPacket"
  - "searchLedgerIndex"
  - "serveStaticReader"
  - "parseArgs"
docs: []
docsImpact:
  status: "not-needed"
  reason: "Audit fixes harden existing behavior, tests, help text, and edge cases without adding a new documented workflow."
backlog:
  - "B005"
  - "B006"
commits: []
---

# 0072: Comprehensive Audit Correctness Hardening

## Summary

Fixed correctness, robustness, and ergonomics issues found during a
comprehensive active audit.

## Why

The audit covered parser behavior, local serving, agent packet accounting,
static reader filters, entry ID allocation, Git diagnostics, CLI argument
parsing, and help text. Each issue was safe to fix inline and had a direct test
or focused verification path.

## Changed Files

### src/frontmatter.ts and src/release.ts

- What changed: Made YAML frontmatter fence detection line-exact and CRLF-safe.
- Anchor: `parseMarkdownWithFrontmatter`, `assignReleaseInMarkdown`
- On conflict: Closing frontmatter fences must be their own line.

### src/serve.ts

- What changed: Hardened static serving against malformed URI encodings,
  directory reads, path traversal, and stream errors before sending 200 status.
- Anchor: `serveStaticReader`
- On conflict: Keep local preview constrained to the render output directory.

### src/packet.ts and src/search.ts

- What changed: Fixed search-packet omitted-entry accounting and normalized
  invalid numeric limits for search APIs.
- Anchor: `buildSearchAgentPacket`, `searchLedgerIndex`
- On conflict: Packet truncation should count every omitted matching search
  result, not only results after applying `--limit`.

### src/newEntry.ts

- What changed: Allocated entry IDs across all entry-like records and only
  stripped configured ID prefixes from the start of IDs.
- Anchor: `nextEntryId`
- On conflict: Keep change, product-note, and feedback records in the same entry
  ID namespace.

### src/git.ts

- What changed: Distinguished Git executable availability from worktree
  membership in diagnostics.
- Anchor: `inspectGit`
- On conflict: A non-Git directory should report Git available when the
  executable exists, but `insideWorkTree: false`.

### src/renderHtml.ts and src/renderAssets.ts

- What changed: Stored static reader area and tag data as JSON arrays so filters
  handle values containing spaces.
- Anchor: `datasetList`
- On conflict: Preserve exact facet values instead of splitting on whitespace.

### src/cli.ts

- What changed: Added `--flag=value` parsing, stricter positive integer flag
  parsing, and current MCP help text.
- Anchor: `parseArgs`
- On conflict: Preserve existing `--flag value` behavior.

### tests

- What changed: Added or expanded focused coverage for each corrected edge case,
  including static serving.
- Anchor: audit regression coverage
- On conflict: Keep these tests tied to the edge cases they protect.

## Behavior And UX Impact

Users get more predictable CLI flag handling, more accurate agent packet
truncation metadata, safer local static serving, correct entry IDs after product
notes, and more accurate Git health diagnostics.

## Invariants

- Existing documented commands and output shapes remain compatible.
- Static reader output remains fully derived from source Markdown.
- Local serving must not expose files outside the render output directory.
- Entry IDs remain deterministic and duplicate-resistant across entry-like
  records.

## Verification

- `npm test -- --run test/newEntry.test.ts test/release.test.ts test/search.test.ts test/frontmatter.test.ts test/packet.test.ts test/serve.test.ts test/render.test.ts test/cliE2e.test.ts test/git.test.ts test/doctor.test.ts test/cliHelp.test.ts`
- `npm run typecheck`
- `npm audit --omit=dev`
- `npm ls --depth=0`
- `npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters`
- `npm run ci`
- `node dist/cli.js stale --check`
- `node dist/cli.js doctor`
- `npm run release:build`

## Notes

No deferred product or architecture decisions were identified in this pass.
