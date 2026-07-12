import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("Ledger document resource limits", () => {
  it("rejects oversized individual documents", async () => {
    const workspace = await limitedWorkspace({ maxDocumentBytes: 80 });
    await writeFile(
      path.join(workspace.projectRoot, ".ledger", "entries", "0001-large.md"),
      validEntry("0001", "x".repeat(100)),
      "utf8",
    );

    await expect(readLedgerDocuments(await findWorkspace(workspace.projectRoot)))
      .rejects.toThrow("document exceeds 80 bytes");
  });

  it("rejects catalogs over the document count limit", async () => {
    const workspace = await limitedWorkspace({ maxDocuments: 1 });
    await writeFile(path.join(workspace.projectRoot, ".ledger", "entries", "0001-one.md"), validEntry("0001"), "utf8");
    await writeFile(path.join(workspace.projectRoot, ".ledger", "entries", "0002-two.md"), validEntry("0002"), "utf8");

    await expect(readLedgerDocuments(await findWorkspace(workspace.projectRoot)))
      .rejects.toThrow("Ledger document limit exceeded (1)");
  });

  it("rejects source trees deeper than the configured limit", async () => {
    const workspace = await limitedWorkspace({ maxDirectoryDepth: 1 });
    const nested = path.join(workspace.projectRoot, ".ledger", "entries", "one", "two");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, "0001-deep.md"), validEntry("0001"), "utf8");

    await expect(readLedgerDocuments(await findWorkspace(workspace.projectRoot)))
      .rejects.toThrow("source nesting exceeds 1 directories");
  });
});

async function limitedWorkspace(
  limits: Partial<{ maxDocuments: number; maxDocumentBytes: number; maxTotalDocumentBytes: number; maxDirectoryDepth: number }>,
): Promise<{ readonly projectRoot: string }> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-limits-test-"));
  await initWorkspace(tempDir);
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  const block = [
    "limits:",
    `  maxDocuments: ${limits.maxDocuments ?? 10000}`,
    `  maxDocumentBytes: ${limits.maxDocumentBytes ?? 2000000}`,
    `  maxTotalDocumentBytes: ${limits.maxTotalDocumentBytes ?? 64000000}`,
    `  maxDirectoryDepth: ${limits.maxDirectoryDepth ?? 12}`,
    "",
  ].join("\n");
  const raw = await readFile(configPath, "utf8");
  await writeFile(configPath, raw.replace(/limits:\n(?:  .*\n){4}/, block), "utf8");
  return { projectRoot: tempDir };
}

function validEntry(id: string, extra = ""): string {
  return `---\nid: "${id}"\nkind: "change"\ntitle: "Fixture"\ndate: "2026-07-12"\nstatus: "landed"\nareas: ["test"]\n---\n\n## Summary\n\nFixture ${extra}\n`;
}
