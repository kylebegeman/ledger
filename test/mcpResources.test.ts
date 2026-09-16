import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createLedgerMcpServer, ledgerMcpResourceUris } from "../src/mcp.js";
import { initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;
let client: Client | undefined;

afterEach(async () => {
  if (client) {
    await client.close();
    client = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("MCP resources and prompts", () => {
  it("lists records as resources and reads their Markdown", async () => {
    const projectRoot = await createWorkspace();
    client = await connect(projectRoot);

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toEqual(
      expect.arrayContaining([ledgerMcpResourceUris.record, ledgerMcpResourceUris.packet]),
    );

    const listed = await client.listResources();
    const record = listed.resources.find((resource) => resource.name === "0001");
    expect(record).toMatchObject({ uri: "ledger://records/0001", title: "Resource fixture", mimeType: "text/markdown" });
    expect(listed.resources.map((resource) => resource.uri)).toContain(ledgerMcpResourceUris.contract);

    const read = await client.readResource({ uri: "ledger://records/0001" });
    expect(read.contents[0]).toMatchObject({ uri: "ledger://records/0001", mimeType: "text/markdown" });
    expect(String(read.contents[0]?.text)).toContain("# 0001: Resource Fixture");

    await expect(client.readResource({ uri: "ledger://records/9999" })).rejects.toThrow(/Unknown Ledger record/);
  });

  it("serves packets and the contract as resources", async () => {
    const projectRoot = await createWorkspace();
    client = await connect(projectRoot);

    const packet = await client.readResource({ uri: `ledger://packet/${encodeURIComponent("src/resource.ts")}` });
    const text = String(packet.contents[0]?.text);
    expect(text).toContain("# Ledger Agent Packet");
    expect(text).toContain("Target: `src/resource.ts`");
    expect(text).toContain("## 0001: Resource fixture");

    const contract = await client.readResource({ uri: ledgerMcpResourceUris.contract });
    const parsed = JSON.parse(String(contract.contents[0]?.text));
    expect(parsed.contractVersion).toBe(1);
    expect(parsed.operations.map((operation: { name: string }) => operation.name)).toContain("explain");
  });

  it("offers instruction and handoff prompts", async () => {
    const projectRoot = await createWorkspace();
    client = await connect(projectRoot);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
      expect.arrayContaining(["ledger_agent_instructions", "ledger_handoff"]),
    );

    const instructions = await client.getPrompt({ name: "ledger_agent_instructions", arguments: { role: "reviewer" } });
    const instructionText = String(instructions.messages[0]?.content.type === "text" ? instructions.messages[0].content.text : "");
    expect(instructionText).toContain("# Ledger Workflow For Agents");
    expect(instructionText).toContain("ledger doctor");
    expect(instructionText).toContain(path.basename(projectRoot));

    const handoff = await client.getPrompt({ name: "ledger_handoff", arguments: { path: "src/resource.ts", budgetTokens: "800" } });
    const handoffText = String(handoff.messages[0]?.content.type === "text" ? handoff.messages[0].content.text : "");
    expect(handoffText).toContain("Before editing src/resource.ts");
    expect(handoffText).toContain("Budget: 800");
    expect(handoffText).toContain("Keep the resource contract.");
  });
});

async function connect(projectRoot: string): Promise<Client> {
  const server = createLedgerMcpServer({ cwd: projectRoot, version: "0.0.0-test" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: "ledger-resource-test", version: "0.0.0" });
  await mcpClient.connect(clientTransport);
  return mcpClient;
}

async function createWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-mcp-resources-"));
  await initWorkspace(tempDir);
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-resource-fixture.md"),
    `---
id: "0001"
kind: "change"
title: "Resource fixture"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas: ["mcp"]
files:
  - "src/resource.ts"
commits: []
---

# 0001: Resource Fixture

## Summary

Fixture for MCP resource tests.

## Why

Resources need a record to serve.

## Changed Files

### src/resource.ts

- What changed: Added the resource.
- On conflict: Keep the resource contract.

## Behavior And UX Impact

None.

## Invariants

- Resources return raw Markdown.

## Verification

- npm test
`,
    "utf8",
  );
  return tempDir;
}
