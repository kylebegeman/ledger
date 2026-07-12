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

  return `<!doctype html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(model.project)} Ledger</title>
  <script>try{const t=localStorage.getItem("ledger-theme");if(t)document.documentElement.dataset.theme=t}catch{}</script>
  <style>
${staticReaderStyles}
  </style>
</head>
<body data-profile="${model.profile}">
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
        ${searchIcon()}
        <span>Search ${isPublic ? "release notes" : "project memory"}</span>
        <kbd>⌘ K</kbd>
      </button>
      <div class="topbar-actions">
        <span class="profile-badge">${isPublic ? "Public notes" : "Internal"}</span>
        <button class="icon-button" id="theme-toggle" type="button" aria-label="Switch color theme" title="Switch color theme">
          ${themeIcon()}
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
                metric("Records", model.stats.documents),
                metric("Changes", model.stats.changes),
                metric("Decisions", model.stats.decisions),
                metric("Backlog", model.stats.backlog),
              ].join("")}
        </div>
      </section>

      <div class="workspace${isPublic ? " workspace-public" : ""}">
        ${isPublic ? publicFilterControls() : internalSidebar(model, areas, statuses, releases, tags)}
        <section class="library" id="library" aria-labelledby="result-count">
          <div class="search-dock">
            ${searchIcon()}
            <label class="sr-only" for="search">Search Ledger</label>
            <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="${isPublic ? "Search versions and release notes" : "Search titles, files, symbols, decisions, or invariants"}">
            <button class="search-clear" id="search-clear" type="button" aria-label="Clear search" hidden>Clear</button>
            <kbd>/</kbd>
          </div>
          <div class="library-toolbar">
            <div>
              <p class="eyebrow">${isPublic ? "Changelog" : "Knowledge library"}</p>
              <h2 id="result-count" data-result-noun="${isPublic ? "release" : "record"}">${model.documents.length} ${isPublic ? "releases" : "records"}</h2>
            </div>
            ${isPublic ? "" : `<button class="filter-toggle" id="filter-toggle" type="button" aria-controls="filters" aria-expanded="false">${filterIcon()} Filters</button>`}
          </div>
          <div class="active-filters" id="active-filters" aria-live="polite"></div>
          <div class="entries${isPublic ? " release-feed" : ""}" id="entries">
            ${model.documents.map((document) => renderEntry(document, model.profile)).join("\n            ")}
          </div>
          <div class="empty" id="empty" hidden>
            <span class="empty-icon" aria-hidden="true">${searchIcon()}</span>
            <h3>No matching records</h3>
            <p>Try a broader phrase or reset the active filters.</p>
            <button type="button" data-reset-filters>Reset filters</button>
          </div>
        </section>
      </div>
    </main>

    <footer>
      <span>${escapeHtml(model.project)} Ledger</span>
      <span>Generated ${escapeHtml(formatGeneratedAt(model.generatedAt))}</span>
    </footer>
  </div>

  ${searchDialog(isPublic)}
  <script>
${staticReaderRuntime}
  </script>
</body>
</html>
`;
}

function internalSidebar(
  model: LedgerStaticReaderModel,
  areas: readonly string[],
  statuses: readonly string[],
  releases: readonly string[],
  tags: readonly string[],
): string {
  return `<button class="filter-scrim" id="filter-scrim" type="button" aria-label="Close filters"></button>
        <aside class="sidebar" id="filters" aria-label="Filters">
          <div class="sidebar-header">
            <div>
              <p class="eyebrow">Refine</p>
              <h2>Filters</h2>
            </div>
            <div class="sidebar-actions">
              <button class="text-button" type="button" data-reset-filters>Reset</button>
              <button class="sidebar-close" id="filter-close" type="button" aria-label="Close filters">${closeIcon()}</button>
            </div>
          </div>
          ${internalFilterControls(areas, statuses, releases, tags)}
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
): string {
  if (profile === "public") return renderPublicEntry(document);
  const recordId = domId(document.id);
  return `<article class="entry" id="record-${recordId}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-areas="${escapeHtml(JSON.stringify(document.areas))}" data-tags="${escapeHtml(JSON.stringify(document.tags))}" data-release="${escapeHtml(document.release ?? "")}" data-warnings="${document.warningCount}" data-errors="${document.errorCount}" data-missing-refs="${document.hasMissingRefs}" data-duplicate-id="${document.hasDuplicateId}" data-coverage="${document.coverageStatus}" data-search="${escapeHtml(searchTerms(document).toLowerCase())}">
              <div class="entry-heading">
                <div class="record-type" data-kind-tone="${escapeHtml(document.kind)}">${kindIcon(document.kind)}<span>${escapeHtml(labelForKind(document.kind))}</span></div>
                <span class="record-id">${escapeHtml(document.id)}</span>
                <span class="status-dot" data-status-tone="${escapeHtml(document.status)}"><i aria-hidden="true"></i>${escapeHtml(document.status)}</span>
                <span class="score-label" data-score-label hidden></span>
              </div>
              <h3>${escapeHtml(document.title)}</h3>
              ${document.summary ? `<p class="entry-summary">${escapeHtml(document.summary)}</p>` : ""}
              <div class="entry-tags">
                ${document.release ? tag(document.release) : ""}
                ${document.areas.slice(0, 4).map((value) => tag(value)).join("")}
                ${document.tags.slice(0, 3).map((value) => tag(`#${value}`)).join("")}
                ${document.warningCount > 0 ? tag(`${document.warningCount} warning${document.warningCount === 1 ? "" : "s"}`, "warning") : ""}
              </div>
              <details class="entry-details">
                <summary><span>Open record</span>${chevronIcon()}</summary>
                <div class="entry-body">
                  ${document.sourceHref ? `<div class="source-reference">${fileIcon()}<span><small>Source record</small><code>${escapeHtml(document.path)}</code></span></div>` : ""}
                  ${contextGrid(document)}
                  ${issueList(document.issues)}
                  <div class="record-columns">
                    ${detailList("Files", document.files)}
                    ${detailList("Symbols", document.symbols)}
                    ${detailList("Documentation", document.docs)}
                    ${relationships(document)}
                  </div>
                  ${document.source ? agentPacketDigest(document) : ""}
                </div>
              </details>
            </article>`;
}

function renderPublicEntry(document: LedgerRenderedDocument): string {
  return `<article class="entry release-entry" id="record-${domId(document.id)}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="release" data-status="released" data-areas="[]" data-tags="[]" data-release="" data-warnings="0" data-errors="0" data-missing-refs="false" data-duplicate-id="false" data-coverage="none" data-search="${escapeHtml(searchTerms(document).toLowerCase())}">
              <div class="release-date">
                <span>${escapeHtml(document.id)}</span>
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
    .map((value) => `<li><span aria-hidden="true">${checkIcon()}</span><span>${escapeHtml(value)}</span></li>`)
    .join("")}</ul>`;
}

function publicFilterControls(): string {
  return `<div hidden>
          ${["kind", "warning", "missingRef", "duplicate", "coverage", "status", "area", "release", "tag"]
            .map((id) => `<input id="${id}" type="hidden" value="all">`)
            .join("")}
        </div>`;
}

function internalFilterControls(
  areas: readonly string[],
  statuses: readonly string[],
  releases: readonly string[],
  tags: readonly string[],
): string {
  return `<div class="filter-stack">
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
            <summary>Quality signals ${chevronIcon()}</summary>
            <div>
              ${selectControl("warning", "Warnings", [["all", "Any warning state"], ["with", "With warnings"], ["without", "Without warnings"]])}
              ${selectControl("missingRef", "References", [["all", "Any reference state"], ["missing", "Missing references"], ["ok", "References resolved"]])}
              ${selectControl("duplicate", "Identifiers", [["all", "Any identifier state"], ["duplicate", "Duplicate identifiers"], ["unique", "Unique identifiers"]])}
              ${selectControl("coverage", "Coverage", [["all", "Any coverage"], ["exact", "Exact paths"], ["pattern", "Pattern coverage"], ["none", "No file coverage"]])}
            </div>
          </details>
        </div>`;
}

function selectControl(
  id: string,
  label: string,
  values: readonly (readonly [string, string])[],
): string {
  return `<label class="filter-control" for="${id}">
            <span>${escapeHtml(label)}</span>
            <select id="${id}">${values.map(([value, text]) => option(value, text)).join("")}</select>
          </label>`;
}

function issueList(issues: readonly LedgerIssue[]): string {
  if (issues.length === 0) return "";
  return `<section class="signal-panel" aria-label="Validation issues">
            <div class="section-heading"><span>${warningIcon()}</span><strong>Validation issues</strong><small>${issues.length}</small></div>
            <ul>${issues.map((issue) => `<li><span>${escapeHtml(issue.level)}</span>${escapeHtml(issue.message)}</li>`).join("")}</ul>
          </section>`;
}

function contextGrid(document: LedgerRenderedDocument): string {
  const sections = [
    contextBlock("Invariants", "What must stay true", document.invariants, shieldIcon()),
    contextBlock("Verification", "How this was proven", document.verification, checkIcon()),
  ].filter((section) => section.length > 0);
  return sections.length === 0 ? "" : `<div class="context-grid">${sections.join("")}</div>`;
}

function contextBlock(label: string, description: string, values: readonly string[], icon: string): string {
  if (values.length === 0) return "";
  return `<section class="context-panel">
            <div class="section-heading"><span>${icon}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div></div>
            <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
          </section>`;
}

function detailList(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<details class="record-list">
            <summary><span>${escapeHtml(label)} <small>${values.length}</small></span>${chevronIcon()}</summary>
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
            <summary><span>${sparkIcon()} Agent-ready context</span>${chevronIcon()}</summary>
            <pre>${escapeHtml(lines.join("\n"))}</pre>
          </details>`;
}

function graphSummary(model: LedgerStaticReaderModel): string {
  const nodeTypes = countTypes(model.graph.nodes);
  const recordCount = nodeTypes.find((type) => type.value === "record")?.count ?? 0;
  return `<div class="graph-summary">
          <div class="section-heading"><span>${graphIcon()}</span><div><strong>Relationship graph</strong><small>Structured project context</small></div></div>
          <div class="graph-metrics">
            ${miniMetric("Records", recordCount)}
            ${miniMetric("Nodes", model.graph.nodes.length)}
            ${miniMetric("Links", model.graph.edges.length)}
          </div>
          <a class="graph-link" href="graph.json">Open graph data ${arrowIcon()}</a>
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
          ${searchIcon()}
          <label class="sr-only" id="command-title" for="command-search">Search Ledger</label>
          <input id="command-search" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="command-results" aria-autocomplete="list" placeholder="Search ${isPublic ? "release notes" : "project memory"}">
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
    ...document.publicNotes,
    ...document.invariants,
    ...document.verification,
    ...document.issues.map((issue) => issue.message),
  ].join(" ");
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
  if (kind === "decision") return compassIcon();
  if (kind === "backlog") return backlogIcon();
  if (kind === "release") return releaseIcon();
  if (kind === "product-note" || kind === "feedback") return sparkIcon();
  return changeIcon();
}

function icon(paths: string, viewBox = "0 0 24 24"): string {
  return `<svg class="ui-icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function searchIcon(): string { return icon('<path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/>'); }
function themeIcon(): string { return icon('<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>'); }
function filterIcon(): string { return icon('<path d="M4 7h16M7 12h10m-7 5h4"/>'); }
function closeIcon(): string { return icon('<path d="m6 6 12 12M18 6 6 18"/>'); }
function chevronIcon(): string { return icon('<path d="m8 10 4 4 4-4"/>'); }
function arrowIcon(): string { return icon('<path d="M5 12h14m-5-5 5 5-5 5"/>'); }
function fileIcon(): string { return icon('<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/>'); }
function checkIcon(): string { return icon('<path d="m5 12 4 4L19 6"/>'); }
function warningIcon(): string { return icon('<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4m0 3h.01"/>'); }
function shieldIcon(): string { return icon('<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'); }
function sparkIcon(): string { return icon('<path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"/><path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75.75-2.25Z"/>'); }
function graphIcon(): string { return icon('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="10" cy="18" r="2"/><path d="m8 6.5 8 1M7 8l2 8m3-1 5-5"/>'); }
function compassIcon(): string { return icon('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>'); }
function backlogIcon(): string { return icon('<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 12h6m-6 3h4"/>'); }
function releaseIcon(): string { return icon('<path d="M14 5c2.5-2 5-2 5-2s0 2.5-2 5l-5 5-4-4 6-4Z"/><path d="m8 9-3 1-2 3 5 1m4-1 1 5 3-2 1-4M7 17l-2 2"/>'); }
function changeIcon(): string { return icon('<path d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3 3m-3-3 3-3"/>'); }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
