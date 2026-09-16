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
    expect(matchesGlob("packages/app/generated/client.ts", "**/generated/**")).toBe(true);
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

  it("treats entry file globs as coverage and explains required paths", async () => {
    const workspace = await createFixtureWorkspace();
    await writeFile(
      path.join(workspace.projectRoot, ".ledger", "entries", "0002-pattern.md"),
      entry("0002", ["src/features/**"]),
    );
    await mkdir(path.join(workspace.projectRoot, "src", "features"), { recursive: true });
    await writeFile(path.join(workspace.projectRoot, "src", "features", "new.ts"), "covered");
    await writeFile(path.join(workspace.projectRoot, "src", "outside.ts"), "missing");
    await git(workspace.projectRoot, "init");
    await git(workspace.projectRoot, "add", ".");

    const documents = await readLedgerDocuments(workspace);
    const result = await checkCoverage(workspace, documents, { staged: true });
    const covered = result.files.find((file) => file.path === "src/features/new.ts");
    const missing = result.files.find((file) => file.path === "src/outside.ts");

    expect(covered?.status).toBe("covered");
    expect(covered?.coveredBy).toContain("src/features/**");
    expect(missing?.status).toBe("missing");
    expect(missing?.requiredBy).toBe("src/**");
  });

  it("checks a committed base-to-head range from a clean worktree", async () => {
    const workspace = await createFixtureWorkspace();
    await git(workspace.projectRoot, "init");
    await git(workspace.projectRoot, "config", "user.email", "ledger@example.com");
    await git(workspace.projectRoot, "config", "user.name", "Ledger Test");
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "base");
    const base = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");
    await writeFile(path.join(workspace.projectRoot, "src", "range-missing.ts"), "missing");
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "head");
    const head = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");

    const documents = await readLedgerDocuments(workspace);
    const result = await checkCoverage(workspace, documents, { base, head });

    expect(result.changedFiles).toEqual(["src/range-missing.ts"]);
    expect(result.missingFiles).toEqual(["src/range-missing.ts"]);
  });

  it("treats coverage from records outside the change set as historical under current mode", async () => {
    const workspace = await createFixtureWorkspace();
    await writeFile(path.join(workspace.projectRoot, "src", "covered.ts"), "v1");
    await git(workspace.projectRoot, "init");
    await git(workspace.projectRoot, "config", "user.email", "ledger@example.com");
    await git(workspace.projectRoot, "config", "user.name", "Ledger Test");
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "base with receipt");
    const base = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");
    await writeFile(path.join(workspace.projectRoot, "src", "covered.ts"), "v2");
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "change without a new receipt");
    const head = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");
    const documents = await readLedgerDocuments(workspace);

    const current = await checkCoverage(workspace, documents, { base, head });
    expect(current.mode).toBe("current");
    expect(current.currentEntries).toEqual([]);
    expect(current.historicalFiles).toEqual(["src/covered.ts"]);
    expect(current.missingFiles).toEqual(["src/covered.ts"]);
    const file = current.files.find((candidate) => candidate.path === "src/covered.ts");
    expect(file?.status).toBe("historical");
    expect(file?.coveredBy).toEqual(["src/covered.ts"]);
    expect(file?.currentEntries).toEqual([]);

    const any = await checkCoverage(workspace, documents, { base, head, mode: "any" });
    expect(any.missingFiles).toEqual([]);
    expect(any.files.find((candidate) => candidate.path === "src/covered.ts")?.status).toBe("covered");

    await writeFile(
      path.join(workspace.projectRoot, ".ledger", "entries", "0001-test.md"),
      entry("0001", ["src/covered.ts"]).replace('updated: "2026-06-29"', 'updated: "2026-09-16"'),
    );
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "update the receipt");
    const refreshed = await checkCoverage(workspace, await readLedgerDocuments(workspace), {
      base,
      head: await gitOutput(workspace.projectRoot, "rev-parse", "HEAD"),
    });
    expect(refreshed.currentEntries).toEqual(["0001"]);
    expect(refreshed.missingFiles).toEqual([]);
    expect(refreshed.files.find((candidate) => candidate.path === "src/covered.ts")?.currentEntries).toEqual(["0001"]);
  });

  it("requires coverage when a source file is renamed outside the required path set", async () => {
    const workspace = await createFixtureWorkspace();
    await writeFile(path.join(workspace.projectRoot, "src", "renamed.ts"), "source");
    await git(workspace.projectRoot, "init");
    await git(workspace.projectRoot, "config", "user.email", "ledger@example.com");
    await git(workspace.projectRoot, "config", "user.name", "Ledger Test");
    await git(workspace.projectRoot, "add", ".");
    await git(workspace.projectRoot, "commit", "-m", "base");
    const base = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");
    await mkdir(path.join(workspace.projectRoot, "archive"), { recursive: true });
    await git(workspace.projectRoot, "mv", "src/renamed.ts", "archive/renamed.ts");
    await git(workspace.projectRoot, "commit", "-m", "move source out of scope");
    const head = await gitOutput(workspace.projectRoot, "rev-parse", "HEAD");

    const result = await checkCoverage(
      workspace,
      await readLedgerDocuments(workspace),
      { base, head },
    );

    expect(result.changedFiles).toEqual(["archive/renamed.ts", "src/renamed.ts"]);
    expect(result.missingFiles).toEqual(["src/renamed.ts"]);
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

async function gitOutput(cwd: string, ...args: readonly string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  return await new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

function entry(id = "0001", files: readonly string[] = ["src/covered.ts"]): string {
  return `---
id: "${id}"
kind: "change"
title: "Test"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
${files.map((file) => `  - "${file}"`).join("\n")}
symbols: []
commits: []
---

# ${id}: Test

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
