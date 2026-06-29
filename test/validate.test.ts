import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import { buildIndexes, explainFile } from "../src/indexer.js";
import type { LedgerWorkspace } from "../src/types.js";
import { validateDocuments } from "../src/validate.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("Ledger validation", () => {
  it("validates and indexes change entries", async () => {
    const workspace = await createFixtureWorkspace();
    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);
    const indexes = buildIndexes(workspace, documents);

    expect(result.errors).toEqual([]);
    expect(indexes.byFile["src/cli.ts"]).toEqual(["0001"]);
    expect(explainFile(documents, "src/cli.ts").map((document) => document.id)).toEqual([
      "0001",
    ]);
  });

  it("reports duplicate ids", async () => {
    const workspace = await createFixtureWorkspace({ duplicate: true });
    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);

    expect(result.errors.some((issue) => issue.message.includes("duplicate id"))).toBe(
      true,
    );
  });
});

async function createFixtureWorkspace(options: { duplicate?: boolean } = {}): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-test-"));
  await mkdir(path.join(tempDir, ".ledger", "entries"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "backlog"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "decisions"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "releases"), { recursive: true });
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
`,
  );
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-test.md"),
    entry("0001"),
  );
  if (options.duplicate) {
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0001-duplicate.md"),
      entry("0001"),
    );
  }

  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

function entry(id: string): string {
  return `---
id: "${id}"
kind: "change"
title: "Test"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols: []
commits: []
---

# ${id}: Test

## Summary

Adds a test entry.

## Why

Testing.

## Changed Files

### src/cli.ts

- What changed: Test.
- Anchor: run
- On conflict: Keep test behavior.

## Behavior And UX Impact

None.

## Invariants

- Validation passes.

## Verification

- npm test

## Notes

None.
`;
}
