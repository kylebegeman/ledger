import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { serveStaticReader } from "../src/serve.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;
let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("serveStaticReader", () => {
  it("serves files from the render output directory", async () => {
    const workspace = await fixtureWorkspace();
    const served = await serveStaticReader(workspace, { port: 0 });
    server = served.server;

    const response = await fetch(served.url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Ledger fixture");
  });

  it("rejects traversal, malformed paths, and directories", async () => {
    const workspace = await fixtureWorkspace();
    await writeFile(path.join(tempDir ?? "", "secret.txt"), "nope\n");
    const served = await serveStaticReader(workspace, { port: 0 });
    server = served.server;

    await expectStatus(`${served.url}%2e%2e/secret.txt`, 404);
    await expectStatus(`${served.url}%E0%A4%A`, 404);
    await expectStatus(`${served.url}nested`, 404);
  });
});

async function expectStatus(url: string | URL, status: number): Promise<void> {
  const response = await fetch(url);
  expect(response.status).toBe(status);
  await response.text();
}

async function fixtureWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-serve-test-"));
  const outputDirectory = path.join(tempDir, defaultConfig.render.output);
  await mkdir(path.join(outputDirectory, "nested"), { recursive: true });
  await writeFile(path.join(outputDirectory, "index.html"), "<h1>Ledger fixture</h1>\n");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath: path.join(tempDir, ".ledger", "config.yaml"),
    config: defaultConfig,
  };
}
