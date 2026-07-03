import { staticReaderRuntime, staticReaderStyles } from "./renderAssets.js";
import type {
  LedgerFacet,
  LedgerGraphEdge,
  LedgerGraphNode,
  LedgerRenderedDocument,
  LedgerStaticReaderModel,
} from "./render.js";
import type { LedgerIssue } from "./types.js";

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
      <input id="search" type="search" placeholder="Title, id, file, symbol, invariant">
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
      ${graphSummary(model)}
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
            <span class="pill score-pill" data-score-label hidden></span>
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

function graphSummary(model: LedgerStaticReaderModel): string {
  const nodeTypes = countTypes(model.graph.nodes);
  const edgeTypes = countTypes(model.graph.edges);
  const recordCount = nodeTypes.find((type) => type.value === "record")?.count ?? 0;
  return `<div class="facet-group graph-summary">
        <h2>Graph</h2>
        <div class="graph-metrics">
          ${miniStat("Nodes", model.graph.nodes.length)}
          ${miniStat("Edges", model.graph.edges.length)}
          ${miniStat("Records", recordCount)}
        </div>
        <a class="sidecar-link" href="graph.json">graph.json</a>
        ${typeList("Node Types", nodeTypes)}
        ${typeList("Edge Types", edgeTypes)}
      </div>`;
}

function miniStat(label: string, value: number): string {
  return `<div class="mini-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function typeList(label: string, values: readonly LedgerFacet[]): string {
  if (values.length === 0) return "";
  return `<div class="graph-list" aria-label="${escapeHtml(label)}">
          <strong>${escapeHtml(label)}</strong>
          ${values
            .slice(0, 6)
            .map((value) => `<div class="graph-row"><span>${escapeHtml(value.value)}</span><small>${value.count}</small></div>`)
            .join("")}
        </div>`;
}

function countTypes(values: readonly LedgerGraphNode[] | readonly LedgerGraphEdge[]): readonly LedgerFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value.type, (counts.get(value.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
