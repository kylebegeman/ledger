# Publishing The Changelog

`ledger render --profile public` builds a changelog from released release
records and their Public Notes. It holds nothing else: paths, files, symbols,
invariants, and internal links are stripped. The output in
`.ledger/dist/public/` is a static site that works from any host.

```bash
ledger render --profile public --site-url https://example.github.io/project/
```

What the output contains:

- `index.html`, the changelog. Search, pagination, and "changed since your
  last visit" markers run in the page, and the markers stay in the viewer's
  browser.
- `feed.xml`, an Atom feed of the newest 50 releases. Feed readers get each
  release's notes as HTML content.
- `search-index.json` and `graph.json`, which the page loads for ranked
  search.

Each release has a permalink named by its id, such as `index.html#v1.2.0`. The
version label links to it. Opening a permalink turns to the release's page,
even when the changelog is filtered.

`--site-url` names the absolute URL the page will be served from. It makes
the canonical link, the Open Graph URL, and the feed's self and entry links
absolute. Without it the feed still carries every release, and feed readers
fall back to its content. Feed ids come from the project name and the release
id, so they stay the same when the site moves.

## GitHub Pages

This workflow publishes the changelog when a release record changes. In the
repository settings, set Pages to deploy from GitHub Actions, and change the
`paths` filter if `source.releases` points somewhere other than
`.ledger/releases`.

```yaml
name: Changelog

on:
  push:
    branches: [main]
    paths: [".ledger/releases/**"]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Render the changelog
        run: >-
          npx --yes @kylebegeman/ledger@0.9.2 render --profile public
          --site-url "https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/"
      - uses: actions/upload-pages-artifact@v5
        with:
          path: .ledger/dist/public

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Pin the Ledger version the repository uses elsewhere, and pin actions by
commit if your policy requires it. `ledger render` validates every record
first, so a record that fails validation stops the deploy instead of
publishing a partial changelog. A release record without a Public Notes
section is one of those failures.

## Other hosts

Upload `.ledger/dist/public/` as is. The page uses relative links, so it can
live under any path. Serve `feed.xml` as `application/atom+xml` if the host
lets you set types; `ledger serve --profile public` does.
