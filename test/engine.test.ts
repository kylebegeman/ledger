import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  ledgerExitCodeHeader,
  readDaemonRecord,
  startLedgerEngine,
  type LedgerEngineResult,
} from "../src/engine.js";
import { readLedgerDocuments } from "../src/documents.js";
import { createChangeEntry } from "../src/newEntry.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;
let engine: LedgerEngineResult | undefined;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("Ledger engine", () => {
  it("serves the reader, the API description, and health on one loopback server", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, version: "0.0.0-test", watch: false });

    const reader = await fetch(engine.url);
    expect(reader.status).toBe(200);
    expect(await reader.text()).toContain("Engine fixture");

    const description = await (await fetch(`${engine.url}api/v1`)).json();
    expect(description).toMatchObject({
      name: "ledger",
      apiVersion: 1,
      routes: { mcp: "/mcp", events: "/events" },
    });
    expect(description.operations.map((operation: { name: string }) => operation.name)).toContain("search");
    expect(description.operations.map((operation: { name: string }) => operation.name)).not.toContain("serve");
    expect(description.operations.map((operation: { name: string }) => operation.name)).not.toContain("init");

    const health = await (await fetch(`${engine.url}api/v1/health`)).json();
    expect(health).toMatchObject({ ok: true, pid: process.pid, version: "0.0.0-test", profile: "internal" });
    expect(health.render.documents).toBe(1);
    expect(health.cache.backend).toBe("json");

    const operations = await (await fetch(`${engine.url}api/v1/operations`)).json();
    expect(operations.operations.find((operation: { name: string }) => operation.name === "explain").input).toHaveProperty("properties");
  });

  it("runs operations over the API with the machine envelope and exit code header", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, watch: false });

    const search = await fetch(`${engine.url}api/v1/operations/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "engine", limit: 5 }),
    });
    expect(search.status).toBe(200);
    expect(search.headers.get(ledgerExitCodeHeader)).toBe("0");
    expect(await search.json()).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "search",
      data: { matches: [expect.objectContaining({ id: "0001" })] },
    });

    const validate = await fetch(`${engine.url}api/v1/operations/validate`, { method: "POST" });
    expect(validate.status).toBe(200);
    const validated = await validate.json();
    expect(validated).toMatchObject({ ok: true, command: "validate" });
    expect(validated.data.errors).toEqual([]);
    expect(validate.headers.get(ledgerExitCodeHeader)).toBe("0");

    const invalid = await fetch(`${engine.url}api/v1/operations/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get(ledgerExitCodeHeader)).toBe("2");
    expect(await invalid.json()).toMatchObject({ ok: false, error: { code: "invalid-argument" } });

    const notJson = await fetch(`${engine.url}api/v1/operations/explain`, {
      method: "POST",
      body: "{not json",
    });
    expect(notJson.status).toBe(400);

    const unknown = await fetch(`${engine.url}api/v1/operations/nope`, { method: "POST" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ ok: false, error: { code: "unknown-command" } });

    const wrongMethod = await fetch(`${engine.url}api/v1/operations/search`);
    expect(wrongMethod.status).toBe(405);

    const interactive = await fetch(`${engine.url}api/v1/operations/serve`, { method: "POST" });
    expect(interactive.status).toBe(404);
  });

  it("streams ready and broadcast events and writes the daemon record while running", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, version: "0.0.0-events", watch: false });

    const daemon = await readDaemonRecord(workspace);
    expect(daemon).toMatchObject({ pid: process.pid, url: engine.url, version: "0.0.0-events", apiVersion: 1 });
    expect(engine.daemonPath).toBe(".ledger/daemon.json");

    const controller = new AbortController();
    const response = await fetch(`${engine.url}events`, { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const readUntil = async (marker: string) => {
      while (!received.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
    };
    await readUntil("event: ready");
    expect(received).toContain('"version":"0.0.0-events"');
    engine.broadcast("rebuilt", { documents: 1 });
    await readUntil("event: rebuilt");
    expect(received).toContain('"documents":1');
    controller.abort();
    await reader.cancel().catch(() => undefined);

    await engine.close();
    engine = undefined;
    await expect(access(path.join(workspace.ledgerRoot, "daemon.json"))).rejects.toThrow();
  });

  it("speaks MCP over Streamable HTTP and publishes a server card", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, version: "0.0.0-mcp", watch: false });

    const card = await (await fetch(`${engine.url}.well-known/mcp/server-card.json`)).json();
    expect(card).toMatchObject({ name: "ledger", transport: { type: "streamable-http", url: "/mcp" } });
    expect(card.tools.map((tool: { name: string }) => tool.name)).toContain("ledger_explain");

    const client = new Client({ name: "ledger-test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${engine.url}mcp`));
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("ledger_search");

      const result = await client.callTool({ name: "ledger_explain", arguments: { path: "src/engine.ts" } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        ok: true,
        command: "ledger_explain",
        data: { summary: { matches: 1 } },
      });
    } finally {
      await client.close();
    }
  });

  it("rebuilds and broadcasts when watched records change", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, watch: true, log: () => undefined });

    const controller = new AbortController();
    const response = await fetch(`${engine.url}events`, { signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const readUntil = async (marker: string) => {
      const deadline = Date.now() + 8_000;
      while (!received.includes(marker) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
    };
    await readUntil("event: ready");

    await createChangeEntry(workspace, await readLedgerDocuments(workspace), {
      title: "Watched addition",
      fromDiff: false,
      staged: false,
      areas: ["engine"],
      status: "landed",
    });
    await readUntil("event: rebuilt");
    expect(received).toContain("event: rebuilt");
    expect(received).toContain("event: records-changed");
    expect(received).toContain('"documents":2');
    controller.abort();
    await reader.cancel().catch(() => undefined);

    const html = await readFile(path.join(workspace.projectRoot, ".ledger", "dist", "index.html"), "utf8");
    expect(html).toContain("Watched addition");
  }, 20_000);
});

async function fixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-engine-"));
  await initWorkspace(tempDir);
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-engine-fixture.md"),
    `---
id: "0001"
kind: "change"
title: "Engine fixture"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas: ["engine"]
files:
  - "src/engine.ts"
commits: []
---

# 0001: Engine Fixture

## Summary

Fixture for the engine tests.

## Why

The engine needs a record to serve.

## Changed Files

### src/engine.ts

- What changed: Added the engine.
- On conflict: Keep the API routes stable.

## Behavior And UX Impact

None.

## Invariants

- The API returns machine envelopes.

## Verification

- npm test
`,
    "utf8",
  );
  return findWorkspace(tempDir);
}
