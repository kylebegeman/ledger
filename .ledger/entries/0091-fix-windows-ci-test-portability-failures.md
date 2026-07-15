---
id: "0091"
kind: "change"
title: "Fix Windows CI test portability failures"
date: "2026-07-15"
updated: "2026-07-15"
status: "landed"
areas:
  - "ci"
  - "testing"
files:
  - "test/projectPaths.test.ts"
  - "test/workspace.test.ts"
symbols:
  - "resolveProjectPath"
  - "assertSafeProjectRelativePath"
  - "initWorkspace"
docs: []
docsImpact:
  status: "none"
  reason: "Test-only portability fix; no documented behavior changed and no source code was touched."
commits: []
---

# 0091: Fix Windows CI Test Portability Failures

## Summary

Repaired the two tests that broke the windows-latest CI matrix on Node 22
and 24 since the v0.2.0 push. The projectPaths test compared the absolute
output of resolveProjectPath against a hard-coded POSIX string, which can
never match on Windows because path.resolve prepends the current drive
letter; it now compares against path.resolve of the same inputs. The
workspace YAML quoting test created a fixture directory named with a colon,
which is an illegal character in Windows file names and failed at mkdir
before reaching the assertion; the fixture is renamed to a Windows-legal
name that still requires YAML quoting. No source code changed.

## Why

CI run 29455032117 showed both failures on windows-latest while ubuntu
passed. The tempting reading of the first failure is that project-relative
paths leak platform separators, but the code already normalizes them:
assertSafeProjectRelativePath returns path.posix.normalize output, so the
paths stored in portable Ledger records are forward-slash everywhere by
construction. The value under test was instead the return of
resolveProjectPath, which is an absolute local filesystem path used only
for fs access and never persisted, so native separators and drive letters
are correct there. Normalizing that return value to forward slashes was
rejected: it would still not equal the hard-coded expectation on Windows
(the drive letter remains), and it would rewrite a value whose only
consumer is the local filesystem. The test expectation was the bug.

For the quoting test, a platform-specific skip was rejected because the
quoting behavior is worth exercising on Windows too. The serializer quotes
the project name with JSON.stringify unconditionally, so any name that YAML
would otherwise mangle exercises the same code path; a space followed by a
hash starts a comment in a plain YAML scalar, making the renamed fixture a
real quoting case that every platform can create on disk.

## Changed Files

### test/projectPaths.test.ts

- Status: modified
- What changed: The absolute-path assertion in "accepts normalized
  project-relative paths" now expects path.resolve("/repo", "docs",
  "README.md") instead of the literal "/repo/docs/README.md", so the test
  asserts safe joining under the project root in platform-native form.
- Anchor: resolveProjectPath assertion inside "accepts normalized
  project-relative paths".
- On conflict: Keep the expectation computed with path.resolve rather than
  a string literal. The POSIX-normalization guarantees are covered by the
  assertSafeProjectRelativePath assertions above it, which must keep
  expecting forward-slash output verbatim.
- Docs impact: None; test-only change with no behavior difference.

### test/workspace.test.ts

- Status: modified
- What changed: The fixture directory in "quotes project directory names
  when creating YAML config" is renamed from "project: #fixture" to
  "project #fixture", and the assertion expects the quoted form
  'project: "project #fixture"'.
- Anchor: initWorkspace quoting test.
- On conflict: The fixture name must remain legal on Windows (no colon or
  other reserved characters) while still requiring YAML quoting; the
  space-hash sequence satisfies both. Do not reintroduce a colon in any
  fixture directory name.
- Docs impact: None; test-only change with no behavior difference.

## Behavior And UX Impact

- The windows-latest CI matrix (Node 22 and 24) passes again; no product
  behavior changes on any platform.
- Contributors on Windows can run the test suite locally without the two
  environment-dependent failures.

## Invariants

- Project-relative paths stored in Ledger records are POSIX-normalized:
  assertSafeProjectRelativePath output uses forward slashes on every
  platform.
- Absolute paths returned by resolveProjectPath are platform-native and are
  never persisted into records or config.
- Test fixture directory names use only characters legal on Windows
  filesystems.

## Verification

- `npm run check` (typecheck plus 177 tests, all passing on macOS)
- windows-latest confirmation via the CI matrix on the pushed branch

## Notes

The failures date to the v0.2.0 push on 2026-07-12, when these assertions
were introduced; ubuntu and macos never exercised the Windows-only
constraints. A quick scan of the rest of test/ found no other hard-coded
POSIX absolute expectations or Windows-illegal fixture names.
