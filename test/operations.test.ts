import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { createLedgerMcpServer, listLedgerMcpTools, runLedgerMcpTool } from "../src/mcp.js";
import {
  buildOperationsContract,
  ledgerOperations,
  mcpInputSchema,
} from "../src/operations/registry.js";

const contractPath = path.join(process.cwd(), "test", "fixtures", "operations-contract.json");

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("operation registry", () => {
  it("has unique operation names, command paths, and MCP tool names", () => {
    const names = ledgerOperations.map((operation) => operation.name);
    const paths = ledgerOperations.flatMap((operation) =>
      [operation.cli.path, ...(operation.cli.aliases ?? [])].map((item) => item.join(" ")),
    );
    const tools = ledgerOperations.flatMap((operation) => (operation.mcp ? [operation.mcp.tool] : []));

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(tools).size).toBe(tools.length);
    expect(tools).toContain("ledger_validate");
    expect(tools).toContain("ledger_search");
    expect(tools).toContain("ledger_doctor");
  });

  it("keeps declared flags and usage lines in sync", () => {
    for (const operation of ledgerOperations) {
      const usage = operation.cli.usage;
      expect(usage.startsWith(`ledger ${operation.cli.path.join(" ")}`)).toBe(true);
      const usageFlags = new Set([...usage.matchAll(/--([a-z-]+)/g)].map((match) => match[1]));
      for (const flag of Object.keys(operation.cli.flags)) {
        expect(usageFlags, `${operation.name} usage should mention --${flag}`).toContain(flag);
      }
      for (const flag of usageFlags) {
        if (flag === "json") {
          expect(operation.cli.json, `${operation.name} usage mentions --json`).toBe(true);
          continue;
        }
        expect(operation.cli.flags, `${operation.name} declares --${flag}`).toHaveProperty(flag);
      }
      if (operation.cli.json) expect(usage).toContain("[--json]");
    }
  });

  it("maps every CLI flag to a field the input schema accepts", () => {
    for (const operation of ledgerOperations) {
      const shape = operation.input.shape;
      for (const [flag, spec] of Object.entries(operation.cli.flags)) {
        const field = spec.field ?? flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        expect(shape, `${operation.name} input accepts ${field}`).toHaveProperty(field);
      }
      if (operation.cli.positionals) {
        expect(shape).toHaveProperty(operation.cli.positionals.field);
      }
      for (const field of Object.keys(operation.cli.defaults ?? {})) {
        expect(shape).toHaveProperty(field);
      }
    }
  });

  it("builds strict MCP input schemas with a projectRoot", () => {
    for (const operation of ledgerOperations) {
      if (!operation.mcp) continue;
      const schema = mcpInputSchema(operation);
      expect(schema.shape).toHaveProperty("projectRoot");
      expect(schema.safeParse({ unexpectedField: true }).success).toBe(false);
    }
    expect(listLedgerMcpTools().map((tool) => tool.name)).toEqual(
      ledgerOperations.flatMap((operation) => (operation.mcp ? [operation.mcp.tool] : [])),
    );
    expect(createLedgerMcpServer({ version: "0.0.0-test" }).isConnected()).toBe(false);
  });

  it("matches the committed operations contract", async () => {
    const contract = buildOperationsContract();
    const serialized = `${JSON.stringify(contract, null, 2)}\n`;
    if (process.env.LEDGER_UPDATE_CONTRACT) {
      await writeFile(contractPath, serialized, "utf8");
    }
    const committed = (await readFile(contractPath, "utf8")).replace(/\r\n/g, "\n");
    expect(serialized).toBe(committed);
  });
});

describe("registry-driven CLI", () => {
  it("returns JSON envelopes for scaffolding, authoring, indexing, agents, and docs commands", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-operations-"));

    const init = await captureRun(["init", "--with-docs", "--json"], tempDir);
    expect(init.exitCode).toBe(0);
    expect(JSON.parse(init.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "init",
      data: { withDocs: true, adoption: "partial" },
    });

    const created = await captureRun(
      ["new", "Registry fixture", "--area", "cli", "--status", "landed", "--json"],
      tempDir,
    );
    expect(created.exitCode).toBe(0);
    expect(JSON.parse(created.stdout)).toMatchObject({
      command: "new",
      data: { path: expect.stringContaining("0001-registry-fixture.md") },
    });

    const feedback = await captureRun(["product-note", "Alias fixture", "--json"], tempDir);
    expect(feedback.exitCode).toBe(0);
    expect(JSON.parse(feedback.stdout)).toMatchObject({ command: "feedback" });

    const index = await captureRun(["index", "--json"], tempDir);
    expect(index.exitCode).toBe(0);
    expect(JSON.parse(index.stdout)).toMatchObject({
      command: "index",
      data: { documents: 2, written: true },
    });

    const agents = await captureRun(["agents", "--role", "release", "--json"], tempDir);
    expect(JSON.parse(agents.stdout)).toMatchObject({
      command: "agents",
      data: { role: "release", instructions: expect.stringContaining("ledger unreleased") },
    });

    const audit = await captureRun(["docs", "audit", "--json"], tempDir);
    expect(audit.exitCode).toBe(0);
    expect(JSON.parse(audit.stdout)).toMatchObject({
      command: "docs.audit",
      data: { files: expect.any(Array), reportPath: expect.stringContaining("docs-audit.md") },
    });

    const reconcile = await captureRun(["docs", "reconcile", "--json"], tempDir);
    expect(JSON.parse(reconcile.stdout)).toMatchObject({
      command: "docs.reconcile",
      data: { manifestPath: expect.stringContaining("manifest.json") },
    });

    const explain = await captureRun(["explain", "src/nothing.ts", "--json"], tempDir);
    expect(JSON.parse(explain.stdout)).toMatchObject({
      command: "explain",
      data: { target: "src/nothing.ts", matches: [], records: [], related: [], missing: [] },
    });
  });

  it("rejects unknown group subcommands and reports group usage", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-operations-"));
    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);

    const missing = await captureRun(["docs"], tempDir);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain("Usage: ledger docs <audit|check|classify|impact|reconcile|migrate>");

    const unknown = await captureRun(["docs", "bogus", "--json"], tempDir);
    expect(unknown.exitCode).toBe(2);
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      ok: false,
      command: "docs.bogus",
      error: { code: "invalid-argument", message: "Unknown docs command: bogus" },
    });

    const group = await captureRun(["help", "docs"], tempDir);
    expect(group.exitCode).toBe(0);
    expect(group.stdout).toContain("Ledger docs");
    expect(group.stdout).toContain("ledger docs impact");
  });
});

describe("registry-driven MCP", () => {
  it("returns structured content alongside the JSON text envelope", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-operations-"));
    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    expect((await captureRun(["new", "Structured fixture", "--status", "landed"], tempDir)).exitCode).toBe(0);

    const result = await runLedgerMcpTool("ledger_search", { projectRoot: tempDir, query: "structured" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "ledger_search",
      data: { summary: { matches: 1 }, matches: [expect.objectContaining({ id: "0001" })] },
    });

    const doctor = await runLedgerMcpTool("ledger_doctor", { projectRoot: tempDir });
    expect(doctor.structuredContent).toMatchObject({
      ok: true,
      data: { summary: { ok: expect.any(Boolean), checks: expect.any(Number) } },
    });

    const unknown = await runLedgerMcpTool("ledger_nope", {});
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent).toMatchObject({ ok: false, error: { code: "unknown-command" } });
  });
});

async function captureRun(argv: readonly string[], cwd: string): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };
  try {
    const exitCode = await run([...argv], { cwd });
    return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
