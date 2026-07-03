import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatLedgerMetricsResult,
  formatLedgerSearchResult,
  runLedgerMetricsCommand,
  runLedgerSearchCommand,
} from "../src/commands/index.js";
import { createChangeEntry } from "../src/newEntry.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("command result models", () => {
  it("runs search without intercepting console output", async () => {
    const workspace = await fixtureWorkspace();
    await createChangeEntry(workspace, [], {
      title: "Reusable command result",
      fromDiff: false,
      staged: false,
      areas: ["cli"],
      status: "landed",
    });

    const result = await runLedgerSearchCommand(workspace, "reusable", { limit: 1 });

    expect(result.query).toBe("reusable");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.title).toBe("Reusable command result");
    expect(formatLedgerSearchResult(result)).toContain("Ledger search: 1 match(es).");
  });

  it("runs metrics without intercepting console output", async () => {
    const workspace = await fixtureWorkspace();
    const result = await runLedgerMetricsCommand(workspace);

    expect(result.performance.ok).toBe(true);
    expect(result.performance.steps.map((step) => step.name)).toContain("search");
    expect(formatLedgerMetricsResult(result)).toContain("Ledger metrics: passed");
  });
});

async function fixtureWorkspace() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-commands-test-"));
  await initWorkspace(tempDir, { withDocs: true });
  return await findWorkspace(tempDir);
}
