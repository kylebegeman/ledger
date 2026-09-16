import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { probeEngine, readDaemonRecord } from "../src/daemon.js";
import { startLedgerEngine, type LedgerEngineResult } from "../src/engine.js";
import { delegateOperation, isDelegatable, noDaemonEnvironmentVariable } from "../src/operations/delegate.js";
import { findOperation } from "../src/operations/registry.js";
import { createChangeEntry } from "../src/newEntry.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;
let engine: LedgerEngineResult | undefined;
const savedNoDaemon = process.env[noDaemonEnvironmentVariable];

afterEach(async () => {
  if (savedNoDaemon === undefined) delete process.env[noDaemonEnvironmentVariable];
  else process.env[noDaemonEnvironmentVariable] = savedNoDaemon;
  if (engine) {
    await engine.close();
    engine = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("engine delegation", () => {
  it("classifies which operations may delegate", () => {
    expect(isDelegatable(findOperation("search")!)).toBe(true);
    expect(isDelegatable(findOperation("new")!)).toBe(true);
    expect(isDelegatable(findOperation("serve")!)).toBe(false);
    expect(isDelegatable(findOperation("mcp")!)).toBe(false);
    expect(isDelegatable(findOperation("init")!)).toBe(false);
    expect(isDelegatable(findOperation("agents")!)).toBe(false);
  });

  it("runs operations inside a live engine and falls back when none is running", async () => {
    const workspace = await fixtureWorkspace();
    const search = findOperation("search")!;

    expect(await delegateOperation(search, { query: "delegated" }, workspace.projectRoot)).toBeUndefined();

    engine = await startLedgerEngine(workspace, { port: 0, watch: false, version: "0.0.0-delegate" });
    const delegated = await delegateOperation(search, { query: "delegated" }, workspace.projectRoot);
    expect(delegated).toBeDefined();
    expect(delegated?.exitCode).toBe(0);
    expect(delegated?.envelope).toMatchObject({
      ok: true,
      command: "search",
      data: { matches: [expect.objectContaining({ id: "0001" })] },
    });

    const health = await probeEngine((await readDaemonRecord(workspace.ledgerRoot))!);
    expect(health?.operationsServed).toBe(1);

    const failing = await delegateOperation(findOperation("explain")!, {}, workspace.projectRoot);
    expect(failing?.exitCode).toBe(2);
    expect(failing?.envelope).toMatchObject({ ok: false, error: { code: "invalid-argument" } });

    expect(await delegateOperation(search, { query: "x" }, workspace.projectRoot, { local: true })).toBeUndefined();
    process.env[noDaemonEnvironmentVariable] = "1";
    expect(await delegateOperation(search, { query: "x" }, workspace.projectRoot)).toBeUndefined();
  });

  it("ignores stale daemon records", async () => {
    const workspace = await fixtureWorkspace();
    await writeFile(
      path.join(workspace.ledgerRoot, "daemon.json"),
      JSON.stringify({
        pid: 1,
        url: "http://127.0.0.1:1/",
        host: "127.0.0.1",
        port: 1,
        profile: "internal",
        version: "0.0.0",
        startedAt: new Date().toISOString(),
        apiVersion: 1,
      }),
      "utf8",
    );
    expect(await delegateOperation(findOperation("search")!, { query: "x" }, workspace.projectRoot)).toBeUndefined();

    const doctor = await captureRun(["doctor", "--json"], workspace.projectRoot);
    const payload = JSON.parse(doctor.stdout);
    const engineCheck = payload.data.checks.find((check: { name: string }) => check.name === "engine");
    expect(engineCheck).toMatchObject({ level: "warn", message: expect.stringContaining("stale daemon record") });
  });

  it("delegates CLI commands transparently and honors --local", async () => {
    const workspace = await fixtureWorkspace();
    engine = await startLedgerEngine(workspace, { port: 0, watch: false, version: "0.0.0-cli" });

    const viaEngine = await captureRun(["search", "delegated", "--json"], workspace.projectRoot);
    expect(viaEngine.exitCode).toBe(0);
    expect(JSON.parse(viaEngine.stdout)).toMatchObject({ ok: true, command: "search" });

    const human = await captureRun(["explain", "src/delegate.ts"], workspace.projectRoot);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Ledger records for src/delegate.ts:");

    const local = await captureRun(["search", "delegated", "--json", "--local"], workspace.projectRoot);
    expect(JSON.parse(local.stdout)).toMatchObject({ ok: true, command: "search" });

    const doctor = await captureRun(["doctor"], workspace.projectRoot);
    expect(doctor.stdout).toContain("engine (running at");

    const record = await readDaemonRecord(workspace.ledgerRoot);
    const health = await probeEngine(record!);
    expect(health?.operationsServed).toBe(3);
  });
});

async function fixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-delegation-"));
  await initWorkspace(tempDir);
  const workspace = await findWorkspace(tempDir);
  await createChangeEntry(workspace, [], {
    title: "Delegated fixture",
    fromDiff: false,
    staged: false,
    areas: ["engine"],
    status: "landed",
  });
  const entryPath = path.join(workspace.projectRoot, ".ledger", "entries", "0001-delegated-fixture.md");
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(entryPath, "utf8");
  await writeFile(entryPath, raw.replace("files: []", 'files:\n  - "src/delegate.ts"'), "utf8");
  return workspace;
}

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
