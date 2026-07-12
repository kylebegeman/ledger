---
id: "0076"
kind: "change"
title: "Harden static reader serving and network exposure"
date: "2026-07-12"
updated: "2026-07-12"
status: "landed"
areas: ["security", "serve", "render"]
files:
  - "README.md"
  - "SECURITY.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
  - "src/cli.ts"
  - "src/index.ts"
  - "src/renderHtml.ts"
  - "src/serve.ts"
  - "test/publicApi.test.ts"
  - "test/render.test.ts"
  - "test/serve.test.ts"
symbols:
  - "serveStaticReader"
  - "closeStaticReader"
  - "LedgerServeMode"
  - "validateExposure"
  - "resolveRequestPath"
docs:
  - "README.md"
  - "SECURITY.md"
  - "docs/API.md"
  - "docs/ARCHITECTURE.md"
docsImpact:
  status: "updated"
  reason: "Public, security, API, and architecture docs now define local and authenticated network serving behavior."
  docs:
    - "README.md"
    - "SECURITY.md"
    - "docs/API.md"
    - "docs/ARCHITECTURE.md"
commits: []
---

# 0076: Harden Static Reader Serving And Network Exposure

## Summary

The reader server now defaults to a host-validated loopback mode and requires
explicit, token-authenticated network exposure for non-loopback binding. It also
adds symlink-safe file resolution, method and URI limits, bounded HTTP server
settings, restrictive response headers, static CSP metadata, and graceful
connection shutdown.

## Why

Rendered Ledger records can contain private paths, implementation notes, and
release history. A convenient preview server should not become an accidental
unauthenticated network service or respond to DNS-rebinding Host headers. The
previous lexical traversal check also followed final symlinks and the server had
no formal header, method, timeout, or shutdown contract.

## Changed Files

### HTTP serving boundary

- Files: `src/serve.ts`, `src/cli.ts`, `src/index.ts`
- Rule: Local mode accepts loopback binding and loopback Host headers only.
  Network mode requires `--expose` plus `LEDGER_SERVE_TOKEN` with at least 24
  characters. Only `GET` and `HEAD` are served.
- On conflict: Never allow a non-loopback bind to silently inherit the
  unauthenticated local-mode posture.

### Browser policy

- Files: `src/renderHtml.ts`, `test/render.test.ts`
- Rule: Generated HTML carries a restrictive CSP meta policy and no-referrer
  directive; the server adds CSP, no-store, frame, MIME, resource, permission,
  and referrer headers.
- On conflict: Inline runtime requirements must remain explicit in CSP rather
  than broadening the default source policy.

### Verification and documentation

- Files: `test/serve.test.ts`, `test/publicApi.test.ts`, `README.md`,
  `SECURITY.md`, `docs/API.md`, `docs/ARCHITECTURE.md`
- Rule: Tests cover local headers, HEAD, method rejection, traversal, malformed
  paths, escaping symlinks, exposure refusal, and authenticated network access.
- On conflict: Keep public instructions clear that network mode needs TLS when
  traffic leaves the machine.

## Behavior And UX Impact

`ledger serve` remains frictionless on `127.0.0.1`. Users must now add
`--expose` and set `LEDGER_SERVE_TOKEN` before binding to a network interface.
Network clients can use HTTP Basic user `ledger` or a Bearer token. Shutdown
closes idle connections first and force-closes remaining connections after a
bounded grace period.

## Invariants

- Reader content is treated as private by default.
- Local mode never binds to a non-loopback host.
- Network mode never starts without a sufficiently long access token.
- Served paths resolve inside the real render root, including through symlinks.
- Only read methods are accepted and every response carries security headers.

## Verification

- `npm run typecheck`
- `npm test -- --run test/serve.test.ts test/render.test.ts test/cliHelp.test.ts`
- `npm run build`
- `node dist/cli.js serve --port 4173`

## Notes

The local server started and stopped cleanly. Visual browser automation could
not run because no browser host was available to this thread; HTTP behavior is
covered by the focused integration tests.
