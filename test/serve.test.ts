import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  closeStaticReader,
  serveStaticReader,
  type LedgerServeResult,
} from "../src/serve.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;
let servedReader: LedgerServeResult | undefined;

afterEach(async () => {
  if (servedReader) {
    await closeStaticReader(servedReader);
    servedReader = undefined;
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
    servedReader = served;

    const response = await fetch(served.url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain("Ledger fixture");

    const head = await fetch(served.url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    await expectStatus(served.url, 405, { method: "POST" });
  });

  it("rejects traversal, malformed paths, and directories", async () => {
    const workspace = await fixtureWorkspace();
    await writeFile(path.join(tempDir ?? "", "secret.txt"), "nope\n");
    await symlink(
      path.join(tempDir ?? "", "secret.txt"),
      path.join(tempDir ?? "", defaultConfig.render.output, "leak.txt"),
    );
    const served = await serveStaticReader(workspace, { port: 0 });
    servedReader = served;

    await expectStatus(`${served.url}%2e%2e/secret.txt`, 404);
    await expectStatus(`${served.url}%E0%A4%A`, 404);
    await expectStatus(`${served.url}nested`, 404);
    await expectStatus(`${served.url}leak.txt`, 404);
  });

  it("rejects non-loopback local binding and unauthenticated network exposure", async () => {
    const workspace = await fixtureWorkspace();

    await expect(
      serveStaticReader(workspace, { host: "0.0.0.0", port: 0 }),
    ).rejects.toThrow("Refusing non-loopback host");
    await expect(
      serveStaticReader(workspace, { mode: "network", host: "127.0.0.1", port: 0 }),
    ).rejects.toThrow("Network exposure requires an access token");
    await expect(
      serveStaticReader(workspace, { host: "127.999.1.1", port: 0 }),
    ).rejects.toThrow("Refusing non-loopback host");
    await expect(
      serveStaticReader(workspace, { port: 70_000 }),
    ).rejects.toThrow("Invalid server port");
  });

  it("requires a constant-time access token in network mode", async () => {
    const workspace = await fixtureWorkspace();
    const token = "a-secure-reader-token-123456";
    const served = await serveStaticReader(workspace, {
      mode: "network",
      host: "127.0.0.1",
      port: 0,
      accessToken: token,
    });
    servedReader = served;

    await expectStatus(served.url, 401);
    const authorized = await fetch(served.url, {
      headers: { authorization: `bearer ${token}` },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.text()).toContain("Ledger fixture");
  });

  it("serves the isolated public render profile", async () => {
    const workspace = await fixtureWorkspace();
    const publicDirectory = path.join(tempDir!, defaultConfig.render.output, "public");
    await mkdir(publicDirectory, { recursive: true });
    await writeFile(path.join(publicDirectory, "index.html"), "<h1>Public notes</h1>\n");
    const served = await serveStaticReader(workspace, { port: 0, profile: "public" });
    servedReader = served;

    const response = await fetch(served.url);

    expect(served.profile).toBe("public");
    expect(served.root).toBe(".ledger/dist/public");
    expect(await response.text()).toContain("Public notes");
  });
});

async function expectStatus(
  url: string | URL,
  status: number,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(url, init);
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
