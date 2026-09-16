import { access, mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
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
  docsStartHereLegacyLine,
  docsStartHereMarker,
  formatDocsMigrationReport,
  formatDocsStartHere,
  isLedgerGeneratedManifest,
  isLedgerGeneratedStartHere,
  writeDocsMigrationReport,
  writeDocsRoutingFiles,
} from "../src/docs.js";
import type { LedgerDocsAudit, LedgerWorkspace } from "../src/types.js";

const curatedStartHere = "# Start here\n\n## Quick facts\n\n- Hand-written router.\n";
const curatedManifest = `${JSON.stringify(
  { version: 1, repo: "kore", entrypoint: "docs/llm/START_HERE.md", preferredReadOrder: [] },
  null,
  2,
)}\n`;

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
    const audit = await auditFixture(workspace);
    const manifest = buildDocsRoutingManifest(audit);
    const result = await writeDocsRoutingFiles(workspace, audit, manifest);
    const startHere = formatDocsStartHere(audit);

    expect(manifest.generatedBy).toBe("ledger");
    expect(manifest.docsRoot).toBe("docs");
    expect(manifest.routes).toContainEqual({
      path: "docs/architecture/runtime.md",
      classification: "durable",
    });
    expect(manifest.routes.some((route) => route.classification === "generated")).toBe(false);
    expect(result).toEqual({
      written: true,
      refused: [],
      manifestPath: "docs/llm/manifest.json",
      startHerePath: "docs/llm/START_HERE.md",
    });
    expect(startHere.startsWith(`${docsStartHereMarker}\n\n# Start Here\n`)).toBe(true);
    expect(startHere).toContain("## Durable Docs");
    expect(startHere).toContain("docs/architecture/runtime.md");
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), "utf8")).toBe(
      startHere,
    );
    expect(
      JSON.parse(await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8")),
    ).toMatchObject({ generatedBy: "ledger" });
  });

  it("recognizes START_HERE files Ledger generated", () => {
    const generated = formatDocsStartHere(emptyAudit());
    expect(isLedgerGeneratedStartHere(generated)).toBe(true);
    expect(isLedgerGeneratedStartHere(`\uFEFF${generated.replace(/\n/g, "\r\n")}`)).toBe(true);
    expect(isLedgerGeneratedStartHere(`# Start Here\n\n${docsStartHereLegacyLine}\n`)).toBe(true);
    expect(isLedgerGeneratedStartHere(`# Start Here\n\n${docsStartHereLegacyLine}   \n`)).toBe(true);
    expect(isLedgerGeneratedStartHere(curatedStartHere)).toBe(false);
    expect(isLedgerGeneratedStartHere("# LLM Start Here\n\nUse Ledger records.\n")).toBe(false);
    expect(isLedgerGeneratedStartHere("")).toBe(false);
    expect(
      isLedgerGeneratedStartHere(`# A\n\n## B\n\n## C\n\n## D\n\n## E\n\n${docsStartHereMarker}\n`),
    ).toBe(false);
  });

  it("recognizes routing manifests Ledger generated", () => {
    expect(isLedgerGeneratedManifest(JSON.stringify(buildDocsRoutingManifest(emptyAudit())))).toBe(
      true,
    );
    expect(
      isLedgerGeneratedManifest(
        `${JSON.stringify({ version: 1, generatedBy: "ledger", routes: [] }, null, 2)}\n`,
      ),
    ).toBe(true);
    expect(isLedgerGeneratedManifest(curatedManifest)).toBe(false);
    expect(isLedgerGeneratedManifest("not json")).toBe(false);
    expect(isLedgerGeneratedManifest("[]")).toBe(false);
    expect(isLedgerGeneratedManifest("null")).toBe(false);
  });

  it("refuses to replace routing files Ledger did not generate", async () => {
    const workspace = await createFixtureWorkspace();
    await writeCuratedRoutingFiles(workspace.projectRoot);
    const audit = await auditFixture(workspace);
    const manifest = buildDocsRoutingManifest(audit);

    const result = await writeDocsRoutingFiles(workspace, audit, manifest);

    expect(result).toEqual({
      written: false,
      refused: [
        { path: "docs/llm/manifest.json", reason: "not-ledger-manifest" },
        { path: "docs/llm/START_HERE.md", reason: "no-ledger-marker" },
      ],
      manifestPath: "docs/llm/manifest.json",
      startHerePath: "docs/llm/START_HERE.md",
    });
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), "utf8")).toBe(
      curatedStartHere,
    );
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8")).toBe(
      curatedManifest,
    );
    expect(await listTransactions(workspace.ledgerRoot)).toEqual([]);
  });

  it("refuses both files when only one is curated", async () => {
    const workspace = await createFixtureWorkspace();
    const audit = await auditFixture(workspace);
    const ledgerManifest = `${JSON.stringify(buildDocsRoutingManifest(audit), null, 2)}\n`;
    await mkdir(path.join(workspace.projectRoot, "docs", "llm"), { recursive: true });
    await writeFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), curatedStartHere);
    await writeFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), ledgerManifest);

    const result = await writeDocsRoutingFiles(workspace, audit, buildDocsRoutingManifest(audit));

    expect(result.written).toBe(false);
    expect(result.refused).toEqual([{ path: "docs/llm/START_HERE.md", reason: "no-ledger-marker" }]);
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8")).toBe(
      ledgerManifest,
    );
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), "utf8")).toBe(
      curatedStartHere,
    );
  });

  it("replaces curated routing files when forced", async () => {
    const workspace = await createFixtureWorkspace();
    await writeCuratedRoutingFiles(workspace.projectRoot);
    const audit = await auditFixture(workspace);

    const result = await writeDocsRoutingFiles(workspace, audit, buildDocsRoutingManifest(audit), {
      force: true,
    });

    expect(result.written).toBe(true);
    expect(result.refused).toEqual([
      { path: "docs/llm/manifest.json", reason: "not-ledger-manifest" },
      { path: "docs/llm/START_HERE.md", reason: "no-ledger-marker" },
    ]);
    const startHere = await readFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), "utf8");
    expect(startHere.startsWith(docsStartHereMarker)).toBe(true);
    expect(
      JSON.parse(await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8")),
    ).toMatchObject({ generatedBy: "ledger" });
  });

  it("replaces routing files Ledger generated without force", async () => {
    const workspace = await createFixtureWorkspace();
    const audit = await auditFixture(workspace);
    const stale = { ...buildDocsRoutingManifest(audit), generatedAt: "2020-01-01T00:00:00.000Z" };
    await mkdir(path.join(workspace.projectRoot, "docs", "llm"), { recursive: true });
    await writeFile(
      path.join(workspace.projectRoot, "docs/llm/START_HERE.md"),
      formatDocsStartHere(audit),
    );
    await writeFile(
      path.join(workspace.projectRoot, "docs/llm/manifest.json"),
      `${JSON.stringify(stale, null, 2)}\n`,
    );

    const result = await writeDocsRoutingFiles(workspace, audit, buildDocsRoutingManifest(audit));

    expect(result).toMatchObject({ written: true, refused: [] });
    const manifest = JSON.parse(
      await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8"),
    ) as { generatedAt: string };
    expect(manifest.generatedAt > stale.generatedAt).toBe(true);
  });

  it("writes Ledger-owned routing paths beside curated docs/llm files", async () => {
    const workspace = await createFixtureWorkspace({
      startHere: ".ledger/reports/docs-start-here.md",
      manifest: ".ledger/indexes/docs-routing.json",
    });
    await writeCuratedRoutingFiles(workspace.projectRoot);
    const audit = await auditFixture(workspace);
    const manifest = buildDocsRoutingManifest(audit);

    const result = await writeDocsRoutingFiles(workspace, audit, manifest);

    expect(result).toEqual({
      written: true,
      refused: [],
      manifestPath: ".ledger/indexes/docs-routing.json",
      startHerePath: ".ledger/reports/docs-start-here.md",
    });
    await expect(
      access(path.join(workspace.projectRoot, ".ledger/reports/docs-start-here.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(workspace.projectRoot, ".ledger/indexes/docs-routing.json")),
    ).resolves.toBeUndefined();
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/START_HERE.md"), "utf8")).toBe(
      curatedStartHere,
    );
    expect(await readFile(path.join(workspace.projectRoot, "docs/llm/manifest.json"), "utf8")).toBe(
      curatedManifest,
    );
    expect(manifest.routes).toContainEqual({
      path: "docs/llm/manifest.json",
      classification: "routing",
    });
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

async function auditFixture(workspace: LedgerWorkspace): Promise<LedgerDocsAudit> {
  const documents = await readLedgerDocuments(workspace);
  return auditDocs(workspace, documents);
}

function emptyAudit(): LedgerDocsAudit {
  return {
    docsRoot: "docs",
    adoption: "partial",
    files: [],
    referencedDocs: [],
    missingReferences: [],
    unreferencedDocs: [],
    scratchDocs: [],
    generatedDocs: [],
    unknownDocs: [],
  };
}

async function writeCuratedRoutingFiles(projectRoot: string): Promise<void> {
  await mkdir(path.join(projectRoot, "docs", "llm"), { recursive: true });
  await writeFile(path.join(projectRoot, "docs", "llm", "START_HERE.md"), curatedStartHere);
  await writeFile(path.join(projectRoot, "docs", "llm", "manifest.json"), curatedManifest);
}

async function listTransactions(ledgerRoot: string): Promise<readonly string[]> {
  try {
    return await readdir(path.join(ledgerRoot, "transactions"));
  } catch (error) {
    if ((error as { readonly code?: unknown }).code === "ENOENT") return [];
    throw error;
  }
}

async function createFixtureWorkspace(
  routing: { readonly startHere: string; readonly manifest: string } = {
    startHere: "docs/llm/START_HERE.md",
    manifest: "docs/llm/manifest.json",
  },
): Promise<LedgerWorkspace> {
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
    startHere: ${routing.startHere}
    manifest: ${routing.manifest}
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
