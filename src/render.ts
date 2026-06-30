import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { extractBullets, getSectionBody } from "./query.js";
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

export interface RenderStaticReaderResult {
  readonly outputPath: string;
  readonly documents: number;
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
  const outputDirectory = path.join(workspace.projectRoot, workspace.config.render.output);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "index.html");
  await writeFile(outputPath, renderStaticReaderHtml(model, { iconSvg: await readIconSvg() }), "utf8");
  return {
    outputPath: normalizeOutputPath(workspace, outputPath),
    documents: model.documents.length,
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
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --text: #172033;
      --muted: #5c667a;
      --line: #d9dfeb;
      --panel: #ffffff;
      --accent: #155e75;
      --accent-2: #7c2d12;
      --code: #101828;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 24px clamp(16px, 4vw, 40px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo {
      width: 56px;
      height: 56px;
      flex: 0 0 auto;
    }
    .logo svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    main {
      display: grid;
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
      gap: 24px;
      padding: 24px clamp(16px, 4vw, 40px) 40px;
    }
    h1, h2, h3 { margin: 0; line-height: 1.2; letter-spacing: 0; }
    h1 { font-size: clamp(1.8rem, 4vw, 3rem); }
    h2 { font-size: 1rem; margin-bottom: 12px; }
    h3 { font-size: 1.05rem; }
    p { margin: 0; }
    .subhead { color: var(--muted); margin-top: 8px; max-width: 780px; }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }
    .stat {
      min-width: 120px;
      border: 1px solid var(--line);
      background: #fbfcfe;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .stat strong { display: block; font-size: 1.3rem; }
    .stat span { color: var(--muted); font-size: .85rem; }
    .facet-group {
      border-top: 1px solid var(--line);
      margin-top: 16px;
      padding-top: 14px;
    }
    .facet-list {
      display: grid;
      gap: 6px;
    }
    .facet-button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      padding: 6px 8px;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .facet-button:hover { border-color: var(--accent); }
    .facet-button small { color: var(--muted); }
    aside {
      align-self: start;
      position: sticky;
      top: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }
    label { display: block; font-weight: 650; font-size: .82rem; margin: 14px 0 6px; }
    input, select {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 7px 9px;
      background: #fff;
      color: var(--text);
      font: inherit;
    }
    .entries { display: grid; gap: 14px; }
    .entry {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }
    .entry[hidden] { display: none; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 12px;
      color: var(--muted);
      font-size: .88rem;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 8px;
      background: #fbfcfe;
    }
    .summary {
      max-width: 760px;
      color: var(--text);
    }
    .context-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .context {
      border-left: 3px solid var(--accent);
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 6px;
    }
    .context strong {
      display: block;
      margin-bottom: 6px;
      font-size: .85rem;
      color: var(--muted);
    }
    .context ul { margin: 0; padding-left: 18px; }
    .paths, .source { margin-top: 12px; }
    .relationships { margin-top: 12px; }
    summary { cursor: pointer; color: var(--accent); font-weight: 650; }
    pre {
      overflow: auto;
      max-height: 420px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--code);
      color: #eef4ff;
      padding: 12px;
      font-size: .85rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 24px;
      background: var(--panel);
      color: var(--muted);
    }
    @media (max-width: 820px) {
      main { grid-template-columns: 1fr; }
      aside { position: static; }
      .context-grid { grid-template-columns: 1fr; }
      .brand { align-items: flex-start; }
    }
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
  <script id="ledger-data" type="application/json">${escapeScriptJson(model)}</script>
  <script>
    const controls = {
      search: document.getElementById("search"),
      kind: document.getElementById("kind"),
      warning: document.getElementById("warning"),
      missingRef: document.getElementById("missingRef"),
      duplicate: document.getElementById("duplicate"),
      coverage: document.getElementById("coverage"),
      status: document.getElementById("status"),
      area: document.getElementById("area"),
      release: document.getElementById("release"),
      tag: document.getElementById("tag")
    };
    const entries = Array.from(document.querySelectorAll(".entry"));
    const resultCount = document.getElementById("result-count");
    const empty = document.getElementById("empty");

    function matches(entry) {
      const search = controls.search.value.trim().toLowerCase();
      const kind = controls.kind.value;
      const status = controls.status.value;
      const area = controls.area.value;
      const release = controls.release.value;
      const warning = controls.warning.value;
      const missingRef = controls.missingRef.value;
      const duplicate = controls.duplicate.value;
      const coverage = controls.coverage.value;
      const tag = controls.tag.value;
      if (kind !== "all" && entry.dataset.kind !== kind) return false;
      if (status !== "all" && entry.dataset.status !== status) return false;
      if (area !== "all" && !entry.dataset.areas.split(" ").includes(area)) return false;
      if (release === "__none" && entry.dataset.release !== "") return false;
      if (release !== "all" && release !== "__none" && entry.dataset.release !== release) return false;
      if (warning === "with" && entry.dataset.warnings === "0") return false;
      if (warning === "without" && entry.dataset.warnings !== "0") return false;
      if (missingRef === "missing" && entry.dataset.missingRefs !== "true") return false;
      if (missingRef === "ok" && entry.dataset.missingRefs === "true") return false;
      if (duplicate === "duplicate" && entry.dataset.duplicateId !== "true") return false;
      if (duplicate === "unique" && entry.dataset.duplicateId === "true") return false;
      if (coverage !== "all" && entry.dataset.coverage !== coverage) return false;
      if (tag !== "all" && !entry.dataset.tags.split(" ").includes(tag)) return false;
      if (search && !entry.dataset.search.includes(search)) return false;
      return true;
    }

    function applyFilters() {
      let visible = 0;
      for (const entry of entries) {
        const show = matches(entry);
        entry.hidden = !show;
        if (show) visible += 1;
      }
      resultCount.textContent = visible + " document(s)";
      empty.hidden = visible !== 0;
    }

    for (const control of Object.values(controls)) {
      control.addEventListener("input", applyFilters);
    }
    for (const button of document.querySelectorAll("[data-filter-field]")) {
      button.addEventListener("click", () => {
        const field = button.dataset.filterField;
        const value = button.dataset.filterValue;
        if (!field || value === undefined || !controls[field]) return;
        controls[field].value = value;
        applyFilters();
      });
    }
  </script>
</body>
</html>
`;
}

function renderEntry(document: LedgerRenderedDocument): string {
  const searchText = [
    document.id,
    document.title,
    document.kind,
    document.status,
    document.release ?? "",
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
  ]
    .join(" ")
    .toLowerCase();
  return `<article class="entry" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-areas="${escapeHtml(document.areas.join(" "))}" data-tags="${escapeHtml(document.tags.join(" "))}" data-release="${escapeHtml(document.release ?? "")}" data-warnings="${document.warningCount}" data-errors="${document.errorCount}" data-missing-refs="${document.hasMissingRefs}" data-duplicate-id="${document.hasDuplicateId}" data-coverage="${document.coverageStatus}" data-search="${escapeHtml(searchText)}">
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
