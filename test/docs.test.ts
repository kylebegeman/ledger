import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import {
  auditDocs,
  buildDocsRoutingManifest,
  classifyDocsFile,
  classifyDocsPaths,
  formatDocsMigrationReport,
  formatDocsStartHere,
  writeDocsMigrationReport,
  writeDocsRoutingManifest,
  writeDocsStartHere,
} from "../src/docs.js";
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

  it("classifies explicit path lists", () => {
    expect(
      classifyDocsPaths(["docs/architecture/runtime.md", "docs/llm/START_HERE.md"]),
    ).toEqual([
      { path: "docs/architecture/runtime.md", classification: "durable" },
      { path: "docs/llm/START_HERE.md", classification: "routing" },
    ]);
  });

  it("reports missing and unreferenced docs", async () => {
    const workspace = await createFixtureWorkspace();
    const documents = await readLedgerDocuments(workspace);
    const audit = await auditDocs(workspace, documents);

    expect(audit.missingReferences).toEqual(["docs/missing.md"]);
    expect(audit.unreferencedDocs).toEqual(["docs/architecture/unreferenced.md"]);
    expect(audit.scratchDocs).toEqual(["docs/scratchpad/note.md"]);
    expect(audit.generatedDocs).toEqual(["docs/generated/report.json"]);
    expect(audit.unknownDocs).toEqual(["docs/misc/note.md"]);
  });

  it("builds and writes docs routing outputs", async () => {
    const workspace = await createFixtureWorkspace();
    const documents = await readLedgerDocuments(workspace);
    const audit = await auditDocs(workspace, documents);
    const manifest = buildDocsRoutingManifest(audit);
    const writtenPath = await writeDocsRoutingManifest(workspace, manifest);
    const startHerePath = await writeDocsStartHere(workspace, audit);
    const startHere = formatDocsStartHere(audit);

    expect(manifest.generatedBy).toBe("ledger");
    expect(manifest.docsRoot).toBe("docs");
    expect(manifest.routes).toContainEqual({
      path: "docs/architecture/runtime.md",
      classification: "durable",
    });
    expect(manifest.routes.some((route) => route.classification === "generated")).toBe(false);
    expect(writtenPath).toBe("docs/llm/manifest.json");
    expect(startHerePath).toBe("docs/llm/START_HERE.md");
    expect(startHere).toContain("## Durable Docs");
    expect(startHere).toContain("docs/architecture/runtime.md");
  });

  it("writes a docs migration report", async () => {
    const workspace = await createFixtureWorkspace();
    const documents = await readLedgerDocuments(workspace);
    const audit = await auditDocs(workspace, documents);
    const reportPath = await writeDocsMigrationReport(workspace, audit);
    const report = formatDocsMigrationReport(audit);

    expect(reportPath).toBe(".ledger/reports/docs-migration.md");
    expect(report).toContain("Ledger Docs Migration Report");
    expect(report).toContain("Promote useful scratch docs");
    expect(report).toContain("docs/misc/note.md");
  });
});

async function createFixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-docs-test-"));
  await mkdir(path.join(tempDir, ".ledger", "entries"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "backlog"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "decisions"), { recursive: true });
  await mkdir(path.join(tempDir, ".ledger", "releases"), { recursive: true });
  await mkdir(path.join(tempDir, "docs", "architecture"), { recursive: true });
  await mkdir(path.join(tempDir, "docs", "generated"), { recursive: true });
  await mkdir(path.join(tempDir, "docs", "scratchpad"), { recursive: true });
  await mkdir(path.join(tempDir, "docs", "misc"), { recursive: true });
  await writeFile(path.join(tempDir, "docs", "architecture", "runtime.md"), "# Runtime\n");
  await writeFile(
    path.join(tempDir, "docs", "architecture", "unreferenced.md"),
    "# Unreferenced\n",
  );
  await writeFile(path.join(tempDir, "docs", "generated", "report.json"), "{}\n");
  await writeFile(path.join(tempDir, "docs", "scratchpad", "note.md"), "# Scratch\n");
  await writeFile(path.join(tempDir, "docs", "misc", "note.md"), "# Unknown\n");
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
