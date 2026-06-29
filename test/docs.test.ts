import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import { auditDocs, classifyDocsFile } from "../src/docs.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("docs audit", () => {
  it("classifies docs files", () => {
    expect(classifyDocsFile("docs/architecture/runtime.md")).toBe("durable");
    expect(classifyDocsFile("docs/PRODUCT.md")).toBe("durable");
    expect(classifyDocsFile("docs/llm/START_HERE.md")).toBe("routing");
    expect(classifyDocsFile("docs/scratchpad/investigation.md")).toBe("scratch");
    expect(classifyDocsFile("docs/generated/report.html")).toBe("generated");
  });

  it("reports missing and unreferenced docs", async () => {
    const workspace = await createFixtureWorkspace();
    const documents = await readLedgerDocuments(workspace);
    const audit = await auditDocs(workspace, documents);

    expect(audit.missingReferences).toEqual(["docs/missing.md"]);
    expect(audit.unreferencedDocs).toEqual(["docs/architecture/unreferenced.md"]);
  });
});

async function createFixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-docs-test-"));
  await mkdir(path.join(tempDir, ".ledger", "entries"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "backlog"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "decisions"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "releases"), { recursive: true });
  await mkdir(path.join(tempDir, "docs", "architecture"), { recursive: true });
  await writeFile(path.join(tempDir, "docs", "architecture", "runtime.md"), "# Runtime\n");
  await writeFile(
    path.join(tempDir, "docs", "architecture", "unreferenced.md"),
    "# Unreferenced\n",
  );
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
docs:
  root: docs
  managed: true
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

function entry(): string {
  return `---
id: "0001"
kind: "change"
title: "Test"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["docs"]
files:
  - "docs/architecture/runtime.md"
docs:
  - "docs/architecture/runtime.md"
  - "docs/missing.md"
symbols: []
commits: []
---

# 0001: Test

## Summary

Adds a test entry.

## Why

Testing.

## Changed Files

### docs/architecture/runtime.md

- What changed: Test.
- Anchor: Runtime
- On conflict: Keep test behavior.

## Behavior And UX Impact

None.

## Invariants

- Validation passes.

## Verification

- npm test
`;
}
