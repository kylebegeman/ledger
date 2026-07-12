import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { hostname } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyFileTransaction,
  hashFileContent,
  recoverInterruptedTransactions,
} from "../src/fileTransaction.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("file transactions", () => {
  it("creates and updates multiple files under one workspace lock", async () => {
    const workspace = await fixtureWorkspace();
    const existingPath = path.join(tempDir!, "docs", "existing.md");
    await mkdir(path.dirname(existingPath), { recursive: true });
    await writeFile(existingPath, "before\n", "utf8");

    const result = await applyFileTransaction(workspace, "test transaction", [
      {
        path: "docs/existing.md",
        content: "after\n",
        expectedHash: hashFileContent("before\n"),
      },
      { path: "docs/created.md", content: "created\n", expectedHash: null },
    ]);

    expect(result.changedPaths).toEqual(["docs/existing.md", "docs/created.md"]);
    expect(await readFile(existingPath, "utf8")).toBe("after\n");
    expect(await readFile(path.join(tempDir!, "docs", "created.md"), "utf8")).toBe("created\n");
    await expect(readFile(path.join(tempDir!, ".ledger", "write.lock"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails optimistic concurrency checks without overwriting the file", async () => {
    const workspace = await fixtureWorkspace();
    const filePath = path.join(tempDir!, "README.md");
    await writeFile(filePath, "newer editor content\n", "utf8");

    await expect(
      applyFileTransaction(workspace, "stale plan", [
        {
          path: "README.md",
          content: "planned content\n",
          expectedHash: hashFileContent("older content\n"),
        },
      ]),
    ).rejects.toThrow("File changed after the operation was planned: README.md");
    expect(await readFile(filePath, "utf8")).toBe("newer editor content\n");
  });

  it("does not steal an active workspace lock", async () => {
    const workspace = await fixtureWorkspace();
    await writeFile(
      path.join(tempDir!, ".ledger", "write.lock"),
      `${JSON.stringify({
        id: "active",
        pid: process.pid,
        hostname: hostname(),
        operation: "other write",
        createdAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    await expect(
      applyFileTransaction(workspace, "blocked write", [
        { path: "README.md", content: "blocked\n" },
      ]),
    ).rejects.toThrow("Ledger workspace is locked by other write");
  });

  it("rolls back an interrupted applying transaction from its journal", async () => {
    const workspace = await fixtureWorkspace();
    const id = "interrupted";
    const target = path.join(tempDir!, "README.md");
    const backup = `${target}.ledger-${id}.backup`;
    const stage = `${target}.ledger-${id}.stage`;
    await writeFile(target, "new\n", "utf8");
    await writeFile(backup, "old\n", "utf8");
    await writeFile(stage, "new\n", "utf8");
    const transactionDirectory = path.join(tempDir!, ".ledger", "transactions");
    await mkdir(transactionDirectory, { recursive: true });
    await writeFile(
      path.join(transactionDirectory, `${id}.json`),
      `${JSON.stringify({
        version: 1,
        id,
        operation: "interrupted test",
        phase: "applying",
        createdAt: new Date().toISOString(),
        changes: [
          {
            path: "README.md",
            originalHash: hashFileContent("old\n"),
            nextHash: hashFileContent("new\n"),
          },
        ],
      })}\n`,
      "utf8",
    );

    await recoverInterruptedTransactions(workspace);

    expect(await readFile(target, "utf8")).toBe("old\n");
    await expect(readFile(backup, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(stage, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function fixtureWorkspace() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-transaction-test-"));
  await initWorkspace(tempDir);
  return await findWorkspace(tempDir);
}
