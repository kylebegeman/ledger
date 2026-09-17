import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { searchLedgerCatalogCache, ftsMatchExpression } from "../src/catalogCache.js";
import { runLedgerSearchCommand } from "../src/commands/search.js";
import { readLedgerDocuments } from "../src/documents.js";
import {
  buildStaticReaderModel,
  checkRenderBudgets,
  chunkRecordDetails,
  chunkRelationshipGraph,
  shardSearchIndex,
  writeStaticReader,
} from "../src/render.js";
import { compactHtml, renderRecordDetails, renderStaticReaderHtml } from "../src/renderHtml.js";
import { searchLedgerIndex } from "../src/search.js";
import { scoreSearchFields, searchTermsFor } from "../src/searchCore.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("search terms", () => {
  it("derives terms from fields so serialized indexes can omit them without changing scores", () => {
    const fields = {
      id: "0001",
      title: "Retry policy",
      path: ".ledger/entries/0001.md",
      metadata: "change landed",
      files: "src/cli.ts",
      symbols: "run",
      docs: "",
      summary: "Adds retries.",
      context: "npm test",
    };
    const terms = searchTermsFor(fields);
    expect(terms).toContain("Retry policy");
    expect(scoreSearchFields({ fields }, "retry")).toEqual(scoreSearchFields({ fields, terms }, "retry"));
  });

  it("builds FTS5 match expressions from query tokens", () => {
    expect(ftsMatchExpression("Retry policy")).toBe('"retry"* OR "policy"*');
    expect(ftsMatchExpression("  ")).toBeUndefined();
    expect(ftsMatchExpression('a"b')).toBe('"a"* OR "b"*');
  });
});

describe("chunked reader artifacts", () => {
  it("shards the search index above the budget and keeps one file below it", () => {
    const documents = Array.from({ length: 40 }, (_, index) => ({ id: String(index), title: "x".repeat(200) }));
    const single = shardSearchIndex(documents, 1_000_000);
    expect(single.files.map((file) => file.href)).toEqual(["search-index.json"]);
    expect(single.manifest).toBeUndefined();

    const sharded = shardSearchIndex(documents, 2_000);
    expect(sharded.manifest?.documents).toBe(40);
    expect(sharded.files[0]?.href).toBe("search-index.json");
    expect(JSON.parse(sharded.files[0]!.content)).toEqual(sharded.manifest);
    const shards = sharded.files.slice(1);
    expect(shards.length).toBeGreaterThan(3);
    expect(shards.every((file) => Buffer.byteLength(file.content, "utf8") <= 2_000)).toBe(true);
    expect(shards.flatMap((file) => JSON.parse(file.content) as unknown[])).toHaveLength(40);
  });

  it("fills search shards up to the budget with nested, multi-line documents", () => {
    const documents = Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      fields: { title: `Record ${index}`, files: Array.from({ length: 12 }, (_, file) => `src/area-${index}/file-${file}.ts`) },
      terms: "word ".repeat(40),
    }));
    for (const maxBytes of [3_000, 5_000, 12_345]) {
      const shards = shardSearchIndex(documents, maxBytes).files.slice(1);
      const sizes = shards.map((file) => Buffer.byteLength(file.content, "utf8"));
      expect(sizes.every((size) => size <= maxBytes)).toBe(true);
      // Every shard but the last is full: even the largest document would not have fit.
      const largest = Math.max(...documents.map((document) => Buffer.byteLength(JSON.stringify(document), "utf8")));
      expect(sizes.slice(0, -1).every((size) => size + largest + 1 > maxBytes)).toBe(true);
      expect(shards.flatMap((file) => JSON.parse(file.content) as unknown[])).toHaveLength(60);
    }
  });

  it("splits contract nodes out of the record graph", () => {
    const chunks = chunkRelationshipGraph({
      nodes: [
        { id: "record:0001", label: "0001", type: "record" },
        { id: "invariant:0001:1", label: "x", type: "invariant" },
        { id: "verification:0001:1", label: "y", type: "verification" },
      ],
      edges: [
        { source: "record:0001", target: "record:D001", type: "decision" },
        { source: "record:0001", target: "invariant:0001:1", type: "invariant" },
      ],
    });
    expect(chunks.records.nodes.map((node) => node.id)).toEqual(["record:0001"]);
    expect(chunks.records.edges.map((edge) => edge.type)).toEqual(["decision"]);
    expect(chunks.contracts.nodes).toHaveLength(2);
    expect(chunks.contracts.edges.map((edge) => edge.type)).toEqual(["invariant"]);
  });

  it("writes shards and chunks, removes stale shards, and budgets the largest file", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-chunks-"));
    await initWorkspace(tempDir);
    for (let index = 1; index <= 12; index += 1) {
      await writeFile(path.join(tempDir, ".ledger", "entries", `${String(index).padStart(4, "0")}-entry.md`), entry(index));
    }
    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("maxSearchIndexBytes: 500000", "maxSearchIndexBytes: 3000"));
    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const model = buildStaticReaderModel(workspace, documents);
    const result = await writeStaticReader(workspace, model);

    const stub = JSON.parse(await readFile(path.join(tempDir, ".ledger", "dist", "search-index.json"), "utf8"));
    expect(stub.documents).toBe(12);
    expect(stub.shards.length).toBeGreaterThan(1);
    const search = result.artifacts.find((artifact) => artifact.kind === "search-index");
    expect(search?.files).toBe(stub.shards.length + 1);
    expect(search?.ok).toBe(true);
    expect(search?.largestBytes).toBeLessThanOrEqual(3000);
    expect(search?.bytes).toBeGreaterThan(search?.largestBytes ?? 0);
    const graph = result.artifacts.find((artifact) => artifact.kind === "graph");
    expect(graph?.files).toBe(2);
    const contracts = JSON.parse(await readFile(path.join(tempDir, ".ledger", "dist", "graph", "contracts.json"), "utf8"));
    expect(contracts.nodes.every((node: { type: string }) => node.type === "invariant" || node.type === "verification")).toBe(true);
    const records = JSON.parse(await readFile(path.join(tempDir, ".ledger", "dist", "graph.json"), "utf8"));
    expect(records.nodes.some((node: { type: string }) => node.type === "invariant")).toBe(false);

    const shardDirectory = path.join(tempDir, ".ledger", "dist", "search");
    await writeFile(path.join(shardDirectory, "099.json"), "[]\n");
    await writeStaticReader(workspace, model);
    expect((await readdir(shardDirectory)).sort()).toEqual([...stub.shards.map((href: string) => path.basename(href))].sort());

    const budget = await checkRenderBudgets(workspace);
    expect(budget.artifacts.find((artifact) => artifact.kind === "search-index")?.files).toBe(stub.shards.length + 1);
    const serialized = JSON.parse(await readFile(path.join(shardDirectory, "000.json"), "utf8")) as { terms?: string; fields: unknown }[];
    expect(serialized[0]?.terms).toBeUndefined();
    expect(serialized[0]?.fields).toBeDefined();
    expect(searchLedgerIndex(model.searchIndex, "entry").length).toBeGreaterThan(0);
  });
});

describe("detail chunks", () => {
  it("compacts indentation outside preformatted, script, and style blocks", () => {
    const html = "<div>\n    <span>a</span>\n    <pre>line\n    indented</pre>\n  <script>\n    const x = 1;\n  </script>\n</div>";
    expect(compactHtml(html)).toBe("<div>\n<span>a</span>\n<pre>line\n    indented</pre>\n<script>\n    const x = 1;\n  </script>\n</div>");
  });

  it("groups record details into chunks under the target size", () => {
    const details = new Map(Array.from({ length: 30 }, (_, index) => [String(index).padStart(4, "0"), "x".repeat(300)] as const));
    const chunked = chunkRecordDetails(details, 2_000);
    expect(chunked.files.length).toBeGreaterThan(3);
    expect(chunked.files.every((file) => Buffer.byteLength(file.content, "utf8") <= 2_000)).toBe(true);
    expect(chunked.hrefById.size).toBe(30);
    const merged = Object.assign({}, ...chunked.files.map((file) => JSON.parse(file.content) as Record<string, string>));
    expect(Object.keys(merged)).toHaveLength(30);
    expect(chunked.hrefById.get("0000")).toBe("details/000.json");
  });

  it("chunks details only when the page would exceed its budget and cleans up afterwards", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-details-"));
    await initWorkspace(tempDir);
    for (let index = 1; index <= 8; index += 1) {
      await writeFile(path.join(tempDir, ".ledger", "entries", `${String(index).padStart(4, "0")}-entry.md`), entry(index));
    }
    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    const original = await readFile(configPath, "utf8");
    const inlineWorkspace = await findWorkspace(tempDir);
    const inlineModel = buildStaticReaderModel(inlineWorkspace, await readLedgerDocuments(inlineWorkspace));
    const inlineHtml = renderStaticReaderHtml(inlineModel, {});
    expect(inlineHtml).toContain('<template class="entry-detail">');

    const budget = Buffer.byteLength(inlineHtml, "utf8") - 1_000;
    await writeFile(configPath, original.replace("maxHtmlBytes: 1000000", `maxHtmlBytes: ${budget}`));
    const workspace = await findWorkspace(tempDir);
    const model = buildStaticReaderModel(workspace, await readLedgerDocuments(workspace));
    const result = await writeStaticReader(workspace, model);
    const html = await readFile(path.join(tempDir, ".ledger", "dist", "index.html"), "utf8");
    expect(html).not.toContain('<template class="entry-detail">');
    expect(html).toContain('data-detail="details/000.json"');
    expect(html).toMatch(/data-source="sources\/0001-[a-f0-9]{16}\.md"/);
    expect(Buffer.byteLength(html, "utf8")).toBeLessThanOrEqual(budget);
    const chunk = JSON.parse(await readFile(path.join(tempDir, ".ledger", "dist", "details", "000.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(chunk)).toContain("0001");
    expect(chunk["0001"]).toBe(renderRecordDetails(model).get("0001"));
    const details = result.artifacts.find((artifact) => artifact.kind === "details");
    expect(details).toMatchObject({ files: 1, ok: true });
    expect(result.budget.artifacts.find((artifact) => artifact.kind === "html")?.ok).toBe(true);

    await writeFile(configPath, original);
    const relaxed = await findWorkspace(tempDir);
    const again = await writeStaticReader(relaxed, buildStaticReaderModel(relaxed, await readLedgerDocuments(relaxed)));
    expect(await readdir(path.join(tempDir, ".ledger", "dist", "details"))).toEqual([]);
    expect(again.artifacts.find((artifact) => artifact.kind === "details")).toMatchObject({ files: 0, ok: true });
    expect(await readFile(path.join(tempDir, ".ledger", "dist", "index.html"), "utf8")).toContain('<template class="entry-detail">');
  });
});

describe("sqlite full-text candidates", () => {
  it("returns FTS5 candidates from the sqlite cache and scores them like the scan", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-fts-"));
    await initWorkspace(tempDir);
    for (let index = 1; index <= 5; index += 1) {
      await writeFile(path.join(tempDir, ".ledger", "entries", `${String(index).padStart(4, "0")}-entry.md`), entry(index));
    }
    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    await writeFile(configPath, (await readFile(configPath, "utf8")).replace("backend: auto", "backend: sqlite"));
    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const candidates = await searchLedgerCatalogCache(workspace, "entry three", 10);
    if (!candidates) {
      // node:sqlite or FTS5 is unavailable on this runtime; full-text requests fall back to the scan.
      const fallback = await runLedgerSearchCommand(workspace, "entry three", { fullText: true });
      expect(fallback).toMatchObject({ candidates: "scan", fullTextUnavailable: true });
      return;
    }
    expect(candidates.backend).toBe("fts5");
    expect(candidates.paths).toContain(".ledger/entries/0003-entry.md");

    const fuzzy = await runLedgerSearchCommand(workspace, "entry three", { limit: 3 });
    expect(fuzzy.candidates).toBe("scan");
    const scan = searchLedgerIndex(buildStaticReaderModel(workspace, documents).searchIndex, "entry three", { limit: 3 });
    expect(fuzzy.matches.map((match) => match.id)).toEqual(scan.map((match) => match.id));

    const fullText = await runLedgerSearchCommand(workspace, "entry three", { limit: 3, fullText: true });
    expect(fullText.candidates).toBe("fts5");
    expect(fullText.matches[0]?.id).toBe("0003");
    const none = await runLedgerSearchCommand(workspace, "zzqqxx", { fullText: true });
    expect(none.matches).toEqual([]);
  });
});

const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function entry(index: number): string {
  const id = String(index).padStart(4, "0");
  const word = numberWords[index] ?? String(index);
  return [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    `title: "Entry ${word}"`,
    'date: "2026-09-16"',
    'updated: "2026-09-16"',
    'status: "landed"',
    'areas: ["cli"]',
    `files: ["src/${word}.ts"]`,
    "---",
    "",
    `# ${id}: Entry ${word}`,
    "",
    "## Summary",
    "",
    `Entry ${word} summary. ${"detail ".repeat(20)}`,
    "",
    "## Why",
    "",
    `Because ${word}.`,
    "",
    "## Changed Files",
    "",
    `### src/${word}.ts`,
    "",
    "- What changed: things.",
    "- On conflict: keep.",
    "",
    "## Behavior And UX Impact",
    "",
    "None.",
    "",
    "## Invariants",
    "",
    `- ${word} stays.`,
    "",
    "## Verification",
    "",
    "- npm test",
    "",
  ].join("\n");
}
