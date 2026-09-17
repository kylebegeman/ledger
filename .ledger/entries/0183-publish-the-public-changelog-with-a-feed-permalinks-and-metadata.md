---
id: "0183"
kind: "change"
title: "Publish the public changelog with a feed, permalinks, and metadata"
date: "2026-09-17"
updated: "2026-09-17"
status: "landed"
areas:
  - "reader"
  - "render"
  - "publishing"
files:
  - "src/renderFeed.ts"
  - "src/render.ts"
  - "src/operations/definitions/records.ts"
  - "src/serve.ts"
  - "test/fixtures/operations-contract.json"
  - "src/renderHtml.ts"
  - "src/reader/runtime.ts"
  - "src/reader/styles.css"
  - "test/render.test.ts"
  - "test/readerRuntime.test.ts"
  - "test/serve.test.ts"
  - "test/cliHelp.test.ts"
  - "docs/PUBLISHING.md"
  - "docs/ARCHITECTURE.md"
  - "README.md"
symbols:
  - "renderAtomFeed"
  - "uuidV5"
  - "normalizeSiteUrl"
  - "pageMetadata"
  - "releaseAnchor"
  - "revealHashTarget"
docs:
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/PUBLISHING.md"
docsImpact:
  status: "updated"
  reason: "docs/PUBLISHING.md is new with the GitHub Pages workflow, the architecture doc describes the feed and permalinks, and the README links the guide."
  docs:
    - "docs/PUBLISHING.md"
    - "docs/ARCHITECTURE.md"
    - "README.md"
commits: []
decisions:
  - "D005"
related:
  - "0180"
  - "0181"
  - "B002"
---

# 0183: Publish the public changelog with a feed, permalinks, and metadata

## Summary

The public changelog can be published as a site people follow.

- **Atom feed.** `ledger render --profile public` writes `feed.xml` with the
  newest 50 releases and their notes as HTML content. Entry ids are name-based
  UUIDs of the project and release, so they survive a moved site. The feed's
  updated time comes from the newest release, so an unchanged catalog writes
  the same file.
- **Permalinks.** Each release's anchor is its id, such as `#v1.2.0`, and the
  version label links to it. Opening a permalink turns to that release's
  page, and clears any filters that hide it.
- **Page metadata.** Both profiles carry a description, Open Graph tags, and
  the mark as their icon. The public page also links its feed.
- **`--site-url`.** `ledger render --site-url <url>` takes an absolute http or
  https URL. It adds a canonical link and `og:url`, and makes the feed's self
  and entry links absolute.
- **Publishing guide.** `docs/PUBLISHING.md` has a GitHub Pages workflow.
  `ledger serve` sends the feed as `application/atom+xml`.

## Why

Decision D005's reader track called for a publishable public changelog (E5):
stable permalinks, an Atom feed, metadata, and a GitHub Pages recipe.

Rejected:

- **A `render.siteUrl` config key.** It would be a config schema change. The
  URL belongs to where one render is deployed, which a workflow names with
  the flag.
- **Enabling GitHub Pages for this repository.** That is a deployment change
  for Kyle to decide. The guide shows the workflow instead.
- **Ids built from the site URL.** A moved site would re-announce every
  release to subscribers.

## Changed Files

### Feed and site URL

- Files: `src/renderFeed.ts`, `src/render.ts`,
  `src/operations/definitions/records.ts`, `src/serve.ts`,
  `test/fixtures/operations-contract.json`
- Changed:
  - `renderAtomFeed`, `uuidV5`, and `normalizeSiteUrl` are new.
  - The model carries `siteUrl`. `writeStaticReader` writes `feed.xml` for
    the public profile, and the budget check counts it as the `feed`
    artifact.
  - The `render` operation takes `siteUrl`, exposed as the `--site-url`
    flag. The contract fixture changed only by that input and flag.
  - `ledger serve` sends `.xml` as Atom.
- Anchor: `renderAtomFeed`, `uuidV5`, `normalizeSiteUrl`, `feedHref`
- On conflict: Feed ids must not depend on the site URL.

### Page, permalinks, and runtime

- Files: `src/renderHtml.ts`, `src/reader/runtime.ts`,
  `src/reader/styles.css`
- Changed:
  - `pageMetadata` writes the description, Open Graph tags, the canonical
    link, the feed link, and the icon.
  - `releaseAnchor` names each release article, and the version label links
    to it. The public toolbar links the feed.
  - `revealHashTarget` runs after the first filter pass and on `hashchange`.
    It turns pages from the latest filter results and scrolls instantly.
  - `runTransition` now resolves once its update has run. Browsers run a
    view transition's update after the call returns, so the reveal must wait
    for it.
  - Entries leave room for the sticky top bar when scrolled to.
- Anchor: `pageMetadata`, `releaseAnchor`, `revealHashTarget`,
  `runTransition`
- On conflict: Keep the wait on the view transition update.

### Tests and docs

- Files: `test/render.test.ts`, `test/readerRuntime.test.ts`,
  `test/serve.test.ts`, `test/cliHelp.test.ts`, `docs/PUBLISHING.md`,
  `docs/ARCHITECTURE.md`, `README.md`
- Changed:
  - Render tests cover:
    - the public output files and the feed's content and time
    - absolute links, stable ids across sites, and rejected URLs
    - the RFC 4122 known-answer UUID
  - Browser tests cover:
    - a permalink on a later page
    - a transition whose update runs later, as in browsers
    - a hash change that clears a search
  - The serve test covers the feed's content type, and the help test the new
    usage line.
  - The docs describe the feed, permalinks, metadata, and the Pages
    workflow, and the README links the guide.
- Anchor: `release permalinks`
- On conflict: Keep the deferred transition test; happy-dom alone missed
  the bug.

## Behavior And UX Impact

- Public changelogs gain a feed, permalinks, and link previews. With
  `--site-url`, their canonical and feed links are absolute.
- Internal readers gain a description and an icon.
- Filter updates now finish before later code runs, so scrolling after a
  filter change starts from the new list.

## Invariants

- The public feed carries only released releases and their Public Notes.
- Feed ids stay the same when the site URL changes.
- A permalink always shows its release, whatever filters were active.
- `--site-url` accepts only absolute http or https URLs without credentials,
  a query, or a fragment.

## Verification

- `npx vitest run test/render.test.ts test/readerRuntime.test.ts test/serve.test.ts`
- `LEDGER_UPDATE_CONTRACT=1 npx vitest run test/operations.test.ts`
- `npm run typecheck`
- `npm run ci`
- A render of this repository with `--site-url
  https://kylebegeman.github.io/ledger` wrote a feed that parses as XML, with
  absolute links and a canonical link.
- In a browser, against the public changelog served over HTTP, at 10 per
  page:
  - Opening `#v0.3.0` turned to page 2 and scrolled the release under the
    top bar.
  - Changing the hash to `#v0.1.4` turned to page 3.
  - The first try showed the release hidden, because the reveal ran before
    the browser's view transition applied its update. The deferred
    transition test now covers that case.

## Notes

GitHub Pages is not enabled for this repository; the workflow in
`docs/PUBLISHING.md` is ready when Kyle wants it.
