import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCoverage, isCoverageRequired, matchesGlob } from "../src/coverage.js";
import { readLedgerConfig } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("matchesGlob", () => {
  it("matches simple recursive prefixes and file globs", () => {
    expect(matchesGlob("src/cli.ts", "src/**")).toBe(true);
    expect(matchesGlob("src/nested/cli.ts", "src/**")).toBe(true);
    expect(matchesGlob("docs/README.md", "src/**")).toBe(false);
    expect(matchesGlob("src/cli.ts", "src/*.ts")).toBe(true);
    expect(matchesGlob("src/nested/cli.ts", "src/*.ts")).toBe(false);
  });
});

describe("checkCoverage", () => {
  it("requires entries only for configured and non-ignored paths", async () => {
    const workspace = await createFixtureWorkspace();
    expect(isCoverageRequired(workspace, "src/cli.ts")).toBe(true);
    expect(isCoverageRequired(workspace, "dist/cli.js")).toBe(false);
    expect(isCoverageRequired(workspace, ".ledger/reports/latest-validation.md")).toBe(
      false,
    );
  });

  it("reports missing coverage for changed files not listed by entries", async () => {
    const workspace = await createFixtureWorkspace();
    await writeFile(path.join(workspace.projectRoot, "src", "covered.ts"), "covered");
    await writeFile(path.join(workspace.projectRoot, "src", "missing.ts"), "missing");
    await git(workspace.projectRoot, "init");
    await git(workspace.projectRoot, "add", ".");

    const documents = await readLedgerDocuments(workspace);
    const result = await checkCoverage(workspace, documents, { staged: true });

    expect(result.missingFiles).toContain("src/missing.ts");
    expect(result.missingFiles).not.toContain("src/covered.ts");
  });
});

async function createFixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-coverage-test-"));
  await mkdir(path.join(tempDir, ".ledger", "entries"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "backlog"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "decisions"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "releases"), { recursive: true });
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(
    path.join(tempDir, ".ledger", "config.yaml"),
    `version: 1
project: fixture
source:
  entries: .ledger/entries
  backlog: .ledger/backlog
  decisions: .ledger/decisions
  releases: .ledger/releases
ids:
  entryPrefix: ""
  entryWidth: 4
  backlogPrefix: B
  decisionPrefix: D
validation:
  requireVerification: true
  requireChangedFiles: true
  requireInvariants: true
indexes:
  output: .ledger/indexes
reports:
  output: .ledger/reports
render:
  output: .ledger/dist
git:
  requireEntryFor:
    - src/**
  ignore:
    - dist/**
    - .ledger/reports/**
docs:
  root: docs
  managed: false
  routing:
    startHere: docs/llm/START_HERE.md
    manifest: docs/llm/manifest.json
`,
  );
  await writeFile(path.join(tempDir, ".ledger", "entries", "0001-test.md"), entry());

  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  const { execFile } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    execFile("git", args, { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function entry(): string {
  return `---
id: "0001"
kind: "change"
title: "Test"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/covered.ts"
symbols: []
commits: []
---

# 0001: Test

## Summary

Adds a test entry.

## Why

Testing.

## Changed Files

### src/covered.ts

- What changed: Test.
- Anchor: covered
- On conflict: Keep test behavior.

## Behavior And UX Impact

None.

## Invariants

- Coverage works.

## Verification

- npm test
`;
}
