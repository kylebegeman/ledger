import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { formatLedgerPerformance, measureLedgerPerformance } from "../src/performance.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("measureLedgerPerformance", () => {
  it("measures core pipeline steps against configured budgets", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-performance-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    const workspace = await findWorkspace(tempDir);
    const result = await measureLedgerPerformance(workspace);

    expect(result.ok).toBe(true);
    expect(result.documents).toBe((await readLedgerDocuments(workspace)).length);
    expect(result.steps.map((step) => step.name)).toEqual([
      "read",
      "validate",
      "index",
      "render-model",
      "search",
    ]);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(formatLedgerPerformance(result)).toContain("Ledger metrics: passed");
  });
});
