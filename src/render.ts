import { mkdir, readFile, stat as statFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { extractBullets, getSectionBody } from "./query.js";
import { staticReaderRuntime, staticReaderStyles } from "./renderAssets.js";
import type {
  LedgerIssue,
  LedgerValidationResult,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export interface LedgerRenderedDocument extends NormalizedLedgerDocument {
  readonly source: string;
  readonly sourceHref: string;
  readonly summary?: string;
  readonly why?: string;
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
  readonly issues: readonly LedgerIssue[];
  readonly warningCount: number;
  readonly errorCount: number;
  readonly hasDuplicateId: boolean;
  readonly hasMissingRefs: boolean;
  readonly coverageStatus: "none" | "exact" | "pattern";
}

export interface LedgerStaticReaderModel {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly project: string;
  readonly documents: readonly LedgerRenderedDocument[];
  readonly searchIndex: readonly LedgerSearchDocument[];
  readonly graph: LedgerRelationshipGraph;
  readonly facets: {
    readonly areas: readonly LedgerFacet[];
    readonly releases: readonly LedgerFacet[];
    readonly statuses: readonly LedgerFacet[];
    readonly kinds: readonly LedgerFacet[];
    readonly tags: readonly LedgerFacet[];
  };
  readonly stats: {
    readonly documents: number;
    readonly changes: number;
    readonly backlog: number;
    readonly decisions: number;
    readonly releases: number;
    readonly productNotes: number;
    readonly feedback: number;
  };
}

export interface LedgerFacet {
  readonly value: string;
  readonly count: number;
}

export interface LedgerSearchDocument {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly kind: string;
  readonly status: string;
  readonly release?: string;
  readonly areas: readonly string[];
  readonly tags: readonly string[];
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly docs: readonly string[];
  readonly summary?: string;
  readonly why?: string;
  readonly fields: LedgerSearchFields;
  readonly terms: string;
}

export interface LedgerSearchFields {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly metadata: string;
  readonly files: string;
  readonly symbols: string;
  readonly docs: string;
  readonly summary: string;
  readonly context: string;
}

export interface LedgerRelationshipGraph {
  readonly nodes: readonly LedgerGraphNode[];
  readonly edges: readonly LedgerGraphEdge[];
}

export interface LedgerGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type:
    | "record"
    | "file"
    | "doc"
    | "symbol"
    | "area"
    | "release"
    | "invariant"
    | "verification";
}

export interface LedgerGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly type:
    | "file"
    | "doc"
    | "symbol"
    | "area"
    | "release"
    | "decision"
    | "backlog"
    | "related"
    | "invariant"
    | "verification";
}

export interface RenderStaticReaderResult {
  readonly outputPath: string;
  readonly searchIndexPath: string;
  readonly graphPath: string;
  readonly documents: number;
  readonly artifacts: readonly LedgerRenderArtifact[];
  readonly totalBytes: number;
  readonly writeMs: number;
  readonly budget: LedgerRenderBudgetResult;
}

export type LedgerRenderArtifactKind = "html" | "search-index" | "graph";

export interface LedgerRenderArtifact {
  readonly kind: LedgerRenderArtifactKind;
  readonly path: string;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly ok: boolean;
}

export interface LedgerRenderBudgetResult {
  readonly ok: boolean;
  readonly totalBytes: number;
  readonly maxTotalBytes: number;
  readonly writeMs: number;
  readonly maxWriteMs: number;
  readonly artifacts: readonly LedgerRenderArtifact[];
}

export function buildStaticReaderModel(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: { readonly validation?: LedgerValidationResult } = {},
): LedgerStaticReaderModel {
  const issuesByPath = groupIssuesByPath(options.validation?.issues ?? []);
  const renderedDocuments = documents
    .map((document) => {
      const normalized = normalizeDocument(document);
      const issues = issuesByPath.get(document.relativePath) ?? [];
      return {
        ...normalized,
        source: document.raw,
        sourceHref: sourceHref(workspace, document.relativePath),
        summary: compactSection(getSectionBody(document, "Summary")),
        why: compactSection(getSectionBody(document, "Why")),
        invariants: extractBullets(getSectionBody(document, "Invariants")),
        verification: extractBullets(getSectionBody(document, "Verification")),
        issues,
        warningCount: issues.filter((issue) => issue.level === "warning").length,
        errorCount: issues.filter((issue) => issue.level === "error").length,
        hasDuplicateId: issues.some((issue) => issue.code === "duplicate-id"),
        hasMissingRefs: issues.some((issue) => issue.code === "missing-reference"),
        coverageStatus: coverageStatus(normalized.files),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    documents: renderedDocuments,
    searchIndex: buildSearchIndex(renderedDocuments),
    graph: buildRelationshipGraph(renderedDocuments),
    facets: {
      areas: countFacet(renderedDocuments.flatMap((document) => document.areas)),
      releases: countFacet(
        renderedDocuments.map((document) => document.release ?? "__none"),
      ),
      statuses: countFacet(renderedDocuments.map((document) => document.status)),
      kinds: countFacet(renderedDocuments.map((document) => document.kind)),
      tags: countFacet(renderedDocuments.flatMap((document) => document.tags)),
    },
    stats: {
      documents: renderedDocuments.length,
      changes: renderedDocuments.filter((document) => document.kind === "change").length,
      backlog: renderedDocuments.filter((document) => document.kind === "backlog").length,
      decisions: renderedDocuments.filter((document) => document.kind === "decision").length,
      releases: renderedDocuments.filter((document) => document.kind === "release").length,
      productNotes: renderedDocuments.filter((document) => document.kind === "product-note").length,
      feedback: renderedDocuments.filter((document) => document.kind === "feedback").length,
    },
  };
}

export async function writeStaticReader(
  workspace: LedgerWorkspace,
  model: LedgerStaticReaderModel,
): Promise<RenderStaticReaderResult> {
  const startedAt = Date.now();
  const outputDirectory = path.join(workspace.projectRoot, workspace.config.render.output);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "index.html");
  const searchIndexPath = path.join(outputDirectory, "search-index.json");
  const graphPath = path.join(outputDirectory, "graph.json");
  const html = renderStaticReaderHtml(model, { iconSvg: await readIconSvg() });
  const searchIndex = `${JSON.stringify(model.searchIndex, null, 2)}\n`;
  const graph = `${JSON.stringify(model.graph, null, 2)}\n`;
  await writeFile(outputPath, html, "utf8");
  await writeFile(searchIndexPath, searchIndex, "utf8");
  await writeFile(graphPath, graph, "utf8");
  const writeMs = Date.now() - startedAt;
  const budget = await checkRenderBudgets(workspace, writeMs);
  return {
    outputPath: normalizeOutputPath(workspace, outputPath),
    searchIndexPath: normalizeOutputPath(workspace, searchIndexPath),
    graphPath: normalizeOutputPath(workspace, graphPath),
    documents: model.documents.length,
    artifacts: budget.artifacts,
    totalBytes: budget.totalBytes,
    writeMs,
    budget,
  };
}

export async function checkRenderBudgets(
  workspace: LedgerWorkspace,
  writeMs = 0,
): Promise<LedgerRenderBudgetResult> {
  const outputDirectory = path.join(workspace.projectRoot, workspace.config.render.output);
  const budgets = workspace.config.render.budgets;
  const artifacts = await Promise.all([
    renderArtifact(workspace, "html", path.join(outputDirectory, "index.html"), budgets.maxHtmlBytes),
    renderArtifact(
      workspace,
      "search-index",
      path.join(outputDirectory, "search-index.json"),
      budgets.maxSearchIndexBytes,
    ),
    renderArtifact(workspace, "graph", path.join(outputDirectory, "graph.json"), budgets.maxGraphBytes),
  ]);
  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  return {
    ok:
      artifacts.every((artifact) => artifact.ok) &&
      totalBytes <= budgets.maxTotalBytes &&
      writeMs <= budgets.maxWriteMs,
    totalBytes,
    maxTotalBytes: budgets.maxTotalBytes,
    writeMs,
    maxWriteMs: budgets.maxWriteMs,
    artifacts,
  };
}

export interface RenderStaticReaderHtmlOptions {
  readonly iconSvg?: string;
}

export function renderStaticReaderHtml(
  model: LedgerStaticReaderModel,
  options: RenderStaticReaderHtmlOptions = {},
): string {
  const areas = model.facets.areas.map((facet) => facet.value);
  const statuses = model.facets.statuses.map((facet) => facet.value);
  const releases = model.facets.releases
    .map((facet) => facet.value)
    .filter((value) => value !== "__none");
  const tags = model.facets.tags.map((facet) => facet.value);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(model.project)} Ledger</title>
  <style>
${staticReaderStyles}
  </style>
</head>
<body>
  <header>
    <div class="brand">
      ${options.iconSvg ? `<div class="logo" aria-hidden="true">${options.iconSvg}</div>` : ""}
      <div>
        <h1>${escapeHtml(model.project)} Ledger</h1>
        <p class="subhead">Generated ${escapeHtml(model.generatedAt)} from Ledger source Markdown.</p>
      </div>
    </div>
    <div class="stats">
      ${stat("Documents", model.stats.documents)}
      ${stat("Changes", model.stats.changes)}
      ${stat("Backlog", model.stats.backlog)}
      ${stat("Decisions", model.stats.decisions)}
      ${stat("Releases", model.stats.releases)}
      ${stat("Product Notes", model.stats.productNotes + model.stats.feedback)}
    </div>
  </header>
  <main>
    <aside aria-label="Filters">
      <h2>Filters</h2>
      <label for="search">Search</label>
      <input id="search" type="search" placeholder="Title, file, area, source">
      <label for="kind">Kind</label>
      <select id="kind">
        ${option("all", "All kinds")}
        ${option("change", "Changes")}
        ${option("backlog", "Backlog")}
        ${option("decision", "Decisions")}
        ${option("release", "Releases")}
        ${option("product-note", "Product notes")}
        ${option("feedback", "Feedback")}
      </select>
      <label for="warning">Warnings</label>
      <select id="warning">
        ${option("all", "All records")}
        ${option("with", "With warnings")}
        ${option("without", "Without warnings")}
      </select>
      <label for="missingRef">Missing refs</label>
      <select id="missingRef">
        ${option("all", "All refs")}
        ${option("missing", "Missing refs")}
        ${option("ok", "No missing refs")}
      </select>
      <label for="duplicate">Duplicate IDs</label>
      <select id="duplicate">
        ${option("all", "All IDs")}
        ${option("duplicate", "Duplicate IDs")}
        ${option("unique", "Unique IDs")}
      </select>
      <label for="coverage">Coverage</label>
      <select id="coverage">
        ${option("all", "All coverage")}
        ${option("exact", "Exact paths")}
        ${option("pattern", "Glob or prefix")}
        ${option("none", "No files")}
      </select>
      <label for="status">Status</label>
      <select id="status">
        ${option("all", "All statuses")}
        ${statuses.map((status) => option(status, status)).join("\n        ")}
      </select>
      <label for="area">Area</label>
      <select id="area">
        ${option("all", "All areas")}
        ${areas.map((area) => option(area, area)).join("\n        ")}
      </select>
      <label for="release">Release</label>
      <select id="release">
        ${option("all", "All releases")}
        ${option("__none", "No release")}
        ${releases.map((release) => option(release, release)).join("\n        ")}
      </select>
      <label for="tag">Tag</label>
      <select id="tag">
        ${option("all", "All tags")}
        ${tags.map((tag) => option(tag, tag)).join("\n        ")}
      </select>
      <div class="facet-group">
        <h2>Browse</h2>
        ${facetButtons("Kinds", "kind", model.facets.kinds)}
        ${facetButtons("Releases", "release", model.facets.releases)}
        ${facetButtons("Areas", "area", model.facets.areas)}
        ${facetButtons("Tags", "tag", model.facets.tags)}
      </div>
    </aside>
    <section>
      <h2 id="result-count">${model.documents.length} document(s)</h2>
      <div class="entries" id="entries">
        ${model.documents.map(renderEntry).join("\n        ")}
      </div>
      <p class="empty" id="empty" hidden>No Ledger records match the current filters.</p>
    </section>
  </main>
  <script>
${staticReaderRuntime}
  </script>
</body>
</html>
`;
}

function renderEntry(document: LedgerRenderedDocument): string {
  return `<article class="entry" data-id="${escapeHtml(document.id)}" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-areas="${escapeHtml(document.areas.join(" "))}" data-tags="${escapeHtml(document.tags.join(" "))}" data-release="${escapeHtml(document.release ?? "")}" data-warnings="${document.warningCount}" data-errors="${document.errorCount}" data-missing-refs="${document.hasMissingRefs}" data-duplicate-id="${document.hasDuplicateId}" data-coverage="${document.coverageStatus}" data-search="${escapeHtml(searchTerms(document).toLowerCase())}">
          <h3>${escapeHtml(document.id)}: ${escapeHtml(document.title)}</h3>
          <div class="meta">
            <span class="pill">${escapeHtml(document.kind)}</span>
            <span class="pill">${escapeHtml(document.status)}</span>
            <span class="pill">${escapeHtml(document.coverageStatus)} coverage</span>
            ${document.warningCount > 0 ? `<span class="pill">${document.warningCount} warning${document.warningCount === 1 ? "" : "s"}</span>` : ""}
            ${document.release ? `<span class="pill">${escapeHtml(document.release)}</span>` : ""}
            ${document.areas.map((area) => `<span class="pill">${escapeHtml(area)}</span>`).join("")}
            ${document.tags.map((tag) => `<span class="pill">#${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p><strong>Source:</strong> <a href="${escapeHtml(document.sourceHref)}">${escapeHtml(document.path)}</a></p>
          ${document.summary ? `<p class="summary">${escapeHtml(document.summary)}</p>` : ""}
          ${contextGrid(document)}
          ${issueList(document.issues)}
          ${detailList("Files", document.files)}
          ${detailList("Symbols", document.symbols)}
          ${detailList("Docs", document.docs)}
          ${relationships(document)}
          ${agentPacketDigest(document)}
          <details class="source">
            <summary>Markdown Source</summary>
            <pre>${escapeHtml(document.source)}</pre>
          </details>
        </article>`;
}

function issueList(issues: readonly LedgerIssue[]): string {
  if (issues.length === 0) return "";
  return `<details class="paths">
            <summary>Validation Issues (${issues.length})</summary>
            <ul>${issues.map((issue) => `<li>${escapeHtml(issue.level)}: ${escapeHtml(issue.message)}</li>`).join("")}</ul>
          </details>`;
}

function contextGrid(document: LedgerRenderedDocument): string {
  const sections = [
    contextBlock("Invariants", document.invariants),
    contextBlock("Verification", document.verification),
  ].filter((section) => section.length > 0);
  if (sections.length === 0) return "";
  return `<div class="context-grid">${sections.join("")}</div>`;
}

function contextBlock(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<div class="context"><strong>${escapeHtml(label)}</strong><ul>${values
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("")}</ul></div>`;
}

function detailList(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<details class="paths">
            <summary>${escapeHtml(label)} (${values.length})</summary>
            <ul>${values.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join("")}</ul>
          </details>`;
}

function relationships(document: LedgerRenderedDocument): string {
  const sections = [
    detailList("Decisions", document.decisions),
    detailList("Backlog", document.backlog),
    detailList("Supersedes", document.supersedes),
    detailList("Related", document.related),
  ].filter((section) => section.length > 0);
  if (sections.length === 0) return "";
  return `<div class="relationships">${sections.join("")}</div>`;
}

function agentPacketDigest(document: LedgerRenderedDocument): string {
  const target = document.files[0] ?? document.docs[0] ?? document.path;
  const lines = [
    `ledger packet ${target} --budget 1200`,
    "",
    `${document.id}: ${document.title}`,
    document.invariants.length > 0 ? `Invariants: ${document.invariants.slice(0, 3).join(" | ")}` : "",
    document.verification.length > 0 ? `Verification: ${document.verification.slice(0, 3).join(" | ")}` : "",
  ].filter((line) => line.length > 0);
  return `<details class="paths">
            <summary>Agent Packet</summary>
            <pre>${escapeHtml(lines.join("\n"))}</pre>
          </details>`;
}

function stat(label: string, value: number): string {
  return `<div class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function option(value: string, label: string): string {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function facetButtons(
  label: string,
  field: "kind" | "release" | "area" | "tag",
  facets: readonly LedgerFacet[],
): string {
  if (facets.length === 0) return "";
  return `<div class="facet-list" aria-label="${escapeHtml(label)}">${facets
    .slice(0, 8)
    .map((facet) =>
      `<button class="facet-button" type="button" data-filter-field="${field}" data-filter-value="${escapeHtml(facet.value)}"><span>${escapeHtml(facet.value === "__none" ? "No release" : facet.value)}</span><small>${facet.count}</small></button>`,
    )
    .join("")}</div>`;
}

export function buildSearchIndex(
  documents: readonly LedgerRenderedDocument[],
): readonly LedgerSearchDocument[] {
  return documents.map((document) => {
    const fields = searchFields(document);
    const terms = searchTerms(document);
    return {
      id: document.id,
      title: document.title,
      path: document.path,
      kind: document.kind,
      status: document.status,
      release: document.release,
      areas: document.areas,
      tags: document.tags,
      files: document.files,
      symbols: document.symbols,
      docs: document.docs,
      summary: document.summary,
      why: document.why,
      fields,
      terms,
    };
  });
}

function searchFields(document: LedgerRenderedDocument): LedgerSearchFields {
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    metadata: [
      document.kind,
      document.status,
      document.release ?? "",
      ...document.areas,
      ...document.tags,
      ...document.decisions,
      ...document.backlog,
      ...document.supersedes,
      ...document.related,
    ].join(" "),
    files: document.files.join(" "),
    symbols: document.symbols.join(" "),
    docs: document.docs.join(" "),
    summary: [document.summary ?? "", document.why ?? ""].join(" "),
    context: [
      ...document.invariants,
      ...document.verification,
      ...document.issues.map((issue) => issue.message),
    ].join(" "),
  };
}

function searchTerms(document: LedgerRenderedDocument): string {
  return [
    document.id,
    document.title,
    document.kind,
    document.status,
    document.release ?? "",
    document.path,
    ...document.areas,
    ...document.tags,
    ...document.files,
    ...document.symbols,
    ...document.docs,
    ...document.decisions,
    ...document.backlog,
    ...document.supersedes,
    ...document.related,
    document.summary ?? "",
    document.why ?? "",
    ...document.invariants,
    ...document.verification,
    ...document.issues.map((issue) => issue.message),
  ].join(" ");
}

export function buildRelationshipGraph(
  documents: readonly LedgerRenderedDocument[],
): LedgerRelationshipGraph {
  const nodes = new Map<string, LedgerGraphNode>();
  const edges: LedgerGraphEdge[] = [];

  const addNode = (node: LedgerGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (source: string, target: string, type: LedgerGraphEdge["type"]) => {
    edges.push({ source, target, type });
  };

  for (const document of documents) {
    const recordId = `record:${document.id}`;
    addNode({ id: recordId, label: document.id, type: "record" });
    for (const file of document.files) {
      const target = `file:${file}`;
      addNode({ id: target, label: file, type: "file" });
      addEdge(recordId, target, "file");
    }
    for (const doc of document.docs) {
      const target = `doc:${doc}`;
      addNode({ id: target, label: doc, type: "doc" });
      addEdge(recordId, target, "doc");
    }
    for (const symbol of document.symbols) {
      const target = `symbol:${symbol}`;
      addNode({ id: target, label: symbol, type: "symbol" });
      addEdge(recordId, target, "symbol");
    }
    for (const area of document.areas) {
      const target = `area:${area}`;
      addNode({ id: target, label: area, type: "area" });
      addEdge(recordId, target, "area");
    }
    document.invariants.forEach((invariant, index) => {
      const target = `invariant:${document.id}:${index + 1}`;
      addNode({ id: target, label: invariant, type: "invariant" });
      addEdge(recordId, target, "invariant");
    });
    document.verification.forEach((verification, index) => {
      const target = `verification:${document.id}:${index + 1}`;
      addNode({ id: target, label: verification, type: "verification" });
      addEdge(recordId, target, "verification");
    });
    if (document.release) {
      const target = `release:${document.release}`;
      addNode({ id: target, label: document.release, type: "release" });
      addEdge(recordId, target, "release");
    }
    for (const decision of document.decisions) addEdge(recordId, `record:${decision}`, "decision");
    for (const backlog of document.backlog) addEdge(recordId, `record:${backlog}`, "backlog");
    for (const related of document.related) addEdge(recordId, `record:${related}`, "related");
  }

  return {
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target) ||
      left.type.localeCompare(right.type),
    ),
  };
}

function groupIssuesByPath(issues: readonly LedgerIssue[]): ReadonlyMap<string, readonly LedgerIssue[]> {
  const grouped = new Map<string, LedgerIssue[]>();
  for (const issue of issues) {
    if (!issue.path) continue;
    grouped.set(issue.path, [...(grouped.get(issue.path) ?? []), issue]);
  }
  return grouped;
}

function coverageStatus(files: readonly string[]): "none" | "exact" | "pattern" {
  if (files.length === 0) return "none";
  return files.some(isCoveragePattern) ? "pattern" : "exact";
}

async function renderArtifact(
  workspace: LedgerWorkspace,
  kind: LedgerRenderArtifactKind,
  filePath: string,
  maxBytes: number,
): Promise<LedgerRenderArtifact> {
  let bytes = 0;
  try {
    bytes = (await statFile(filePath)).size;
  } catch {
    bytes = 0;
  }
  return {
    kind,
    path: normalizeOutputPath(workspace, filePath),
    bytes,
    maxBytes,
    ok: bytes > 0 && bytes <= maxBytes,
  };
}

function sourceHref(workspace: LedgerWorkspace, documentPath: string): string {
  return normalizePath(path.posix.relative(workspace.config.render.output, documentPath));
}

function countFacet(values: readonly string[]): readonly LedgerFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function compactSection(value: string | undefined): string | undefined {
  const compacted = value?.replace(/\s+/g, " ").trim();
  if (!compacted) return undefined;
  if (compacted.length <= 320) return compacted;
  return `${compacted.slice(0, 317).trimEnd()}...`;
}

function normalizeOutputPath(workspace: LedgerWorkspace, outputPath: string): string {
  return normalizePath(path.relative(workspace.projectRoot, outputPath));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function readIconSvg(): Promise<string | undefined> {
  try {
    return await readFile(new URL("../assets/ledger.svg", import.meta.url), "utf8");
  } catch {
    return undefined;
  }
}
