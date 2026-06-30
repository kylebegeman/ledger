import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import { migrateChangelog } from "../src/migrate.js";
import type { LedgerWorkspace } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("migrateChangelog", () => {
  it("migrates legacy Markdown records, suggests duplicate IDs, and rewrites docs", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-migrate-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    await mkdir(path.join(tempDir, "legacy"), { recursive: true });
    await writeFile(path.join(tempDir, "legacy", "0001-first.md"), legacyRecord("0001", "First"));
    await writeFile(path.join(tempDir, "legacy", "0001-second.md"), legacyRecord("0001", "Second"));
    await writeFile(
      path.join(tempDir, "docs", "README.md"),
      "See legacy/0001-first.md and legacy/0001-second.md.\n",
    );

    const workspace = await readWorkspace();
    const result = await migrateChangelog(workspace, await readLedgerDocuments(workspace), "legacy", {
      rewriteDocs: true,
    });

    expect(result.migrated).toHaveLength(2);
    expect(result.duplicates).toEqual([
      expect.objectContaining({
        originalId: "0001",
        suggestedId: "0001-2",
      }),
    ]);
    expect(result.receiptPath).toMatch(/^\.ledger\/reports\/changelog-migration-/);
    expect(await readFile(path.join(tempDir, result.migrated[0]!.targetPath), "utf8")).toContain(
      "## Migration Notes",
    );
    const docsReadme = await readFile(path.join(tempDir, "docs", "README.md"), "utf8");
    expect(docsReadme).toContain(result.migrated[0]!.targetPath);
    expect(docsReadme).toContain(result.migrated[1]!.targetPath);
  });
});

async function readWorkspace(): Promise<LedgerWorkspace> {
  if (!tempDir) throw new Error("missing tempDir");
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

function legacyRecord(id: string, title: string): string {
  return `---
id: "${id}"
title: "${title}"
date: "2026-01-02"
areas: ["legacy"]
files:
  - "src/legacy.ts"
---

# ${id}: ${title}

## Summary

Legacy summary.
`;
}
