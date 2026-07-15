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
  const isPublic = model.profile === "public";
  const documents = isPublic
    ? [...model.documents].sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id, undefined, { numeric: true }),
      )
    : model.documents;

  return `<!doctype html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(model.project)} Ledger</title>
  <script>try{const t=localStorage.getItem("ledger-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}</script>
  <style>
${staticReaderStyles}
  </style>
</head>
<body data-profile="${model.profile}">
  ${iconSprite()}
  <a class="skip-link" href="#library">Skip to records</a>
  <div class="app-shell" id="top">
    <header class="topbar">
      <a class="identity" href="#top" aria-label="${escapeHtml(model.project)} Ledger home">
        ${options.iconSvg ? `<span class="logo" aria-hidden="true">${options.iconSvg}</span>` : `<span class="logo-fallback" aria-hidden="true">L</span>`}
        <span class="identity-copy">
          <small>Ledger</small>
          <strong>${escapeHtml(model.project)}</strong>
        </span>
      </a>
      <button class="command-trigger" id="search-trigger" type="button" aria-haspopup="dialog" aria-controls="command-palette">
        ${icon("search")}
        <span>Search ${isPublic ? "release notes" : "project memory"}</span>
        <kbd>⌘ K</kbd>
      </button>
      <div class="topbar-actions">
        <span class="profile-badge">${isPublic ? "Public notes" : "Internal"}</span>
        <button class="icon-button" id="theme-toggle" type="button" aria-label="Switch color theme" title="Switch color theme">
          ${icon("theme-light", 'data-theme-icon="light"')}${icon("theme-dark", 'data-theme-icon="dark"')}
        </button>
      </div>
    </header>

    <main>
      <section class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">${isPublic ? "Release archive" : "Project intelligence"}</p>
          <h1 id="page-title">${isPublic ? "What shipped, clearly." : "Find the context behind every change."}</h1>
          <p class="hero-description">${isPublic
            ? `A clean history of released work in ${escapeHtml(model.project)}, written for the people who use it.`
            : `Search ${escapeHtml(model.project)} decisions, changes, verification, and operating knowledge without digging through the repository.`}</p>
        </div>
        <div class="metric-strip" aria-label="Ledger summary">
          ${isPublic
            ? metric("Releases", model.stats.releases)
            : [
                metricButton("Records", model.stats.documents, "data-reset-filters"),
                metricButton("Changes", model.stats.changes, 'data-filter-field="kind" data-filter-value="change" aria-pressed="false"'),
                metricButton("Decisions", model.stats.decisions, 'data-filter-field="kind" data-filter-value="decision" aria-pressed="false"'),
                metricButton("Backlog", model.stats.backlog, 'data-filter-field="kind" data-filter-value="backlog" aria-pressed="false"'),
              ].join("")}
        </div>
      </section>

      <section class="search-region" aria-label="Search and filters">
        <div class="search-dock">
          ${icon("search")}
          <label class="sr-only" for="search">Search Ledger</label>
          <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="${isPublic ? "Search versions and release notes" : "Search titles, files, symbols, decisions, or invariants"}">
          <button class="search-clear" id="search-clear" type="button" aria-label="Clear search" hidden>Clear</button>
          <kbd>/</kbd>
        </div>
        ${isPublic ? "" : filterBar(statuses, areas, releases, tags)}
        <p class="sr-only" id="filter-status" role="status"></p>
      </section>

      <div class="workspace${isPublic ? " workspace-public" : ""}">
        <section class="library" id="library" aria-labelledby="result-count">
          <div class="library-toolbar">
            <div>
              <p class="eyebrow">${isPublic ? "Changelog" : "Knowledge library"}</p>
              <h2 id="result-count" data-result-noun="${isPublic ? "release" : "record"}">${model.documents.length} ${isPublic ? "releases" : "records"}</h2>
            </div>
            <div class="view-controls">
              ${isPublic ? "" : densityToggle()}
              ${perPageControl()}
            </div>
          </div>
          <div class="entries${isPublic ? " release-feed" : ""}" id="entries" role="feed" aria-busy="false">
            ${documents
              .map((document, index) =>
                renderEntry(
                  document,
                  model.profile,
                  index === 0 || documents[index - 1].date.slice(0, 4) !== document.date.slice(0, 4),
                ),
              )
              .join("\n            ")}
          </div>
          <nav class="pagination" id="pagination" aria-label="Pagination" hidden></nav>
          <div class="empty" id="empty" hidden>
            <span class="empty-icon" aria-hidden="true">${icon("search")}</span>
            <div data-empty-variant="filtered">
              <h3>No matching ${isPublic ? "releases" : "records"}</h3>
              <p>Try a broader phrase or reset the active filters.</p>
            </div>
            <div data-empty-variant="bare">
              <h3>${isPublic ? "No releases yet" : "No records yet"}</h3>
              <p>${isPublic ? "Published release notes will appear here." : "Recorded changes, decisions, and backlog items will appear here."}</p>
            </div>
            <button type="button" data-reset-filters>Reset filters</button>
          </div>
        </section>
        ${isPublic ? "" : internalRail(model)}
      </div>
    </main>

    <footer>
      <span>${escapeHtml(model.project)} Ledger</span>
      <span>Generated ${escapeHtml(formatGeneratedAt(model.generatedAt))}</span>
    </footer>
  </div>

  ${isPublic ? "" : recordPanel()}
  ${searchDialog(isPublic)}
  <script>
${staticReaderRuntime}
  </script>
</body>
</html>
`;
}

function internalRail(model: LedgerStaticReaderModel): string {
  return `<aside class="rail" aria-label="Browse">
          <div class="browse-section">
            <p class="filter-label">Quick views</p>
            ${facetButtons("Kinds", "kind", model.facets.kinds)}
            ${facetButtons("Areas", "area", model.facets.areas)}
            ${facetButtons("Releases", "release", model.facets.releases)}
          </div>
          ${graphSummary(model)}
        </aside>`;
}

function renderEntry(
  document: LedgerRenderedDocument,
  profile: LedgerStaticReaderModel["profile"],
  yearStart: boolean,
): string {
  if (profile === "public") return renderPublicEntry(document, yearStart);
  const recordId = domId(document.id);
  const updatedDate = document.updated && document.updated !== document.date ? document.updated : "";
  return `<article class="entry" id="record-${recordId}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-areas="${escapeHtml(JSON.stringify(document.areas))}" data-tags="${escapeHtml(JSON.stringify(document.tags))}" data-release="${escapeHtml(document.release ?? "")}" data-warnings="${document.warningCount}" data-errors="${document.errorCount}" data-missing-refs="${document.hasMissingRefs}" data-duplicate-id="${document.hasDuplicateId}" data-coverage="${document.coverageStatus}" data-search="${escapeHtml(searchTerms(document))}">
              <div class="entry-row">
                <div class="record-type" data-kind-tone="${escapeHtml(document.kind)}">${kindIcon(document.kind)}<span>${escapeHtml(labelForKind(document.kind))}</span></div>
                <span class="record-id">${escapeHtml(document.id)}</span>
                <h3 class="entry-title"><a class="entry-link" href="?record=${escapeHtml(encodeURIComponent(document.id))}">${escapeHtml(document.title)}</a></h3>
                <span class="score-label" data-score-label hidden></span>
                <span class="status-dot" data-status-tone="${escapeHtml(document.status)}">${escapeHtml(document.status)}</span>
                ${document.date ? `<time class="record-date" datetime="${escapeHtml(updatedDate || document.date)}"${updatedDate ? ` title="Created ${escapeHtml(formatDate(document.date))}"` : ""}>${escapeHtml(formatDate(updatedDate || document.date))}</time>` : ""}
              </div>
              ${document.summary ? `<p class="entry-summary">${escapeHtml(document.summary)}</p>` : ""}
              <div class="entry-tags">
                ${document.release ? tag(document.release) : ""}
                ${document.areas.slice(0, 4).map((value) => tag(value)).join("")}
                ${document.tags.slice(0, 3).map((value) => tag(`#${value}`)).join("")}
                ${document.warningCount > 0 ? tag(`${document.warningCount} warning${document.warningCount === 1 ? "" : "s"}`, "warning") : ""}
                ${document.errorCount > 0 ? tag(`${document.errorCount} error${document.errorCount === 1 ? "" : "s"}`, "danger") : ""}
              </div>
              <template class="entry-detail">${recordDetail(document, updatedDate)}</template>
            </article>`;
}

function recordDetail(document: LedgerRenderedDocument, updatedDate: string): string {
  return `<div class="record-panel-meta">
                <div class="record-type" data-kind-tone="${escapeHtml(document.kind)}">${kindIcon(document.kind)}<span>${escapeHtml(labelForKind(document.kind))}</span></div>
                <span class="record-id">${escapeHtml(document.id)}</span>
                <span class="status-dot" data-status-tone="${escapeHtml(document.status)}">${escapeHtml(document.status)}</span>
                ${document.date ? `<time class="record-date" datetime="${escapeHtml(updatedDate || document.date)}">${escapeHtml(formatDate(updatedDate || document.date))}</time>` : ""}
              </div>
              <h2 class="record-panel-title">${escapeHtml(document.title)}</h2>
              ${document.summary ? `<p class="entry-summary">${escapeHtml(document.summary)}</p>` : ""}
              <div class="entry-tags">
                ${document.release ? tag(document.release) : ""}
                ${document.areas.map((value) => tag(value)).join("")}
                ${document.tags.map((value) => tag(`#${value}`)).join("")}
                ${document.warningCount > 0 ? tag(`${document.warningCount} warning${document.warningCount === 1 ? "" : "s"}`, "warning") : ""}
                ${document.errorCount > 0 ? tag(`${document.errorCount} error${document.errorCount === 1 ? "" : "s"}`, "danger") : ""}
              </div>
              ${document.sourceHref ? `<div class="source-reference">${icon("file")}<span><small>Source record${document.date ? ` · Created ${escapeHtml(formatDate(document.date))}` : ""}${updatedDate ? ` · Updated ${escapeHtml(formatDate(updatedDate))}` : ""}</small><code>${escapeHtml(document.path)}</code></span></div>` : ""}
              ${contextGrid(document)}
              ${issueList(document.issues)}
              <div class="record-columns">
                ${detailList("Files", document.files)}
                ${detailList("Symbols", document.symbols)}
                ${detailList("Documentation", document.docs)}
                ${relationships(document)}
              </div>
              ${document.source ? agentPacketDigest(document) : ""}`;
}

function renderPublicEntry(document: LedgerRenderedDocument, yearStart: boolean): string {
  return `<article class="entry release-entry${yearStart ? " year-start" : ""}" id="record-${domId(document.id)}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="release" data-status="released" data-areas="[]" data-tags="[]" data-release="" data-warnings="0" data-errors="0" data-missing-refs="false" data-duplicate-id="false" data-coverage="none" data-year="${escapeHtml(document.date.slice(0, 4))}" data-search="${escapeHtml(searchTerms(document))}">
              <div class="release-date">
                <span class="version-badge">${escapeHtml(document.id)}</span>
                <time datetime="${escapeHtml(document.date)}">${escapeHtml(formatDate(document.date))}</time>
              </div>
              <div class="release-content">
                <span class="score-label" data-score-label hidden></span>
                <h3>${escapeHtml(document.title)}</h3>
                ${publicNotesList(document.publicNotes)}
              </div>
            </article>`;
}

function publicNotesList(values: readonly string[]): string {
  if (values.length === 0) return '<p class="entry-summary">No public notes were recorded.</p>';
  return `<ul class="release-notes">${values
    .map((value) => `<li><span aria-hidden="true">${icon("check")}</span><span>${escapeHtml(value)}</span></li>`)
    .join("")}</ul>`;
}

function filterBar(
  statuses: readonly string[],
  areas: readonly string[],
  releases: readonly string[],
  tags: readonly string[],
): string {
  return `<div class="filter-bar">
          ${selectControl("kind", "Type", [
            ["all", "All record types"],
            ["change", "Changes"],
            ["decision", "Decisions"],
            ["backlog", "Backlog"],
            ["release", "Releases"],
            ["product-note", "Product notes"],
            ["feedback", "Feedback"],
          ])}
          ${selectControl("status", "Status", [["all", "All statuses"], ...statuses.map((value) => [value, value] as const)])}
          ${selectControl("area", "Area", [["all", "All areas"], ...areas.map((value) => [value, value] as const)])}
          ${selectControl("release", "Release", [["all", "All releases"], ["__none", "No release"], ...releases.map((value) => [value, value] as const)])}
          ${selectControl("tag", "Tag", [["all", "All tags"], ...tags.map((value) => [value, value] as const)])}
          <details class="advanced-filters">
            <summary>Quality signals ${icon("chevron")}</summary>
            <div>
              ${selectControl("warning", "Warnings", [["all", "Any warning state"], ["with", "With warnings"], ["without", "Without warnings"]])}
              ${selectControl("missingRef", "References", [["all", "Any reference state"], ["missing", "Missing references"], ["ok", "References resolved"]])}
              ${selectControl("duplicate", "Identifiers", [["all", "Any identifier state"], ["duplicate", "Duplicate identifiers"], ["unique", "Unique identifiers"]])}
              ${selectControl("coverage", "Coverage", [["all", "Any coverage"], ["exact", "Exact paths"], ["pattern", "Pattern coverage"], ["none", "No file coverage"]])}
            </div>
          </details>
          <button class="text-button" type="button" data-reset-filters>Reset</button>
        </div>`;
}

function densityToggle(): string {
  return `<div class="density-toggle" role="group" aria-label="Result density">
                <button type="button" data-density="compact" aria-pressed="false">Compact</button>
                <button type="button" data-density="expanded" aria-pressed="true">Comfortable</button>
              </div>`;
}

function recordPanel(): string {
  return `<aside class="record-panel" id="record-panel" aria-label="Record details" tabindex="-1">
    <div class="record-panel-header">
      <span class="record-panel-eyebrow">Record</span>
      <button class="icon-button" id="record-panel-close" type="button" aria-label="Close record details">${icon("close")}</button>
    </div>
    <div class="record-panel-body" id="record-panel-body"></div>
  </aside>`;
}

function perPageControl(): string {
  return `<span class="select-wrap"><select id="per-page" aria-label="Results per page">
                <option value="10">10 per page</option>
                <option value="25" selected>25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
                <option value="all">All results</option>
              </select></span>`;
}

function selectControl(
  id: string,
  label: string,
  values: readonly (readonly [string, string])[],
): string {
  return `<span class="select-wrap"><select id="${id}" aria-label="${escapeHtml(label)}">${values.map(([value, text]) => option(value, text)).join("")}</select></span>`;
}

function issueList(issues: readonly LedgerIssue[]): string {
  if (issues.length === 0) return "";
  return `<section class="signal-panel" aria-label="Validation issues">
            <div class="section-heading"><span>${icon("warning")}</span><h4>Validation issues</h4><small>${issues.length}</small></div>
            <ul>${issues.map((issue) => `<li><span>${escapeHtml(issue.level)}</span>${escapeHtml(issue.message)}</li>`).join("")}</ul>
          </section>`;
}

function contextGrid(document: LedgerRenderedDocument): string {
  const sections = [
    contextBlock("Invariants", "What must stay true", document.invariants, icon("shield")),
    contextBlock("Verification", "How this was proven", document.verification, icon("check")),
  ].filter((section) => section.length > 0);
  return sections.length === 0 ? "" : `<div class="context-grid">${sections.join("")}</div>`;
}

function contextBlock(label: string, description: string, values: readonly string[], icon: string): string {
  if (values.length === 0) return "";
  return `<section class="context-panel">
            <div class="section-heading"><span>${icon}</span><div><h4>${escapeHtml(label)}</h4><small>${escapeHtml(description)}</small></div></div>
            <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
          </section>`;
}

function detailList(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<details class="record-list">
            <summary><span>${escapeHtml(label)} <small>${values.length}</small></span>${icon("chevron")}</summary>
            <ul>${values.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join("")}</ul>
          </details>`;
}

function relationships(document: LedgerRenderedDocument): string {
  const values = [
    ...document.decisions.map((value) => `Decision · ${value}`),
    ...document.backlog.map((value) => `Backlog · ${value}`),
    ...document.supersedes.map((value) => `Supersedes · ${value}`),
    ...document.related.map((value) => `Related · ${value}`),
  ];
  return detailList("Relationships", values);
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
  return `<details class="agent-packet">
            <summary><span>${icon("spark")} Agent-ready context</span>${icon("chevron")}</summary>
            <pre>${escapeHtml(lines.join("\n"))}</pre>
          </details>`;
}

function graphSummary(model: LedgerStaticReaderModel): string {
  const nodeTypes = countTypes(model.graph.nodes);
  const recordCount = nodeTypes.find((type) => type.value === "record")?.count ?? 0;
  return `<div class="graph-summary">
          <div class="section-heading"><span>${icon("graph")}</span><div><h3>Relationship graph</h3><small>Structured project context</small></div></div>
          <div class="graph-metrics">
            ${miniMetric("Records", recordCount)}
            ${miniMetric("Nodes", model.graph.nodes.length)}
            ${miniMetric("Links", model.graph.edges.length)}
          </div>
          <a class="graph-link" href="graph.json">Open graph data ${icon("arrow")}</a>
        </div>`;
}

function facetButtons(
  label: string,
  field: "kind" | "release" | "area" | "tag",
  facets: readonly LedgerFacet[],
): string {
  if (facets.length === 0) return "";
  return `<div class="facet-list" aria-label="${escapeHtml(label)}">${facets
    .slice(0, 8)
    .map((facet) => `<button class="facet-button" type="button" aria-pressed="false" data-filter-field="${field}" data-filter-value="${escapeHtml(facet.value)}"><span>${escapeHtml(facet.value === "__none" ? "No release" : facet.value)}</span><small>${facet.count}</small></button>`)
    .join("")}</div>`;
}

function searchDialog(isPublic: boolean): string {
  return `<dialog class="command-palette" id="command-palette" aria-labelledby="command-title">
      <div class="command-shell">
        <div class="command-input-row">
          ${icon("search")}
          <label class="sr-only" id="command-title" for="command-search">Search Ledger</label>
          <input id="command-search" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="command-results" aria-autocomplete="list" placeholder="Search ${isPublic ? "release notes" : "project memory"}">
          <button class="command-close" id="command-close" type="button" aria-label="Close search">esc</button>
        </div>
        <div class="command-status" id="command-status">Start typing or choose a recent record</div>
        <div class="command-results" id="command-results" role="listbox" aria-label="Search results"></div>
        <div class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></div>
      </div>
    </dialog>`;
}

function metric(label: string, value: number): string {
  return `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function metricButton(label: string, value: number, attrs: string): string {
  return `<button class="metric" type="button" ${attrs}><strong>${value}</strong><span>${escapeHtml(label)}</span></button>`;
}

function miniMetric(label: string, value: number): string {
  return `<div><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function tag(value: string, tone = "default"): string {
  return `<span class="tag" data-tone="${tone}">${escapeHtml(value)}</span>`;
}

function option(value: string, label: string): string {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function countTypes(values: readonly LedgerGraphNode[] | readonly LedgerGraphEdge[]): readonly LedgerFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value.type, (counts.get(value.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function searchTerms(document: LedgerRenderedDocument): string {
  const titleTokens = new Set(document.title.toLowerCase().split(/\s+/).filter(Boolean));
  const values = [
    document.id,
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
    ...document.publicNotes,
    ...document.invariants,
    ...document.verification,
    ...document.issues.map((issue) => issue.message),
  ];
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of value.toLowerCase().split(/\s+/)) {
      if (token && !titleTokens.has(token)) tokens.add(token);
    }
  }
  return [...tokens].join(" ");
}

function labelForKind(kind: string): string {
  if (kind === "product-note") return "Product note";
  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function domId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function kindIcon(kind: string): string {
  if (kind === "decision") return icon("compass");
  if (kind === "backlog") return icon("backlog");
  if (kind === "release") return icon("release");
  if (kind === "product-note" || kind === "feedback") return icon("spark");
  return icon("change");
}

const iconPaths: Record<string, string> = {
  search: '<path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/>',
  "theme-light":
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5m0 14v2.5M4.57 4.57 6.34 6.34m11.32 11.32 1.77 1.77M2.5 12H5m14 0h2.5M4.57 19.43l1.77-1.77M17.66 6.34l1.77-1.77"/>',
  "theme-dark": '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  file: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  spark:
    '<path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"/><path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75.75-2.25Z"/>',
  graph:
    '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="10" cy="18" r="2"/><path d="m8 6.5 8 1M7 8l2 8m3-1 5-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  backlog: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 12h6m-6 3h4"/>',
  release:
    '<path d="M14 5c2.5-2 5-2 5-2s0 2.5-2 5l-5 5-4-4 6-4Z"/><path d="m8 9-3 1-2 3 5 1m4-1 1 5 3-2 1-4M7 17l-2 2"/>',
  change: '<path d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3 3m-3-3 3-3"/>',
};

function iconSprite(): string {
  return `<svg aria-hidden="true" style="display:none">${Object.entries(iconPaths)
    .map(([name, paths]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${paths}</symbol>`)
    .join("")}</svg>`;
}

function icon(name: string, attrs = ""): string {
  return `<svg class="ui-icon"${attrs ? ` ${attrs}` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
