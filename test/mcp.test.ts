import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLedgerMcpServer, runLedgerMcpTool } from "../src/mcp.js";
import { initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("Ledger MCP", () => {
  it("creates an MCP server", () => {
    const server = createLedgerMcpServer({ version: "0.0.0-test" });

    expect(server.isConnected()).toBe(false);
  });

  it("runs validation as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_validate", { projectRoot });

    expect(payload.errors).toEqual([]);
    expect(payload.warnings).toEqual([]);
    expect(payload.issueCount).toBe(0);
  });

  it("queries records as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_query", {
      projectRoot,
      area: "cli",
      text: "mcp",
    });

    expect(payload.total).toBe(1);
    expect(payload.matches[0]).toMatchObject({
      id: "0001",
      title: "MCP fixture",
    });
  });

  it("explains files as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_explain", {
      projectRoot,
      path: "src/cli.ts",
    });

    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0].id).toBe("0001");
  });

  it("returns conflict guidance as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_conflict", {
      projectRoot,
      paths: ["src/cli.ts"],
    });

    expect(payload.targets[0].entries[0].conflictRules).toEqual([
      "Keep MCP command behavior stable.",
    ]);
  });

  it("builds agent packets as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_packet", {
      projectRoot,
      path: "src/cli.ts",
    });

    expect(payload.target).toBe("src/cli.ts");
    expect(payload.entries[0].verification).toEqual(["npm run check"]);
  });

  it("checks docs impact as an MCP tool", async () => {
    const projectRoot = await createWorkspace();
    const payload = await callTool("ledger_docs_impact", {
      projectRoot,
      changedFiles: ["src/cli.ts"],
    });

    expect(payload.sourceFiles).toEqual(["src/cli.ts"]);
    expect(payload.missingDocsImpact).toEqual(["src/cli.ts"]);
  });
});

async function callTool(name: Parameters<typeof runLedgerMcpTool>[0], args: unknown) {
  const result = await runLedgerMcpTool(name, args);
  const [content] = result.content;
  if (!content || content.type !== "text") {
    throw new Error("Expected text MCP result");
  }
  return JSON.parse(content.text);
}

async function createWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-mcp-test-"));
  await initWorkspace(tempDir, { withDocs: true });
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
  await writeFile(
    path.join(tempDir, "docs", "README.md"),
    "# Test Docs\n",
    "utf8",
  );
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-mcp-fixture.md"),
    fixtureEntry(),
    "utf8",
  );
  return tempDir;
}

function fixtureEntry(): string {
  return `---
id: "0001"
kind: "change"
title: "MCP fixture"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols:
  - "run"
docs:
  - "docs/README.md"
commits: []
---

# 0001: MCP Fixture

## Summary

Adds a fixture entry for MCP tests.

## Why

The MCP tools need a complete Ledger entry to exercise query, explain, conflict,
and packet behavior.

## Changed Files

### src/cli.ts

- What changed: Test command behavior.
- Anchor: run
- On conflict: Keep MCP command behavior stable.

## Behavior And UX Impact

Agents can retrieve Ledger context through MCP.

## Invariants

- MCP responses remain JSON text payloads.

## Verification

- npm run check
`;
}
