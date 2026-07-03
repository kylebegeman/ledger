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
    expect(indexes.byDecision.D001).toEqual(["0001"]);
    expect(indexes.byBacklog.B001).toEqual(["0001"]);
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

  it("warns about metadata and reference quality issues", async () => {
    const workspace = await createFixtureWorkspace({ qualityIssues: true });
    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);
    const messages = result.warnings.map((issue) => issue.message);

    expect(messages).toContain("updated is missing");
    expect(messages).toContain("files is empty");
    expect(messages).toContain("invariants section is empty or too short");
    expect(messages).toContain('unknown frontmatter field "customField"');
    expect(messages).toContain("docs reference does not exist: docs/missing.md");
  });

  it("can escalate validation warnings under the strict profile", async () => {
    const workspace = await createFixtureWorkspace({
      qualityIssues: true,
      profile: "strict",
    });
    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);
    const messages = result.errors.map((issue) => issue.message);

    expect(result.warnings).toEqual([]);
    expect(messages).toContain("updated is missing");
    expect(messages).toContain("files is empty");
    expect(messages).toContain('unknown frontmatter field "customField"');
    expect(messages).toContain("docs reference does not exist: docs/missing.md");
  });

  it("supports historical records, stale ref acknowledgements, and typed extensions", async () => {
    const workspace = await createFixtureWorkspace({
      configTail: `schema:
  allowedFrontmatterFields:
    - compatibility
  extensions:
    phaseId: string
`,
    });
    await writeFile(
      path.join(tempDir!, ".ledger", "entries", "0003-historical.md"),
      entry("0003", {
        status: "historical",
        files: ["src/removed.ts"],
        extraFrontmatter: 'phaseId: "P1"\ncompatibility: "legacy-only"',
      }),
    );
    await writeFile(
      path.join(tempDir!, ".ledger", "entries", "0004-stale.md"),
      entry("0004", {
        files: ["src/stale.ts"],
        extraFrontmatter: 'staleRefs:\n  - "files:src/stale.ts"\nphaseId: 123',
      }),
    );

    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);
    const messages = result.issues.map((issue) => issue.message);

    expect(messages).not.toContain("files reference does not exist: src/removed.ts");
    expect(messages).not.toContain("files reference does not exist: src/stale.ts");
    expect(messages).not.toContain('unknown frontmatter field "phaseId"');
    expect(messages).not.toContain('unknown frontmatter field "compatibility"');
    expect(messages).toContain('frontmatter field "phaseId" must be string');

    const currentOnly = validateDocuments(workspace, documents, { currentOnly: true });
    expect(currentOnly.issues.some((issue) => issue.path?.includes("0003-historical"))).toBe(false);
  });
});

async function createFixtureWorkspace(
  options: {
    duplicate?: boolean;
    qualityIssues?: boolean;
    configTail?: string;
    profile?: "standard" | "strict";
  } = {},
): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-test-"));
  await mkdir(path.join(tempDir, "src"), { recursive: true });
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
  profile: ${options.profile ?? "standard"}
  requireVerification: true
  requireChangedFiles: true
  requireInvariants: true
indexes:
  output: .ledger/indexes
reports:
  output: .ledger/reports
render:
  output: .ledger/dist
${options.configTail ?? ""}
`,
  );
  await writeFile(
    path.join(tempDir, "src", "cli.ts"),
    "export function run() {}\n",
  );
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-test.md"),
    entry("0001"),
  );
  if (options.qualityIssues) {
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0002-quality-issues.md"),
      qualityIssueEntry(),
    );
  }
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

function qualityIssueEntry(): string {
  return `---
id: "0002"
kind: "change"
title: "Quality issues"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files: []
docs:
  - "docs/missing.md"
customField: true
---

# 0002: Quality Issues

## Summary

Adds a test entry.

## Why

Testing.

## Changed Files

## Behavior And UX Impact

None.

## Invariants

## Verification

- npm test
`;
}

function entry(
  id: string,
  options: {
    readonly status?: string;
    readonly files?: readonly string[];
    readonly extraFrontmatter?: string;
  } = {},
): string {
  const files = options.files ?? ["src/cli.ts"];
  return `---
id: "${id}"
kind: "change"
title: "Test"
date: "2026-06-29"
updated: "2026-06-29"
status: "${options.status ?? "landed"}"
areas: ["cli"]
files:
${files.map((file) => `  - "${file}"`).join("\n")}
symbols: []
decisions:
  - "D001"
backlog:
  - "B001"
commits: []
${options.extraFrontmatter ? `${options.extraFrontmatter}\n` : ""}---
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
