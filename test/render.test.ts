import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  buildStaticReaderModel,
  checkRenderBudgets,
  renderStaticReaderHtml,
  writeStaticReader,
} from "../src/render.js";
import {
  closeStaticReader,
  serveStaticReader,
  type LedgerServeResult,
} from "../src/serve.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

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

describe("buildStaticReaderModel", () => {
  it("normalizes documents and counts kinds", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Change"),
      document("D001", "decision", "Decision", "2026-06-20"),
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

  it("orders documents date-descending with a numeric-aware id tiebreak", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("v0.1.2", "release", "Second patch", "2026-05-10"),
      document("v0.1.10", "release", "Tenth patch", "2026-05-10"),
      document("0002", "change", "Newest change", "2026-07-01"),
      document("v0.1.12", "release", "Twelfth patch", "2026-06-01"),
    ]);

    expect(model.documents.map((entry) => entry.id)).toEqual([
      "0002",
      "v0.1.12",
      "v0.1.10",
      "v0.1.2",
    ]);
    expect(model.searchIndex.map((entry) => entry.id)).toEqual([
      "0002",
      "v0.1.12",
      "v0.1.10",
      "v0.1.2",
    ]);
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
  it("writes internal Markdown source links inside the served render root", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-source-test-"));
    const testWorkspace = workspace(tempDir);
    const sourceDocument = document("0001", "change", "Change");
    const model = buildStaticReaderModel(testWorkspace, [sourceDocument]);
    const sourceHref = model.documents[0]?.sourceHref;

    expect(sourceHref).toMatch(/^sources\/0001-[a-f0-9]{16}\.md$/);

    const result = await writeStaticReader(testWorkspace, model);
    const html = await readFile(path.join(tempDir, result.outputPath), "utf8");
    const sourcePath = path.join(tempDir, defaultConfig.render.output, sourceHref!);

    expect(html).toContain(`href="${sourceHref}"`);
    expect(html).toContain(`download="0001.md"`);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceDocument.raw);

    servedReader = await serveStaticReader(testWorkspace, { port: 0 });
    const response = await fetch(new URL(sourceHref!, servedReader.url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(sourceDocument.raw);
  });

  it("prunes only previously generated sources at the configured catalog limit", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-prune-test-"));
    const baseWorkspace = workspace(tempDir);
    const testWorkspace: LedgerWorkspace = {
      ...baseWorkspace,
      config: {
        ...baseWorkspace.config,
        limits: { ...baseWorkspace.config.limits, maxDocuments: 1 },
      },
    };
    const sourceDocument = document("0001", "change", "Change");
    const firstModel = buildStaticReaderModel(testWorkspace, [sourceDocument]);
    const firstHref = firstModel.documents[0]!.sourceHref;
    await writeStaticReader(testWorkspace, firstModel);

    const sourcesDirectory = path.join(tempDir, defaultConfig.render.output, "sources");
    const unrelatedPath = path.join(sourcesDirectory, "notes.md");
    await writeFile(unrelatedPath, "user-owned\n", "utf8");
    const movedDocument: ParsedLedgerDocument = {
      ...sourceDocument,
      absolutePath: path.join(tempDir, ".ledger/entries/moved/0001.md"),
      relativePath: ".ledger/entries/moved/0001.md",
    };
    const movedModel = buildStaticReaderModel(testWorkspace, [movedDocument]);
    const movedHref = movedModel.documents[0]!.sourceHref;

    expect(movedHref).not.toBe(firstHref);
    await writeStaticReader(testWorkspace, movedModel);
    await expect(
      readFile(path.join(tempDir, defaultConfig.render.output, firstHref), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await readFile(path.join(tempDir, defaultConfig.render.output, movedHref), "utf8"),
    ).toBe(sourceDocument.raw);
    expect(await readFile(unrelatedPath, "utf8")).toBe("user-owned\n");

    await writeStaticReader(testWorkspace, buildStaticReaderModel(testWorkspace, []));
    await expect(
      readFile(path.join(tempDir, defaultConfig.render.output, movedHref), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(unrelatedPath, "utf8")).toBe("user-owned\n");
  });

  it("does not overwrite an externally modified generated source", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-source-race-test-"));
    const testWorkspace = workspace(tempDir);
    const sourceDocument = document("0001", "change", "Change");
    const model = buildStaticReaderModel(testWorkspace, [sourceDocument]);
    await writeStaticReader(testWorkspace, model);
    const sourcePath = path.join(
      tempDir,
      defaultConfig.render.output,
      model.documents[0]!.sourceHref,
    );
    await writeFile(sourcePath, "external edit\n", "utf8");

    await expect(writeStaticReader(testWorkspace, model)).rejects.toThrow(
      `File changed after the operation was planned: ${path.posix.join(
        defaultConfig.render.output,
        model.documents[0]!.sourceHref,
      )}`,
    );
    expect(await readFile(sourcePath, "utf8")).toBe("external edit\n");
  });

  it("adopts a matching source when its ownership manifest is missing", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-source-adopt-test-"));
    const testWorkspace = workspace(tempDir);
    const sourceDocument = document("0001", "change", "Change");
    const model = buildStaticReaderModel(testWorkspace, [sourceDocument]);
    const sourcePath = path.join(
      tempDir,
      defaultConfig.render.output,
      model.documents[0]!.sourceHref,
    );
    const manifestPath = path.join(
      tempDir,
      defaultConfig.render.output,
      "sources/.ledger-manifest.json",
    );
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, sourceDocument.raw, "utf8");

    await writeStaticReader(testWorkspace, model);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceDocument.raw);
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      sources: [{ href: model.documents[0]!.sourceHref }],
    });

    await rm(manifestPath);
    await writeFile(sourcePath, "unexpected collision\n", "utf8");
    await expect(writeStaticReader(testWorkspace, model)).rejects.toThrow(
      "File changed after the operation was planned",
    );
    expect(await readFile(sourcePath, "utf8")).toBe("unexpected collision\n");
  });

  it("recreates a missing source that remains owned by the manifest", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-source-repair-test-"));
    const testWorkspace = workspace(tempDir);
    const sourceDocument = document("0001", "change", "Change");
    const model = buildStaticReaderModel(testWorkspace, [sourceDocument]);
    await writeStaticReader(testWorkspace, model);
    const sourcePath = path.join(
      tempDir,
      defaultConfig.render.output,
      model.documents[0]!.sourceHref,
    );
    await rm(sourcePath);

    await writeStaticReader(testWorkspace, model);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceDocument.raw);
  });

  it("writes artifact metrics and budget status", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-test-"));
    const testWorkspace = workspace(tempDir);
    const sourceDocument = document("0001", "change", "Change");
    const result = await writeStaticReader(
      testWorkspace,
      buildStaticReaderModel(testWorkspace, [sourceDocument]),
    );

    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "html",
      "search-index",
      "graph",
      "details",
      "sources",
    ]);
    expect(result.artifacts.find((artifact) => artifact.kind === "details")).toMatchObject({ files: 0, bytes: 0, ok: true });
    const sourceArtifact = result.artifacts.find((artifact) => artifact.kind === "sources")!;
    const nonSourceBytes = result.artifacts
      .filter((artifact) => artifact.kind !== "sources")
      .reduce((sum, artifact) => sum + artifact.bytes, 0);
    expect(sourceArtifact.bytes).toBeGreaterThanOrEqual(Buffer.byteLength(sourceDocument.raw, "utf8"));
    expect(sourceArtifact.maxBytes).toBe(defaultConfig.render.budgets.maxTotalBytes);
    expect(result.totalBytes).toBe(nonSourceBytes + sourceArtifact.bytes);
    expect(result.writeMs).toBeGreaterThanOrEqual(0);
    expect(result.budget.ok).toBe(true);

    const constrainedWorkspace: LedgerWorkspace = {
      ...testWorkspace,
      config: {
        ...testWorkspace.config,
        render: {
          ...testWorkspace.config.render,
          budgets: {
            ...testWorkspace.config.render.budgets,
            maxTotalBytes: result.totalBytes - 1,
          },
        },
      },
    };
    const constrained = await checkRenderBudgets(constrainedWorkspace);
    expect(nonSourceBytes).toBeLessThan(constrained.maxTotalBytes);
    expect(constrained.totalBytes).toBe(result.totalBytes);
    expect(constrained.ok).toBe(false);
  });

  it("writes public artifacts to an isolated directory", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-render-public-test-"));
    const testWorkspace = workspace(tempDir);
    const result = await writeStaticReader(
      testWorkspace,
      buildStaticReaderModel(
        testWorkspace,
        [
          publicReleaseDocument("v1.0.0", "released"),
          publicReleaseDocument("v0.9.0", "released", "2025-11-20"),
        ],
        { profile: "public" },
      ),
    );

    expect(result.profile).toBe("public");
    expect(result.outputPath).toBe(".ledger/dist/public/index.html");
    const html = await readFile(path.join(tempDir, result.outputPath), "utf8");
    expect(html).toContain("Safe public feature.");
    expect(html).toContain("What shipped, clearly.");
    expect(html).toContain("Search versions and release notes");
    expect(html).toContain('data-year="2026"');
    expect(html).toContain('data-year="2025"');
    expect(html.indexOf('id="record-v1-0-0"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="record-v1-0-0"')).toBeLessThan(html.indexOf('id="record-v0-9-0"'));
    expect(html.match(/class="entry release-entry year-start"/g)).toHaveLength(2);
    expect(html).toContain("No matching releases");
    expect(html).toContain("No releases yet");
    expect(html).not.toContain("No matching records");
    expect(html).toContain('class="version-badge"');
    expect(html).toContain('<use href="#i-check"');
    expect(html).toContain('id="per-page"');
    expect(html).toContain('aria-label="Pagination"');
    expect(html).not.toContain('data-density="compact"');
    expect(html).not.toContain('class="filter-bar"');
    expect(html).not.toContain('id="record-panel"');
    expect(html).not.toContain('class="entry-link"');
    expect(html).not.toContain('type="hidden"');
    expect(html).not.toContain('data-filter-field="kind"');
    expect(html).not.toContain("Markdown source");
    expect(html).not.toContain("src/private.ts");
    expect(html).not.toContain("Agent-ready context");
    expect(html).not.toContain("No files");
    expect(html).not.toContain("Missing refs");
    const searchIndex = JSON.parse(
      await readFile(path.join(tempDir, ".ledger/dist/public/search-index.json"), "utf8"),
    ) as readonly Record<string, unknown>[];
    expect(searchIndex.find((entry) => entry.id === "v1.0.0")).toMatchObject({
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
      for (const entry of searchIndex) {
        expect(entry).not.toHaveProperty(forbidden);
        expect(entry.fields).not.toHaveProperty(forbidden);
      }
    }
    expect((await readdir(path.join(tempDir, ".ledger/dist/public"))).sort()).toEqual([
      "graph.json",
      "index.html",
      "search-index.json",
    ]);
  });
});

describe("renderStaticReaderHtml", () => {
  it("renders Markdown code spans in record prose as escaped inline code", () => {
    const raw = `---
id: "0001"
kind: "change"
title: "Inline code"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols: []
commits: []
---

# 0001: Inline code

## Summary

Run \`ledger ready\` before landing; \`<img src=x onerror=alert(1)>\` stays text, and a stray \` stays literal.

## Invariants

- Retries stop after \`maxAttempts\` (5).
- Quote a command as \`\` \`ledger ready\` \`\` in a receipt.

## Verification

- \`npm test\`
`;
    const html = renderStaticReaderHtml(buildStaticReaderModel(workspace(), [parsedChange(raw)]));
    const summary =
      'Run <code class="inline-code">ledger ready</code> before landing; <code class="inline-code">&lt;img src=x onerror=alert(1)&gt;</code> stays text, and a stray ` stays literal.';
    expect(html.split(`<p class="entry-summary">${summary}</p>`)).toHaveLength(3);
    expect(html).toContain('<li>Retries stop after <code class="inline-code">maxAttempts</code> (5).</li>');
    expect(html).toContain('<li>Quote a command as <code class="inline-code">`ledger ready`</code> in a receipt.</li>');
    expect(html).toContain('<li><code class="inline-code">npm test</code></li>');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(".inline-code {");

    const release = publicReleaseDocument("v1.0.0", "released");
    const withCode = { ...release, raw: release.raw.replace("- Safe public feature.", "- Run `ledger ci --github` in pull requests.") };
    const reparsed = parseMarkdownWithFrontmatter(withCode.raw);
    const publicHtml = renderStaticReaderHtml(
      buildStaticReaderModel(workspace(), [{ ...withCode, body: reparsed.body, sections: reparsed.sections }], { profile: "public" }),
    );
    expect(publicHtml).toContain('<span>Run <code class="inline-code">ledger ci --github</code> in pull requests.</span>');
  });

  it("ends a shortened summary before a code span it cuts off", () => {
    const lead = "Receipts keep context. ".repeat(13);
    const raw = `---
id: "0001"
kind: "change"
title: "Long summary"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files: []
symbols: []
commits: []
---

# 0001: Long summary

## Summary

${lead}Run \`ledger ready --json\` before landing.
`;
    const html = renderStaticReaderHtml(buildStaticReaderModel(workspace(), [parsedChange(raw)]));
    expect(html.split(`<p class="entry-summary">${lead}Run...</p>`)).toHaveLength(3);
  });

  it("renders escaped source and embedded JSON data", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "change", "Escape <script>"),
    ]);
    const html = renderStaticReaderHtml(model, { iconSvg: "<svg><title>Ledger</title></svg>" });

    expect(html).toContain("Escape &lt;script&gt;");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain('"search-index.json"');
    expect(html).toContain("fuzzyScore");
    expect(html).toContain("scoreSearchDocument");
    expect(html).toContain("searchWeights");
    expect(html).toContain('role="combobox" aria-expanded="false"');
    expect(html).toContain("startViewTransition");
    expect(html).toContain("viewTransitionName");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain("writeUrlState");
    expect(html).toContain("<svg><title>Ledger</title></svg>");
    expect(html).toContain('<use href="#i-');
    expect(html.split('<symbol id="i-chevron"')).toHaveLength(2);
    expect(html).toContain("light-dark(");
    expect(html).toContain("--line:");
    expect(html).toContain("1px solid var(--line");
    expect(html).toContain("Agent-ready context");
    expect(html).toContain("Missing references");
    expect(html).toContain("Coverage");
    expect(html).toContain("Tag");
    expect(html).toContain('data-areas="[&quot;cli&quot;]"');
    expect(html).toContain('data-search="');
    expect(html).toContain("datasetList");
    expect(html).toContain("controlValue");
    expect(html).toContain("fallbackBlobs");
    expect(html).toContain("Top match");
    expect(html).toContain(".ledger/entries/0001.md");
    expect(html).toContain('<time class="record-date"');
    expect(html).toContain('datetime="2026-06-29"');
    expect(html).toContain('class="entry-link"');
    expect(html).toContain('href="?record=0001"');
    expect(html).toContain('<template class="entry-detail">');
    expect(html).toContain('id="record-panel"');
    expect(html).toContain("record-panel-title");
    expect(html).toContain("openPanel");
    expect(html).not.toContain("entry-details");
    expect(html).not.toContain("# 0001: Change");
    expect(html).toContain("<h4>Invariants</h4>");
    expect(html).toContain("<h4>Verification</h4>");
    expect(html).toContain('role="feed"');
    expect(html).toContain("aria-busy");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('id="active-filters"');
    expect(html).toContain('class="search-region"');
    expect(html).toContain('class="filter-bar"');
    expect(html).toContain('class="rail"');
    expect(html).toContain('id="per-page"');
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain("density-toggle");
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("renderPagination");
    expect(html).toContain("ledger-density");
    expect(html).toContain("currentPage");
    expect(html).not.toContain("filter-scrim");
    expect(html).not.toContain("sidebar-open");
    expect(html).toContain("Quick views");
    expect(html).toContain("facet-button");
    expect(html).toContain("Relationship graph");
    expect(html).toContain("graph.json");
    expect(html).toContain("score-label");
    expect(html).toContain("ranked match");
    expect(html).toContain("Decisions");
    expect(html).toContain('data-filter-value="decision"');
    expect(html).toContain("D001");
    expect(html).not.toContain("border-left");
    expect(html).not.toContain('<i aria-hidden="true"></i>');
    expect(html).not.toContain('focusable="false"');
    expect(html).not.toContain("--shadow-md");
    expect(html).toContain("markYearBreaks");
    expect(html).toContain(".release-feed .year-start::before");
    expect(html).toContain("content: attr(data-year)");
    expect(html).toContain('data-empty-variant="filtered"');
    expect(html).toContain("No records yet");
    expect(html).toContain("emptyState");
    expect(html).toContain('class="select-wrap"');
    expect(html).toContain("mask: url(");
    expect(html).toContain("#theme-toggle:hover");
    expect(html).not.toContain("%23838880");
    expect(html).not.toContain("@keyframes reveal");
    expect(html).not.toContain("panel-open");
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

function parsedChange(raw: string): ParsedLedgerDocument {
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: "/tmp/ledger/.ledger/entries/0001.md",
    relativePath: ".ledger/entries/0001.md",
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}

function publicReleaseDocument(
  id: string,
  status: "planned" | "released",
  date = "2026-06-29",
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "release"
title: "Ledger ${id}"
date: "${date}"
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
  date = "2026-06-29",
): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "${title}"
date: "${date}"
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
