import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearLedgerCatalogCache,
  inspectLedgerCatalogCache,
  nodeSupportsStableSqlite,
  readLedgerCatalog,
  resolveCatalogCacheBackend,
} from "../src/catalogCache.js";
import { readLedgerDocuments } from "../src/documents.js";
import { createChangeEntry } from "../src/newEntry.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("catalog cache", () => {
  it("parses on the first read and serves unchanged records from the cache afterwards", async () => {
    const workspace = await fixtureWorkspace("json");
    await createChangeEntry(workspace, [], entry("Cached fixture"));

    const cold = await readLedgerCatalog(workspace);
    expect(cold.cache).toMatchObject({ backend: "json", hits: 0, misses: 1, written: true });
    expect(cold.cache.cachePath).toMatch(/catalog\.json$/);

    const warm = await readLedgerCatalog(workspace);
    expect(warm.cache).toMatchObject({ backend: "json", hits: 1, misses: 0, written: false });
    expect(warm.documents).toEqual(cold.documents);
    expect(warm.documents[0]?.frontmatter.title).toBe("Cached fixture");
  });

  it("re-parses changed files, confirms touched files by hash, and drops removed files", async () => {
    const workspace = await fixtureWorkspace("json");
    const firstPath = await createChangeEntry(workspace, [], entry("First"));
    const secondPath = await createChangeEntry(workspace, await readLedgerDocuments(workspace), entry("Second"));
    await readLedgerCatalog(workspace);
    await settle();

    const first = path.join(workspace.projectRoot, firstPath);
    await writeFile(first, (await readFile(first, "utf8")).replace("First", "First edited"), "utf8");
    const second = path.join(workspace.projectRoot, secondPath);
    const touched = new Date(Date.now() + 5_000);
    await utimes(second, touched, touched);

    const changed = await readLedgerCatalog(workspace);
    expect(changed.cache).toMatchObject({ hits: 1, misses: 1, removed: 0, written: true });
    expect(changed.documents.map((document) => document.frontmatter.title)).toEqual([
      "First edited",
      "Second",
    ]);

    await rm(second);
    const removed = await readLedgerCatalog(workspace);
    expect(removed.cache).toMatchObject({ removed: 1, written: true });
    expect(removed.documents).toHaveLength(1);
    const afterRemoval = await readLedgerCatalog(workspace);
    expect(afterRemoval.cache).toMatchObject({ hits: 1, misses: 0, removed: 0 });
  });

  it("ignores caches written for another configuration or a corrupt file", async () => {
    const workspace = await fixtureWorkspace("json");
    await createChangeEntry(workspace, [], entry("Fingerprint fixture"));
    const initial = await readLedgerCatalog(workspace);
    const cachePath = path.join(workspace.projectRoot, initial.cache.cachePath ?? "");

    const altered: LedgerWorkspace = {
      ...workspace,
      config: { ...workspace.config, limits: { ...workspace.config.limits, maxDocuments: 5_000 } },
    };
    const mismatch = await readLedgerCatalog(altered);
    expect(mismatch.cache).toMatchObject({ hits: 0, misses: 1, written: true });

    await writeFile(cachePath, "{not json", "utf8");
    const corrupt = await readLedgerCatalog(workspace);
    expect(corrupt.cache).toMatchObject({ hits: 0, misses: 1, written: true });
    expect((await inspectLedgerCatalogCache(workspace)).current).toBe(true);
  });

  it("bypasses the cache on request and honors a disabled backend", async () => {
    const workspace = await fixtureWorkspace("json");
    await createChangeEntry(workspace, [], entry("Bypass fixture"));
    await readLedgerCatalog(workspace);

    const bypassed = await readLedgerCatalog(workspace, { cache: false });
    expect(bypassed.cache).toMatchObject({ backend: "none", hits: 0, misses: 1, note: "cache bypassed" });

    const disabled: LedgerWorkspace = {
      ...workspace,
      config: { ...workspace.config, cache: { ...workspace.config.cache, backend: "none" } },
    };
    const off = await readLedgerCatalog(disabled);
    expect(off.cache).toMatchObject({ backend: "none", note: "cache disabled by config" });
    expect(await inspectLedgerCatalogCache(disabled)).toMatchObject({ backend: "none", exists: false });
  });

  it("inspects and clears the cache", async () => {
    const workspace = await fixtureWorkspace("json");
    await createChangeEntry(workspace, [], entry("Inspect fixture"));
    const before = await inspectLedgerCatalogCache(workspace);
    expect(before).toMatchObject({ backend: "json", exists: false, entries: 0, current: false });

    await readLedgerCatalog(workspace);
    const after = await inspectLedgerCatalogCache(workspace);
    expect(after).toMatchObject({ backend: "json", exists: true, entries: 1, current: true });
    expect(after.bytes).toBeGreaterThan(0);
    expect(after.writtenAt).toMatch(/^\d{4}-/);

    const removed = await clearLedgerCatalogCache(workspace);
    expect(removed).toEqual([".ledger/cache/catalog.json"]);
    expect((await inspectLedgerCatalogCache(workspace)).exists).toBe(false);
    await expect(stat(path.join(workspace.projectRoot, ".ledger", "cache", "catalog.json"))).rejects.toThrow();
  });

  it("resolves the automatic backend from the Node version", async () => {
    expect(nodeSupportsStableSqlite("22.19.0")).toBe(false);
    expect(nodeSupportsStableSqlite("24.14.0")).toBe(false);
    expect(nodeSupportsStableSqlite("24.15.0")).toBe(true);
    expect(nodeSupportsStableSqlite("25.7.0")).toBe(true);
    expect(await resolveCatalogCacheBackend("none")).toBe("none");
    expect(await resolveCatalogCacheBackend("json")).toBe("json");
    expect(["json", "sqlite"]).toContain(await resolveCatalogCacheBackend("auto"));
  });

  it("keeps readLedgerDocuments as a cached facade", async () => {
    const workspace = await fixtureWorkspace("json");
    await createChangeEntry(workspace, [], entry("Facade fixture"));
    const documents = await readLedgerDocuments(workspace);
    expect(documents).toHaveLength(1);
    expect((await inspectLedgerCatalogCache(workspace)).entries).toBe(1);
    const bypassed = await readLedgerDocuments(workspace, { cache: false });
    expect(bypassed).toEqual(documents);
  });
});

const sqliteAvailable = await hasSqlite();

describe("sqlite catalog cache", () => {

  it.skipIf(!sqliteAvailable)("stores records in a sqlite file and serves them on warm reads", async () => {
    const workspace = await fixtureWorkspace("sqlite");
    await createChangeEntry(workspace, [], entry("Sqlite fixture"));

    const cold = await readLedgerCatalog(workspace);
    expect(cold.cache).toMatchObject({ backend: "sqlite", hits: 0, misses: 1, written: true });
    expect(cold.cache.cachePath).toMatch(/catalog\.sqlite$/);

    const warm = await readLedgerCatalog(workspace);
    expect(warm.cache).toMatchObject({ backend: "sqlite", hits: 1, misses: 0, written: false });
    expect(warm.documents).toEqual(cold.documents);

    const inspection = await inspectLedgerCatalogCache(workspace);
    expect(inspection).toMatchObject({ backend: "sqlite", exists: true, entries: 1, current: true });
    expect(await clearLedgerCatalogCache(workspace)).toContain(".ledger/cache/catalog.sqlite");
  });
});

async function hasSqlite(): Promise<boolean> {
  try {
    await import("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function entry(title: string) {
  return { title, fromDiff: false, staged: false, areas: ["cli"], status: "landed" };
}

async function fixtureWorkspace(backend: "json" | "sqlite"): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-catalog-cache-"));
  await initWorkspace(tempDir);
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  await writeFile(
    configPath,
    (await readFile(configPath, "utf8")).replace("backend: auto", `backend: ${backend}`),
    "utf8",
  );
  return findWorkspace(tempDir);
}
