import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { connectLedgerClient, createLedgerClient } from "../src/client.js";
import { startLedgerEngine, type LedgerEngineResult } from "../src/engine.js";
import {
  buildOperationsContract,
  ledgerOperationTable,
  ledgerOperations,
  type LedgerOperationInput,
  type LedgerOperationName,
  type LedgerOperationOutput,
} from "../src/operations/registry.js";
import type { LedgerWorkspace } from "../src/types.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

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

describe("operation table", () => {
  it("keys every operation by its own name in help order", () => {
    for (const [name, operation] of Object.entries(ledgerOperationTable)) {
      expect(operation.name).toBe(name);
    }
    expect(ledgerOperations.map((operation) => operation.name)).toEqual(Object.keys(ledgerOperationTable));
    expect(buildOperationsContract().operations.map((operation) => operation.name)).toEqual(Object.keys(ledgerOperationTable));
  });

  it("derives client types from the registry", () => {
    expectTypeOf<LedgerOperationName>().toExtend<string>();
    expectTypeOf<LedgerOperationInput<"packet">>().toHaveProperty("path");
    expectTypeOf<LedgerOperationOutput<"doctor">>().toHaveProperty("checks");
    const client = createLedgerClient({ url: "http://127.0.0.1:1/" });
    // Never invoked: these lines exist so the compiler rejects bad calls.
    const rejected = () => {
      // @ts-expect-error unknown operation names do not typecheck
      void client.run("not-an-operation", {});
      // @ts-expect-error inputs are checked against the declared schema types
      void client.run("packet", { path: 42 });
    };
    expect(typeof rejected).toBe("function");
    expect(client.url).toBe("http://127.0.0.1:1/");
  });
});

describe("typed engine client", () => {
  it("runs operations, reads health and the contract, and reports failures as envelopes", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, version: "0.0.0-test", watch: false });
    const client = createLedgerClient({ url: engine.url });

    const doctor = await client.run("doctor", {});
    expect(doctor.status).toBe(200);
    expect(doctor.envelope.ok).toBe(true);
    if (doctor.envelope.ok) {
      expect(doctor.envelope.command).toBe("doctor");
      expect(doctor.envelope.data.checks.length).toBeGreaterThan(5);
    }

    const packet = await client.run("packet", { path: "src/engine.ts", budgetTokens: 800 });
    expect(packet.exitCode).toBe(0);
    if (packet.envelope.ok) {
      expect(packet.envelope.data.entries.map((entry) => entry.id)).toEqual(["0001"]);
      expect(packet.envelope.data.budgetTokens).toBe(800);
    }

    const invalid = await client.run("packet", { path: "" } as never);
    expect(invalid.status).toBe(400);
    expect(invalid.envelope.ok).toBe(false);
    if (!invalid.envelope.ok) expect(invalid.envelope.error.code).toBe("invalid-argument");
    expect(invalid.exitCode).toBe(2);

    const health = await client.health();
    expect(health).toMatchObject({ ok: true, pid: process.pid, projectRoot: workspace.projectRoot });
    const operations = await client.operations();
    expect(operations.map((operation) => operation.name)).toContain("packet");
    expect(operations.map((operation) => operation.name)).not.toContain("serve");

    const connected = await connectLedgerClient(workspace.projectRoot);
    expect(connected?.url).toBe(engine.url);
    expect(await connectLedgerClient(path.join(workspace.projectRoot, "src"))).toBeUndefined();
  }, 20_000);

  it("wraps transport failures as operational errors", async () => {
    const client = createLedgerClient({
      url: "http://127.0.0.1:9/",
      fetch: async () => {
        throw new Error("connection refused");
      },
    });
    await expect(client.run("doctor", {})).rejects.toThrow(/Ledger engine request failed/);
    const bad = createLedgerClient({
      url: "http://127.0.0.1:9/",
      fetch: async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    });
    await expect(bad.run("doctor", {})).rejects.toThrow(/non-JSON response/);
  });
});

async function fixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-client-")));
  await initWorkspace(tempDir);
  await writeFile(
    path.join(tempDir, ".ledger", "entries", "0001-client-fixture.md"),
    [
      "---",
      'id: "0001"',
      'kind: "change"',
      'title: "Client fixture"',
      'date: "2026-09-16"',
      'updated: "2026-09-16"',
      'status: "landed"',
      'areas: ["engine"]',
      "files:",
      '  - "src/engine.ts"',
      "commits: []",
      "---",
      "",
      "# 0001: Client Fixture",
      "",
      "## Summary",
      "",
      "Fixture.",
      "",
      "## Why",
      "",
      "Client tests need a record.",
      "",
      "## Changed Files",
      "",
      "### src/engine.ts",
      "",
      "- What changed: engine.",
      "- On conflict: keep routes.",
      "",
      "## Behavior And UX Impact",
      "",
      "None.",
      "",
      "## Invariants",
      "",
      "- Envelopes stay versioned.",
      "",
      "## Verification",
      "",
      "- npm test",
      "",
    ].join("\n"),
    "utf8",
  );
  return await findWorkspace(tempDir);
}
