import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatLedgerMetricsResult,
  formatLedgerPacketResult,
  formatLedgerQueryResult,
  formatLedgerSearchResult,
  runLedgerMetricsCommand,
  runLedgerPacketCommand,
  runLedgerQueryCommand,
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

  it("runs query without intercepting console output", async () => {
    const workspace = await fixtureWorkspace();
    await createChangeEntry(workspace, [], {
      title: "Queryable command result",
      fromDiff: false,
      staged: false,
      areas: ["cli"],
      status: "landed",
    });

    const result = await runLedgerQueryCommand(workspace, { area: "cli" });

    expect(result.matches.map((match) => match.title)).toEqual(["Queryable command result"]);
    expect(formatLedgerQueryResult(result)).toContain("Ledger query: 1 match(es).");
  });

  it("runs packet without intercepting console output", async () => {
    const workspace = await fixtureWorkspace();
    await mkdir(path.join(workspace.projectRoot, "src"), { recursive: true });
    await writeFile(path.join(workspace.projectRoot, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(
      path.join(workspace.projectRoot, ".ledger", "entries", "0001-packet.md"),
      packetEntry(),
    );

    const result = await runLedgerPacketCommand(workspace, "src/cli.ts", {
      budgetTokens: 1200,
    });

    expect(result.packet.entries).toHaveLength(1);
    expect(result.packet.entries[0]?.id).toBe("0001");
    expect(formatLedgerPacketResult(result)).toContain("# Ledger Agent Packet");
  });
});

async function fixtureWorkspace() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-commands-test-"));
  await initWorkspace(tempDir, { withDocs: true });
  return await findWorkspace(tempDir);
}

function packetEntry(): string {
  return `---
id: "0001"
kind: "change"
title: "Packet command result"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols:
  - "run"
commits: []
---

# 0001: Packet Command Result

## Summary

Adds packet command coverage.

## Why

Command result models need packet coverage.

## Changed Files

### src/cli.ts

- What changed: Test packet command.
- On conflict: Keep packet command behavior stable.

## Behavior And UX Impact

Agents can retrieve packet context.

## Invariants

- Packet command output stays stable.

## Verification

- npm test
`;
}
