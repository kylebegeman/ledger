---
id: "0119"
kind: "change"
title: "Type, bundle, and browser-test the reader runtime"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas:
  - "reader"
  - "architecture"
  - "trust"
files:
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "src/renderAssets.ts"
  - "src/searchCore.ts"
  - "package.json"
  - "package-lock.json"
  - "tsconfig.build.json"
  - "test/readerRuntime.test.ts"
  - "test/searchCore.test.ts"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
symbols:
  - "staticReaderRuntime"
  - "staticReaderStyles"
  - "readReaderAsset"
  - "applyFilters"
  - "openPalette"
  - "scoreSearchDocument"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/API.md"
docsImpact:
  status: "updated"
  reason: "The architecture render section describes the typed reader sources, the esbuild bundle, the inline embedding, and the browser tests; the API doc's unstable example notes that the runtime string is read from the bundle; the README development section lists the reader build."
  docs:
    - "docs/ARCHITECTURE.md"
    - "docs/API.md"
commits: []
backlog:
  - "B008"
decisions:
  - "D005"
  - "D007"
related:
  - "0103"
---

# 0119: Type, Bundle, And Browser-Test The Reader Runtime

## Summary

The reader's browser code is now a typed module, `src/reader/runtime.ts`,
compiled against the DOM library with strict null checks, and its stylesheet
is a plain `src/reader/styles.css`. esbuild bundles both into `dist/reader/`
(`npm run build:reader`, part of `build` and run before `test`), and
`src/renderAssets.ts` reads the bundle at load time, so `renderHtml` keeps
inlining the styles and script and the reader still works from a `file:` URL
under the unchanged content security policy. The runtime imports `fuzzyScore`
and `scoreSearchFields` from `src/searchCore.ts` directly, replacing the
`Function.prototype.toString()` serialization. A happy-dom test mounts the
rendered HTML, evaluates the bundle, and exercises search ranking, filters,
the record panel, the theme toggle, and the command palette; the old parity
test's serialization half is gone.

## Why

B008's A4 item and D005's dependency policy: 650 lines of untested template
string were the largest untyped surface in the package, and every reader test
was string containment. Decision D005 allows a bundler and a browser harness
as dev dependencies; esbuild was already on disk through vitest and happy-dom
runs inside vitest, so the production dependency list is unchanged. Keeping
the bundle inlined avoids a second artifact, a CSP change, and any behavior
difference for static hosts. The visual system port in B009 can now happen
in a real stylesheet.

## Changed Files

### Reader sources

- Files: `src/reader/runtime.ts`, `src/reader/styles.css`
- Changed: the runtime converted to TypeScript with typed control lookups,
  guarded `startViewTransition`, and a direct search core import; the
  stylesheet extracted verbatim.
- Anchor: `applyFilters`
- On conflict: The runtime must stay free of imports other than
  `searchCore`; esbuild bundles it as an IIFE and the renderer inlines it.

### Asset loading and build

- Files: `src/renderAssets.ts`, `src/searchCore.ts`, `package.json`,
  `package-lock.json`, `tsconfig.build.json`
- Changed: `staticReaderStyles` and `staticReaderRuntime` read
  `dist/reader/*` from either the built package or the source tree;
  `sharedSearchRuntime` removed; `build:reader`, `build`, and `test` scripts;
  `esbuild` and `happy-dom` as dev dependencies; the reader sources excluded
  from `tsc` emit.
- Anchor: `readReaderAsset`
- On conflict: `npm test` must build the reader first; a missing bundle is a
  clear error, never an empty reader.

### Tests and docs

- Files: `test/readerRuntime.test.ts`, `test/searchCore.test.ts`,
  `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`
- Changed: browser tests in happy-dom; the parity test keeps its ranking
  assertions; docs.
- Anchor: `readerRuntime.test.ts`
- On conflict: The browser test declares its environment with a file-level
  `@vitest-environment` comment so the rest of the suite stays in Node.

## Behavior And UX Impact

The rendered reader is byte-for-byte equivalent in behavior; the inlined
script is now a bundle rather than a template string. Contributors run
`npm run build:reader` (or `npm run build`) before using the reader from a
source checkout.

## Invariants

- Search scoring exists once, in `src/searchCore.ts`, for Node and the
  browser.
- The reader runtime has executed browser tests.
- Production dependencies are unchanged.

## Verification

- `npm run typecheck`
- `npm test` (297 tests, including `test/readerRuntime.test.ts` in happy-dom)
- `npm run build`
- `node dist/cli.js render` and `node dist/cli.js doctor` in this repository
- `npm run ci`

## Notes

Milestone eight of 0.7 trust (B008). Next: sharded search, sqlite full-text
search, and chunked reader artifacts.
