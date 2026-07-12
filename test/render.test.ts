import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel, renderStaticReaderHtml, writeStaticReader } from "../src/render.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("buildStaticReaderModel", () => {
  it("normalizes documents and counts kinds", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Change"),
      document("D001", "decision", "Decision"),
    ]);

    expect(model.project).toBe("ledger-project");
    expect(model.profile).toBe("internal");
    expect(model.stats.documents).toBe(2);
    expect(model.stats.changes).toBe(1);
    expect(model.stats.decisions).toBe(1);
    expect(model.documents.map((entry) => entry.id)).toEqual(["0001", "D001"]);
    expect(model.documents[0]?.summary).toBe("Summary.");
    expect(model.documents[0]?.invariants).toEqual(["Keep this true."]);
    expect(model.documents[0]?.verification).toEqual(["npm test"]);
    expect(model.facets.kinds).toContainEqual({ value: "change", count: 1 });
    expect(model.facets.areas).toContainEqual({ value: "cli", count: 2 });
    expect(model.facets.releases).toContainEqual({ value: "v1.0.0", count: 2 });
    expect(model.searchIndex[0]).toMatchObject({
      id: "0001",
      title: "Change",
      fields: {
        path: ".ledger/entries/0001.md",
        files: "src/cli.ts",
      },
      terms: expect.stringContaining("src/cli.ts"),
    });
    expect(model.graph.nodes).toContainEqual({
      id: "file:src/cli.ts",
      label: "src/cli.ts",
      type: "file",
    });
    expect(model.graph.edges).toContainEqual({
      source: "record:0001",
      target: "file:src/cli.ts",
      type: "file",
    });
  });

  it("creates a fail-closed public release model", () => {
    const model = buildStaticReaderModel(
      workspace(),
      [
        document("0001", "change", "Internal implementation"),
        publicReleaseDocument("v1.0.0", "released"),
        publicReleaseDocument("v2.0.0", "planned"),
      ],
      { profile: "public" },
    );

    expect(model.profile).toBe("public");
    expect(model.documents).toHaveLength(1);
    expect(model.documents[0]).toMatchObject({
      id: "v1.0.0",
      title: "Ledger v1.0.0",
      source: "",
      sourceHref: "",
      path: "",
      publicNotes: ["Safe public feature."],
      files: [],
      symbols: [],
      issues: [],
    });
    expect(JSON.stringify(model)).not.toContain("src/private.ts");
    expect(JSON.stringify(model)).not.toContain("Internal release detail");
    expect(JSON.stringify(model)).not.toContain("Keep private behavior stable");
    expect(model.searchIndex[0]?.publicNotes).toEqual(["Safe public feature."]);
    expect(model.searchIndex[0]?.terms).toContain("Safe public feature.");
    expect(model.graph.edges).toEqual([]);
  });
});

describe("writeStaticReader", () => {
  it("writes artifact metrics and budget status", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-test-"));
    const testWorkspace = workspace(tempDir);
    const result = await writeStaticReader(
      testWorkspace,
      buildStaticReaderModel(testWorkspace, [document("0001", "change", "Change")]),
    );

    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "html",
      "search-index",
      "graph",
    ]);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.writeMs).toBeGreaterThanOrEqual(0);
    expect(result.budget.ok).toBe(true);
  });

  it("writes public artifacts to an isolated directory", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-public-test-"));
    const testWorkspace = workspace(tempDir);
    const result = await writeStaticReader(
      testWorkspace,
      buildStaticReaderModel(testWorkspace, [publicReleaseDocument("v1.0.0", "released")], {
        profile: "public",
      }),
    );

    expect(result.profile).toBe("public");
    expect(result.outputPath).toBe(".ledger/dist/public/index.html");
    const html = await readFile(path.join(tempDir, result.outputPath), "utf8");
    expect(html).toContain("Safe public feature.");
    expect(html).toContain("What changed");
    expect(html).toContain("Version or release note");
    expect(html).not.toContain("Markdown Source");
    expect(html).not.toContain("src/private.ts");
    expect(html).not.toContain("Agent Packet");
    expect(html).not.toContain("No files");
    expect(html).not.toContain("Missing refs");
    const searchIndex = JSON.parse(
      await readFile(path.join(tempDir, ".ledger/dist/public/search-index.json"), "utf8"),
    ) as readonly Record<string, unknown>[];
    expect(searchIndex[0]).toMatchObject({
      id: "v1.0.0",
      publicNotes: ["Safe public feature."],
    });
    for (const forbidden of [
      "path",
      "areas",
      "tags",
      "files",
      "symbols",
      "docs",
      "summary",
      "why",
      "release",
    ]) {
      expect(searchIndex[0]).not.toHaveProperty(forbidden);
      expect(searchIndex[0]?.fields).not.toHaveProperty(forbidden);
    }
  });
});

describe("renderStaticReaderHtml", () => {
  it("renders escaped source and embedded JSON data", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Escape <script>"),
    ]);
    const html = renderStaticReaderHtml(model, { iconSvg: "<svg><title>Ledger</title></svg>" });

    expect(html).toContain("Escape &lt;script&gt;");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain('fetch("search-index.json")');
    expect(html).toContain("fuzzyScore");
    expect(html).toContain("scoreSearchDocument");
    expect(html).toContain("searchWeights");
    expect(html).toContain("<svg><title>Ledger</title></svg>");
    expect(html).toContain("Markdown Source");
    expect(html).toContain("Agent Packet");
    expect(html).toContain("Missing refs");
    expect(html).toContain("Coverage");
    expect(html).toContain("Tag");
    expect(html).toContain('data-areas="[&quot;cli&quot;]"');
    expect(html).toContain("datasetList");
    expect(html).toContain('href="../entries/0001.md"');
    expect(html).toContain("Invariants");
    expect(html).toContain("Verification");
    expect(html).toContain("Browse");
    expect(html).toContain("facet-button");
    expect(html).toContain("Graph");
    expect(html).toContain("graph.json");
    expect(html).toContain("Node Types");
    expect(html).toContain("Edge Types");
    expect(html).toContain("score-pill");
    expect(html).toContain("ranked match(es)");
    expect(html).toContain("Decisions");
    expect(html).toContain("D001");
  });
});

function workspace(projectRoot = "/tmp/ledger"): LedgerWorkspace {
  return {
    projectRoot,
    ledgerRoot: `${projectRoot}/.ledger`,
    configPath: `${projectRoot}/.ledger/config.yaml`,
    config: defaultConfig,
  };
}

function publicReleaseDocument(
  id: string,
  status: "planned" | "released",
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "release"
title: "Ledger ${id}"
date: "2026-06-29"
status: "${status}"
areas: ["private-area"]
files:
  - "src/private.ts"
symbols:
  - "privateSymbol"
entries:
  - "0001"
---

# Ledger ${id}

## Summary

Internal release detail.

## Public Notes

- Safe public feature.

## Invariants

- Keep private behavior stable.
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger/.ledger/releases/${id}.md`,
    relativePath: `.ledger/releases/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "release",
  };
}

function document(
  id: string,
  kind: "change" | "backlog" | "decision" | "release",
  title: string,
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "${title}"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols: []
commits: []
release: "v1.0.0"
decisions:
  - "D001"
backlog:
  - "B001"
---

# ${id}: ${title}

## Summary

Summary.

## Invariants

- Keep this true.

## Verification

- npm test
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger/.ledger/entries/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}
