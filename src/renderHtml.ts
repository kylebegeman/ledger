import { hashFileContent } from "./fileTransaction.js";
import { recordsViewParams } from "./readerViewParams.js";
import { staticReaderRuntime, staticReaderStyles } from "./renderAssets.js";
import type { LedgerFacet, LedgerRenderedDocument, LedgerStaticReaderModel } from "./render.js";
import type { LedgerIssue } from "./types.js";

export interface RenderStaticReaderHtmlOptions {
  readonly iconSvg?: string;
  /**
   * Record id to detail chunk href. When set, entries reference their chunk
   * with `data-detail` instead of embedding a detail template, and the runtime
   * fetches the chunk when the record opens.
   */
  readonly detailChunks?: ReadonlyMap<string, string>;
}

/**
 * Remove the indentation that template literals leave after newlines, outside
 * `pre`, `textarea`, `script`, and `style` blocks. A newline remains, so inline
 * spacing between elements renders exactly as before.
 */
export function compactHtml(html: string): string {
  const preserved = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi;
  let output = "";
  let last = 0;
  for (const match of html.matchAll(preserved)) {
    output += html.slice(last, match.index).replace(/\n[ \t]+/g, "\n");
    output += match[0];
    last = match.index + match[0].length;
  }
  return output + html.slice(last).replace(/\n[ \t]+/g, "\n");
}

/** Detail panel HTML for every internal record, keyed by record id, for chunked readers. */
export function renderRecordDetails(model: LedgerStaticReaderModel): ReadonlyMap<string, string> {
  const details = new Map<string, string>();
  if (model.profile !== "internal") return details;
  for (const document of model.documents) {
    if (details.has(document.id)) continue;
    details.set(document.id, compactHtml(recordDetail(document, updatedDateOf(document))));
  }
  return details;
}

type RecordLinkType = "decision" | "backlog" | "supersedes" | "related";

interface RecordLink {
  readonly type: RecordLinkType;
  readonly id: string;
}

function recordLinks(document: LedgerRenderedDocument): readonly RecordLink[] {
  return [
    ...document.decisions.map((id) => ({ type: "decision" as const, id })),
    ...document.backlog.map((id) => ({ type: "backlog" as const, id })),
    ...document.supersedes.map((id) => ({ type: "supersedes" as const, id })),
    ...document.related.map((id) => ({ type: "related" as const, id })),
  ];
}


/** Days a record counts as recent in the overview tiles. */
const recentWindowDays = 30;

export function renderStaticReaderHtml(
  model: LedgerStaticReaderModel,
  options: RenderStaticReaderHtmlOptions = {},
): string {
  const isPublic = model.profile === "public";
  return compactHtml(`<!doctype html>
<html lang="en" data-view="${isPublic ? "changelog" : "overview"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(model.project)} Ledger</title>
  ${pageMetadata(model, options.iconSvg)}
  <script>(()=>{let t;try{t=localStorage.getItem("ledger-theme")}catch{}document.documentElement.dataset.theme=t==="light"||t==="dark"?t:window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light"})()${isPublic ? "" : `
try{const p=new URL(location.href).searchParams,v=p.get("view");document.documentElement.dataset.view=v==="overview"||v==="timeline"?v:v==="records"||${JSON.stringify(recordsViewParams)}.some(k=>p.has(k))?"records":"overview"}catch{}`}</script>
  <style>
${staticReaderStyles}
  </style>
</head>
<body data-profile="${model.profile}" data-reader-key="${escapeHtml(`${model.project}:${model.profile}`)}">
  ${iconSprite()}
  <a class="skip-link" href="#library">Skip to ${isPublic ? "releases" : "records"}</a>
  <div class="app" id="top">
    ${topbar(model, isPublic, options.iconSvg)}
    <main id="main">
      ${isPublic ? publicMain(model) : internalMain(model, options)}
    </main>
    <footer class="footer">
      <span class="footer-brand">${escapeHtml(model.project)} <span class="footer-dim">· ${isPublic ? "Changelog" : "Internal reader"} built with Ledger</span></span>
      <span>${isPublic ? `${pluralize(model.stats.releases, "release")} · ` : ""}Generated ${escapeHtml(formatGeneratedAt(model.generatedAt))}</span>
    </footer>
  </div>
  ${isPublic ? "" : recordPanel()}
  ${searchDialog(isPublic)}
  ${shortcutsDialog(isPublic)}
  <script>
${staticReaderRuntime}
  </script>
</body>
</html>
`);
}

/**
 * Description, Open Graph, and icon tags, plus the canonical link when the
 * site URL is known and, for the public changelog, its Atom feed.
 */
function pageMetadata(model: LedgerStaticReaderModel, iconSvg: string | undefined): string {
  const isPublic = model.profile === "public";
  const title = isPublic ? `${model.project} releases` : `${model.project} Ledger`;
  const description = isPublic
    ? `Release notes for ${model.project}, written for the people who use it.`
    : `Decisions, changes, verification, and operating knowledge for ${model.project}.`;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:site_name" content="${escapeHtml(model.project)}">`,
  ];
  if (model.siteUrl) {
    tags.push(`<meta property="og:url" content="${escapeHtml(model.siteUrl)}">`, `<link rel="canonical" href="${escapeHtml(model.siteUrl)}">`);
  }
  if (isPublic) {
    tags.push(`<link rel="alternate" type="application/atom+xml" title="${escapeHtml(title)}" href="feed.xml">`);
  }
  if (iconSvg) {
    tags.push(`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${escapeHtml(encodeURIComponent(iconSvg.trim()))}">`);
  }
  return tags.join("\n  ");
}

function topbar(model: LedgerStaticReaderModel, isPublic: boolean, iconSvg: string | undefined): string {
  return `<header class="topbar">
      <a class="brand" href="${isPublic ? "#top" : "?"}" aria-label="${escapeHtml(model.project)} Ledger home">
        ${iconSvg ? `<span class="brand-mark" aria-hidden="true">${iconSvg}</span>` : `<span class="brand-mark brand-fallback" aria-hidden="true">L</span>`}
        <span class="brand-name"><small>${isPublic ? "Changelog" : "Internal reader"}</small><strong>${escapeHtml(model.project)}</strong></span>
      </a>
      ${isPublic
        ? `<nav class="views" aria-label="Sections">
        <a class="view-tab" href="#library" aria-current="page">${icon("release")}Releases</a>
        <a class="view-tab" href="feed.xml">${icon("rss")}Feed</a>
      </nav>`
        : `<nav class="views" aria-label="Views">
        <a class="view-tab" href="?view=overview" data-view-tab="overview">${icon("grid")}Overview</a>
        <a class="view-tab" href="?view=records" data-view-tab="records">${icon("list")}Records</a>
        <a class="view-tab" href="?view=timeline" data-view-tab="timeline">${icon("clock")}Timeline</a>
      </nav>`}
      <div class="topbar-actions">
        <button class="command-trigger" id="search-trigger" type="button" aria-haspopup="dialog" aria-controls="command-palette">
          ${icon("search")}
          <span>Search ${isPublic ? "releases" : "records"}</span>
          <kbd>⌘K</kbd>
        </button>
        <button class="icon-button" id="shortcuts-trigger" type="button" aria-haspopup="dialog" aria-controls="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">${icon("keyboard")}</button>
        <button class="theme-toggle" id="theme-toggle" type="button" role="switch" aria-label="Dark mode" aria-checked="false" hidden>
          ${icon("theme-light", 'data-theme-icon="light"')}${icon("theme-dark", 'data-theme-icon="dark"')}
        </button>
      </div>
    </header>`;
}

function internalMain(model: LedgerStaticReaderModel, options: RenderStaticReaderHtmlOptions): string {
  const areas = model.facets.areas.map((facet) => facet.value);
  const statuses = model.facets.statuses.map((facet) => facet.value);
  const releases = model.facets.releases.map((facet) => facet.value).filter((value) => value !== "__none");
  const tags = model.facets.tags.map((facet) => facet.value);
  return `${overview(model)}
      <section class="library" id="library" aria-labelledby="result-count">
        <div class="library-head">
          <div class="search-dock">
            ${icon("search")}
            <label class="sr-only" for="search">Search records</label>
            <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Search titles, files, symbols, decisions, or invariants">
            <button class="search-clear" id="search-clear" type="button" aria-label="Clear search" hidden>Clear</button>
            <kbd>/</kbd>
          </div>
          ${filterBar(statuses, areas, releases, tags)}
          <p class="sr-only" id="filter-status" role="status"></p>
        </div>
        <div class="library-body">
          ${internalRail(model)}
          <div class="results">
            <div class="results-toolbar">
              <div class="results-heading">
                <p class="sr-only" id="results-eyebrow">Records</p>
                <h2 id="result-count" tabindex="-1" data-result-noun="record">${pluralize(model.documents.length, "record")}</h2>
                ${visitNote(false)}
              </div>
              <div class="view-controls">
                ${sortControl()}
                ${densityToggle()}
                ${perPageControl()}
              </div>
            </div>
            ${entityBar()}
            <div class="active-filters" id="active-filters" aria-label="Active filters" hidden></div>
            <div class="entries" id="entries" role="feed" aria-busy="false">
              ${model.documents
                .map((document) => renderEntry(document, options.detailChunks?.get(document.id)))
                .join("\n              ")}
            </div>
            <nav class="pagination" id="pagination" aria-label="Pagination" hidden></nav>
            ${emptyState(false)}
          </div>
        </div>
      </section>`;
}

function publicMain(model: LedgerStaticReaderModel): string {
  const latest = model.documents[0];
  return `<section class="masthead masthead-public" aria-labelledby="page-title">
        <h1 class="masthead-title" id="page-title">${escapeHtml(model.project)}<span class="changelog-title-suffix">Changelog</span></h1>
        <p class="masthead-meta">
          <span>${pluralize(model.stats.releases, "release")}</span>
          ${latest ? `<span>Latest <a class="mono" href="#${escapeHtml(releaseAnchor(latest.id))}">${escapeHtml(latest.id)}</a> on ${escapeHtml(formatDate(latest.date))}</span>` : ""}
          <a class="feed-link" href="feed.xml">${icon("rss")}Atom feed</a>
        </p>
      </section>
      <div class="changelog">
        ${versionIndex(model)}
        <section class="library" id="library" aria-labelledby="result-count">
          <div class="library-head">
            <div class="search-dock">
              ${icon("search")}
              <label class="sr-only" for="search">Search releases</label>
              <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Search versions and release notes">
              <button class="search-clear" id="search-clear" type="button" aria-label="Clear search" hidden>Clear</button>
              <kbd>/</kbd>
            </div>
            <p class="sr-only" id="filter-status" role="status"></p>
          </div>
          <div class="results">
            <div class="results-toolbar">
              <div class="results-heading">
                <p class="sr-only" id="results-eyebrow">Releases</p>
                <h2 id="result-count" tabindex="-1" data-result-noun="release">${pluralize(model.documents.length, "release")}</h2>
                ${visitNote(true)}
              </div>
              <div class="view-controls">
                ${perPageControl()}
              </div>
            </div>
            <div class="entries release-feed" id="entries" role="feed" aria-busy="false">
              ${model.documents
                .map((document, index) =>
                  renderPublicEntry(
                    document,
                    index === 0 || model.documents[index - 1]!.date.slice(0, 4) !== document.date.slice(0, 4),
                    index === 0,
                  ),
                )
                .join("\n              ")}
            </div>
            <nav class="pagination" id="pagination" aria-label="Pagination" hidden></nav>
            ${emptyState(true)}
          </div>
        </section>
      </div>`;
}

/** The public changelog's version index: every release by year, linking to its permalink. */
function versionIndex(model: LedgerStaticReaderModel): string {
  if (model.documents.length === 0) return "";
  let year = "";
  const items: string[] = [];
  for (const document of model.documents) {
    const documentYear = document.date.slice(0, 4);
    if (documentYear !== year) {
      year = documentYear;
      items.push(`<li class="version-year" aria-hidden="true">${escapeHtml(year)}</li>`);
    }
    const anchor = releaseAnchor(document.id);
    items.push(
      `<li><a class="version-link" href="#${escapeHtml(anchor)}" data-version="${escapeHtml(anchor)}"><span>${escapeHtml(document.id)}</span><time datetime="${escapeHtml(document.date)}">${escapeHtml(formatShortDate(document.date))}</time></a></li>`,
    );
  }
  return `<aside class="version-index" aria-label="Versions">
          <p class="rail-label">Versions</p>
          <ol class="version-list" id="version-list">${items.join("")}</ol>
        </aside>`;
}

function overview(model: LedgerStaticReaderModel): string {
  const documents = model.documents;
  const generated = new Date(model.generatedAt);
  const cutoff = Number.isNaN(generated.getTime())
    ? ""
    : new Date(generated.getTime() - recentWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recent = (kind?: string) =>
    documents.filter((document) => (!kind || document.kind === kind) && cutoff !== "" && document.date >= cutoff).length;
  const releases = documents.filter((document) => document.kind === "release");
  const latestRelease = releases[0];
  const recentChanges = documents.filter((document) => document.kind === "change").slice(0, 6);
  const acceptedDecisions = documents.filter((document) => document.kind === "decision" && document.status === "accepted").length;
  const openBacklog = documents.filter((document) => document.kind === "backlog" && !closedStatuses.has(document.status));
  const activeSessions = documents.filter((document) => document.kind === "session" && document.status === "active").length;
  const withWarnings = documents.filter((document) => document.warningCount > 0).length;
  const withErrors = documents.filter((document) => document.errorCount > 0).length;
  const missingRefs = documents.filter((document) => document.hasMissingRefs).length;
  const duplicates = documents.filter((document) => document.hasDuplicateId).length;
  const uncovered = documents.filter((document) => document.kind === "change" && document.coverageStatus === "none").length;
  const staleEvidence = documents.filter((document) => document.verificationStatus === "stale" || document.verificationStatus === "failed").length;
  const inWindow = (count: number, noun: string) => (cutoff ? `${count === 0 ? "none" : `+${count}`} in ${recentWindowDays} days` : pluralize(count, noun));
  return `<section class="overview" id="overview" aria-labelledby="overview-title">
        <div class="masthead masthead-overview">
          <h1 class="masthead-title" id="overview-title">${escapeHtml(model.project)}</h1>
          <p class="masthead-meta">Updated ${escapeHtml(formatGeneratedAt(model.generatedAt))}</p>
        </div>
        <div class="tiles" aria-label="Browse by record type">
          ${tile("Records", model.stats.documents, inWindow(recent(), "record"), "data-reset-filters data-view-target=\"records\"")}
          ${tile("Changes", model.stats.changes, inWindow(recent("change"), "change"), kindFilter("change"))}
          ${tile("Decisions", model.stats.decisions, `${acceptedDecisions} accepted`, kindFilter("decision"))}
          ${tile("Backlog", model.stats.backlog, `${openBacklog.length} open`, kindFilter("backlog"))}
          ${tile("Releases", model.stats.releases, latestRelease ? `latest ${latestRelease.id}` : "none yet", kindFilter("release"))}
          ${tile("Sessions", model.stats.sessions, `${activeSessions} active`, kindFilter("session"))}
        </div>
        <div class="overview-grid">
          <div class="overview-main">
            <section class="panel panel-recent" aria-labelledby="recent-title">
              <div class="panel-head">
                <h2 class="panel-title" id="recent-title">Recent changes</h2>
                <button class="text-button" type="button" ${kindFilter("change")}>All changes ${icon("arrow")}</button>
              </div>
              ${recentChangesList(recentChanges)}
            </section>
            <section class="panel panel-chart" aria-labelledby="activity-title">
              <div class="panel-head">
                <h2 class="panel-title" id="activity-title">Activity</h2>
                <p class="panel-sub" id="activity-sub">Records by month. Select a month to filter.</p>
              </div>
              <div class="chart" id="activity-chart"></div>
              <details class="chart-table">
                <summary>View as a table</summary>
                <table id="activity-table"><caption class="sr-only">Records by month</caption><thead><tr><th scope="col">Month</th><th scope="col">Records</th></tr></thead><tbody></tbody></table>
              </details>
            </section>
            ${graphSummary(model)}
          </div>
          <aside class="overview-aside" aria-label="Repository context">
            <section class="panel" aria-labelledby="releases-title">
              <div class="panel-head">
                <h2 class="panel-title" id="releases-title">Releases</h2>
                <button class="text-button" type="button" ${kindFilter("release")}>View all</button>
              </div>
              ${releaseList(releases.slice(0, 3))}
            </section>
            <section class="panel" aria-labelledby="backlog-title">
              <div class="panel-head">
                <h2 class="panel-title" id="backlog-title">Open backlog <span class="section-count">${openBacklog.length}</span></h2>
                <button class="text-button" type="button" ${kindFilter("backlog")}>View all</button>
              </div>
              ${recordList(openBacklog.slice(0, 4), "No open backlog items.")}
            </section>
            <section class="panel" aria-labelledby="health-title">
              <div class="panel-head"><h2 class="panel-title" id="health-title">Health</h2></div>
              <ul class="health-list">
                ${healthItem("Validation warnings", withWarnings, 'data-filter-field="warning" data-filter-value="with"')}
                ${healthItem("Validation errors", withErrors, 'data-filter-field="warning" data-filter-value="with"')}
                ${healthItem("Missing references", missingRefs, 'data-filter-field="missingRef" data-filter-value="missing"')}
                ${healthItem("Duplicate identifiers", duplicates, 'data-filter-field="duplicate" data-filter-value="duplicate"')}
                ${healthItem("Changes without file coverage", uncovered, 'data-filter-field="coverage" data-filter-value="none"')}
                ${healthItem("Stale or failed verification", staleEvidence)}
              </ul>
            </section>
            <section class="panel" aria-labelledby="areas-title">
              <div class="panel-head"><h2 class="panel-title" id="areas-title">Areas</h2></div>
              <div class="bars" id="area-chart"></div>
            </section>
          </aside>
        </div>
      </section>`;
}

/** Backlog statuses that mean the work is finished or dropped, so the overview does not call it open. */
const closedStatuses = new Set(["done", "landed", "closed", "released", "shipped", "superseded", "rejected", "resolved", "cancelled", "canceled", "dropped", "declined", "wontfix", "archived"]);

function kindFilter(kind: string): string {
  return `data-filter-field="kind" data-filter-value="${kind}" data-view-target="records"`;
}

function tile(label: string, value: number, hint: string, attrs: string): string {
  return `<button class="tile" type="button" ${attrs} title="${escapeHtml(hint)}">
            <strong class="tile-value">${value}</strong><span class="tile-label">${escapeHtml(label)}</span>
            <span class="sr-only">${escapeHtml(hint)}</span>
          </button>`;
}

function recentChangesList(records: readonly LedgerRenderedDocument[]): string {
  if (records.length === 0) return '<p class="panel-empty">No changes recorded yet.</p>';
  return `<ol class="recent-list">${records.map((document) =>
    `<li><a class="recent-list-item" href="?record=${escapeHtml(encodeURIComponent(document.id))}" data-open-record="${escapeHtml(document.id)}">
      <span class="mono">${escapeHtml(document.id)}</span>
      <span class="recent-list-copy"><strong>${escapeHtml(document.title)}</strong><span>${escapeHtml(document.areas.join(" · "))}${document.areas.length ? " · " : ""}${escapeHtml(document.status)}</span></span>
      <time datetime="${escapeHtml(document.date)}">${escapeHtml(formatShortDate(document.date))}</time>
    </a></li>`).join("")}</ol>`;
}

function healthItem(label: string, count: number, attrs?: string): string {
  const tone = count === 0 ? "ok" : "attention";
  const content = `<span class="health-label">${escapeHtml(label)}</span><strong class="health-count">${count}</strong>`;
  return attrs && count > 0
    ? `<li data-tone="${tone}"><button type="button" ${attrs} data-view-target="records">${content}</button></li>`
    : `<li data-tone="${tone}"><span>${content}</span></li>`;
}

function releaseList(releases: readonly LedgerRenderedDocument[]): string {
  if (releases.length === 0) return '<p class="panel-empty">No release records yet.</p>';
  return `<ol class="record-list">${releases
    .map(
      (document) =>
        `<li><a class="record-list-item" href="?record=${escapeHtml(encodeURIComponent(document.id))}" data-open-record="${escapeHtml(document.id)}"><span class="mono">${escapeHtml(document.id)}</span><span class="record-list-title">${escapeHtml(document.title)}</span><time datetime="${escapeHtml(document.date)}">${escapeHtml(formatDate(document.date))}</time></a></li>`,
    )
    .join("")}</ol>`;
}

function recordList(records: readonly LedgerRenderedDocument[], emptyMessage: string): string {
  if (records.length === 0) return `<p class="panel-empty">${escapeHtml(emptyMessage)}</p>`;
  return `<ol class="record-list">${records
    .map(
      (document) =>
        `<li><a class="record-list-item" href="?record=${escapeHtml(encodeURIComponent(document.id))}" data-open-record="${escapeHtml(document.id)}"><span class="mono">${escapeHtml(document.id)}</span><span class="record-list-title">${escapeHtml(document.title)}</span><span class="status-dot" data-status-tone="${escapeHtml(document.status)}">${escapeHtml(document.status)}</span></a></li>`,
    )
    .join("")}</ol>`;
}

function internalRail(model: LedgerStaticReaderModel): string {
  return `<aside class="rail" aria-label="Browse records">
            <nav class="rail-types" aria-labelledby="browse-types">
              <h3 class="rail-heading" id="browse-types">Record types</h3>
              <div class="facet-list">
                <button class="facet-button" type="button" aria-pressed="false" data-filter-field="kind" data-filter-value="all"><span>${icon("layers")}All types</span><small>${model.documents.length}</small></button>
                ${facetButtons("kind", model.facets.kinds)}
              </div>
            </nav>
            <div class="rail-refine" aria-labelledby="browse-refine">
              <h3 class="rail-heading" id="browse-refine">Refine</h3>
              <div class="rail-filters" id="rail-filters"></div>
            </div>
          </aside>`;
}

function renderEntry(document: LedgerRenderedDocument, detailHref?: string): string {
  const recordId = domId(document.id);
  const updatedDate = updatedDateOf(document);
  return `<article class="entry" id="record-${recordId}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-date="${escapeHtml(document.date)}"${updatedDate ? ` data-updated="${escapeHtml(updatedDate)}"` : ""} data-areas="${escapeHtml(JSON.stringify(document.areas))}" data-tags="${escapeHtml(JSON.stringify(document.tags))}" data-release="${escapeHtml(document.release ?? "")}" data-warnings="${document.warningCount}" data-errors="${document.errorCount}" data-missing-refs="${document.hasMissingRefs}" data-duplicate-id="${document.hasDuplicateId}" data-coverage="${document.coverageStatus}" data-hash="${contentHash(document)}"${referenceAttributes(document)}${detailHref ? ` data-detail="${escapeHtml(detailHref)}" data-source="${escapeHtml(document.sourceHref)}"` : ""} data-search="${escapeHtml(searchTerms(document))}">
                ${recordBadges(document)}
                <h3 class="entry-title"><a class="entry-link" href="?record=${escapeHtml(encodeURIComponent(document.id))}">${escapeHtml(document.title)}</a></h3>
                <span class="entry-meta"><span class="score-label" data-score-label hidden></span>${statusDot(document.status)}</span>
                ${recordTime(document, updatedDate)}
                ${recordSummary(document)}
                ${recordTags(document, { areas: 3, tags: 3 })}
                ${detailHref ? "" : `<template class="entry-detail">${recordDetail(document, updatedDate)}</template>`}
              </article>`;
}

function updatedDateOf(document: LedgerRenderedDocument): string {
  return document.updated && document.updated !== document.date ? document.updated : "";
}

/**
 * The files, symbols, docs, and record links of an entry, one per line. The
 * runtime builds the panel's lists and backlinks, entity views, palette
 * suggestions, and offline search from them, so detail HTML never repeats
 * them. Lines cost less than JSON, whose quotes are escaped. Empty lists are
 * left out.
 */
function referenceAttributes(document: LedgerRenderedDocument): string {
  const lists: readonly (readonly [string, readonly string[]])[] = [
    ["files", document.files],
    ["symbols", document.symbols],
    ["docs", document.docs],
    ["links", recordLinks(document).map((link) => `${link.type}:${link.id}`)],
  ];
  return lists
    .map(([name, values]) => [name, values.filter((value) => value.length > 0 && !value.includes("\n"))] as const)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => ` data-${name}="${escapeHtml(values.join("\n"))}"`)
    .join("");
}

function recordDetail(document: LedgerRenderedDocument, updatedDate: string): string {
  return `<div class="record-panel-meta">
                ${recordBadges(document)}
                ${statusDot(document.status)}
                ${recordTime(document, updatedDate)}
              </div>
              <h2 class="record-panel-title">${escapeHtml(document.title)}</h2>
              ${recordSummary(document)}
              ${recordTags(document, undefined, true)}
              ${document.sourceHref ? `<div class="source-reference">${icon("file")}<span><small>Markdown source${updatedDate ? ` · Updated ${escapeHtml(formatDate(updatedDate))}` : ""}</small><a href="${escapeHtml(document.sourceHref)}" download="${escapeHtml(sourceDownloadName(document.path))}" aria-label="Download Markdown source for ${escapeHtml(document.id)}"><code>${escapeHtml(document.path)}</code></a></span></div>` : ""}
              ${contextGrid(document)}
              ${publicNotesPanel(document)}
              ${issueList(document.issues)}
              <div class="record-columns"></div>
              ${document.source ? agentPacketDigest(document) : ""}`;
}

function packetCommand(document: LedgerRenderedDocument): string {
  return `ledger packet ${document.files[0] ?? document.docs[0] ?? document.path} --budget 1200`;
}

/** The kind label and id that lead a record row and the record panel. */
function recordBadges(document: LedgerRenderedDocument): string {
  return `<span class="kind" data-kind-tone="${escapeHtml(document.kind)}">${icon(iconForKind(document.kind))}${escapeHtml(labelForKind(document.kind))}</span>
                <span class="record-id">${escapeHtml(document.id)}</span>`;
}

function statusDot(status: string): string {
  return `<span class="status-dot" data-status-tone="${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

/**
 * A record's creation date, which orders the list; a later update shows on
 * hover, and the runtime swaps the update in when the list sorts by it.
 */
function recordTime(document: LedgerRenderedDocument, updatedDate: string): string {
  if (!document.date) return "";
  const hover = updatedDate ? ` title="Updated ${escapeHtml(formatDate(updatedDate))}"` : "";
  return `<time class="record-date" datetime="${escapeHtml(document.date)}"${hover}>${escapeHtml(formatDate(document.date))}</time>`;
}

function recordSummary(document: LedgerRenderedDocument): string {
  return document.summary ? `<p class="entry-summary">${inlineCodeHtml(document.summary)}</p>` : "";
}

/**
 * Release, area, tag, and issue chips; a row shows the first few areas and
 * tags, the panel all of them, with release and area chips that filter the list.
 */
function recordTags(
  document: LedgerRenderedDocument,
  limits?: { readonly areas: number; readonly tags: number },
  filters = false,
): string {
  const areas = limits ? document.areas.slice(0, limits.areas) : document.areas;
  const tags = limits ? document.tags.slice(0, limits.tags) : document.tags;
  const chip = (field: "release" | "area", value: string) =>
    filters ? `<button class="tag" type="button" data-entity="${field}">${escapeHtml(value)}</button>` : tag(value, field);
  const chips = [
    document.release ? chip("release", document.release) : "",
    ...areas.map((value) => chip("area", value)),
    ...tags.map((value) => tag(`#${value}`)),
    document.warningCount > 0 ? tag(`${document.warningCount} warning${document.warningCount === 1 ? "" : "s"}`, "warning") : "",
    document.errorCount > 0 ? tag(`${document.errorCount} error${document.errorCount === 1 ? "" : "s"}`, "danger") : "",
  ].filter((value) => value.length > 0);
  return chips.length === 0 ? "" : `<div class="entry-tags">${chips.join("")}</div>`;
}

/**
 * The fragment a release's permalink uses: the release id itself when it is a
 * plain token such as `v1.2.0`, so links read naturally and stay stable.
 */
export function releaseAnchor(id: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) ? id : `release-${domId(id)}`;
}

function renderPublicEntry(document: LedgerRenderedDocument, yearStart: boolean, latest: boolean): string {
  const anchor = releaseAnchor(document.id);
  return `<article class="entry release-entry${yearStart ? " year-start" : ""}" id="${escapeHtml(anchor)}" tabindex="-1" data-id="${escapeHtml(document.id)}" data-kind="release" data-status="released" data-date="${escapeHtml(document.date)}" data-areas="[]" data-tags="[]" data-release="" data-warnings="0" data-errors="0" data-missing-refs="false" data-duplicate-id="false" data-coverage="none" data-hash="${contentHash(document)}" data-year="${escapeHtml(document.date.slice(0, 4))}" data-search="${escapeHtml(searchTerms(document))}">
                <div class="release-spine">
                  <a class="version-badge" href="#${escapeHtml(anchor)}" title="Link to this release">${escapeHtml(document.id)}</a>
                  <time datetime="${escapeHtml(document.date)}">${escapeHtml(formatDate(document.date))}</time>
                  ${latest ? '<span class="pill" data-tone="accent">Latest</span>' : ""}
                </div>
                <div class="release-content">
                  <div class="release-head"><h3>${escapeHtml(document.title)}</h3><span class="score-label" data-score-label hidden></span></div>
                  ${publicNotesList(document.publicNotes)}
                </div>
              </article>`;
}

function publicNotesList(values: readonly string[]): string {
  if (values.length === 0) return '<p class="entry-summary">No public notes were recorded.</p>';
  return `<ul class="release-notes">${values
    .map((value) => `<li><span aria-hidden="true">${icon("check")}</span><span>${inlineCodeHtml(value)}</span></li>`)
    .join("")}</ul>`;
}

/** A release record's Public Notes, shown in the internal panel as they appear in the changelog. */
function publicNotesPanel(document: LedgerRenderedDocument): string {
  if (document.kind !== "release" || document.publicNotes.length === 0) return "";
  return `<section class="context-panel notes-panel">
            <div class="section-heading"><span>${icon("release")}</span><div><h4>Public notes</h4><small>As published in the changelog</small></div></div>
            <ul>${document.publicNotes.map((value) => `<li>${inlineCodeHtml(value)}</li>`).join("")}</ul>
          </section>`;
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
            ["session", "Sessions"],
          ])}
          ${selectControl("status", "Status", [["all", "All statuses"], ...statuses.map((value) => [value, value] as const)])}
          ${selectControl("area", "Area", [["all", "All areas"], ...areas.map((value) => [value, value] as const)])}
          ${selectControl("release", "Release", [["all", "All releases"], ["__none", "No release"], ...releases.map((value) => [value, value] as const)])}
          ${selectControl("tag", "Tag", [["all", "All tags"], ...tags.map((value) => [value, value] as const)])}
          <details class="advanced-filters">
            <summary>${icon("filter")}Quality signals <span class="quality-count" hidden></span>${icon("chevron")}</summary>
            <div>
              <p class="filter-menu-heading">Quality signals</p>
              ${selectControl("warning", "Warnings", [["all", "Any warning state"], ["with", "With warnings"], ["without", "Without warnings"]])}
              ${selectControl("missingRef", "References", [["all", "Any reference state"], ["missing", "Missing references"], ["ok", "References resolved"]])}
              ${selectControl("duplicate", "Identifiers", [["all", "Any identifier state"], ["duplicate", "Duplicate identifiers"], ["unique", "Unique identifiers"]])}
              ${selectControl("coverage", "Coverage", [["all", "Any coverage"], ["exact", "Exact paths"], ["pattern", "Pattern coverage"], ["none", "No file coverage"]])}
            </div>
          </details>
          <button class="text-button filter-reset" type="button" data-reset-filters>Reset</button>
        </div>`;
}

function sortControl(): string {
  return `<span class="select-wrap"><select id="sort" aria-label="Sort records">
                <option value="newest" selected>Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Recently updated</option>
                <option value="title">Title A to Z</option>
                <option value="id">Identifier</option>
              </select></span>`;
}

function densityToggle(): string {
  return `<div class="density-toggle" role="group" aria-label="Result density">
                <button type="button" data-density="compact" aria-pressed="false" title="Compact rows">${icon("rows")}<span class="sr-only">Compact</span></button>
                <button type="button" data-density="expanded" aria-pressed="true" title="Comfortable rows">${icon("list")}<span class="sr-only">Comfortable</span></button>
              </div>`;
}

/** Length of an entry's content hash; enough to tell whether a record changed between visits. */
const contentHashLength = 12;

/**
 * A short hash of what a reader shows for a record, so the runtime can tell
 * which records are new or changed since the viewer's last visit. The public
 * profile hashes only what it shows.
 */
function contentHash(document: LedgerRenderedDocument): string {
  const shown = document.source || JSON.stringify([document.title, document.date, document.publicNotes]);
  return hashFileContent(shown).slice(0, contentHashLength);
}

/** Changed-since-last-visit controls, shown by the runtime once a viewer has visited before and something changed. */
function visitNote(isPublic: boolean): string {
  return `<p class="visit-note" id="visit-note" hidden>
                <button class="text-button" type="button" id="changed-toggle" aria-pressed="false"></button>
                <button class="text-button" type="button" id="mark-seen">Mark all as seen</button>
                <span class="sr-only">${isPublic ? "Releases" : "Records"} that are new or changed since your last visit are marked.</span>
              </p>`;
}

/** The heading of an entity view, filled in by the runtime when one is active. */
function entityBar(): string {
  return `<div class="entity-bar" id="entity-bar" tabindex="-1" hidden>
            <span class="entity-kind" id="entity-kind"></span>
            <span class="entity-value" id="entity-value"></span>
            <span class="entity-count" id="entity-count"></span>
            <button class="text-button" type="button" id="entity-clear">Show all records</button>
          </div>`;
}

function emptyState(isPublic: boolean): string {
  return `<div class="empty" id="empty" hidden>
            <span class="empty-icon" aria-hidden="true">${icon("search")}</span>
            <div data-empty-variant="filtered">
              <h3>No matching ${isPublic ? "releases" : "records"}</h3>
              <p>Try a broader phrase or reset the active filters.</p>
            </div>
            <div data-empty-variant="bare">
              <h3>${isPublic ? "No releases yet" : "No records yet"}</h3>
              <p>${isPublic ? "Published release notes will appear here." : "Recorded changes, decisions, and backlog items will appear here."}</p>
            </div>
            <button class="button" type="button" data-reset-filters>Reset filters</button>
          </div>`;
}

function recordPanel(): string {
  return `<aside class="record-panel" id="record-panel" aria-label="Record details" tabindex="-1">
    <div class="record-panel-header">
      <span class="record-panel-eyebrow">Record</span>
      <div class="record-panel-nav" role="group" aria-label="Move between records">
        <button class="icon-button" id="record-prev" type="button" aria-label="Previous record" title="Previous record ([)">${icon("chevron-left")}</button>
        <span class="record-position" id="record-position"></span>
        <button class="icon-button" id="record-next" type="button" aria-label="Next record" title="Next record (])">${icon("chevron-right")}</button>
      </div>
      <button class="icon-button" id="record-panel-close" type="button" aria-label="Close record details" title="Close (esc)">${icon("close")}</button>
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
  const primary = ["kind", "status", "area", "release", "tag"].includes(id);
  const placeholder = id === "kind" ? "Record type" : label;
  return `<span class="select-wrap" data-filter-control="${id}"><select id="${id}" aria-label="${escapeHtml(label)}" data-menu-label="${escapeHtml(placeholder)}"${primary ? ` data-placeholder="${escapeHtml(placeholder)}" data-label-prefix="${escapeHtml(label)}"` : ""}>${values.map(([value, text]) => option(value, text)).join("")}</select></span>`;
}

function issueList(issues: readonly LedgerIssue[]): string {
  if (issues.length === 0) return "";
  return `<section class="signal-panel" aria-label="Validation issues">
            <div class="section-heading"><span>${icon("warning")}</span><div><h4>Validation issues</h4><small>${pluralize(issues.length, "issue")} from ledger doctor</small></div></div>
            <ul>${issues.map((issue) => `<li><span data-level="${escapeHtml(issue.level)}">${escapeHtml(issue.level)}</span>${escapeHtml(issue.message)}</li>`).join("")}</ul>
          </section>`;
}

function contextGrid(document: LedgerRenderedDocument): string {
  const sections = [
    contextBlock("Invariants", "", document.invariants),
    contextBlock("Verification", verificationDescription(document), document.verification, document.verificationStatus),
  ].filter((section) => section.length > 0);
  return sections.length === 0 ? "" : `<div class="context-grid">${sections.join("")}</div>`;
}

function verificationDescription(document: LedgerRenderedDocument): string {
  const ranAt = document.verifiedAt ? document.verifiedAt.slice(0, 10) : undefined;
  const commit = document.verifiedCommit ? ` at ${document.verifiedCommit.slice(0, 7)}` : "";
  switch (document.verificationStatus) {
    case "fresh":
      return `Verified ${ranAt}${commit}`;
    case "stale":
      return `Evidence from ${ranAt}${commit} is stale`;
    case "failed":
      return `Last run on ${ranAt}${commit} failed`;
    default:
      return "";
  }
}

function contextBlock(label: string, description: string, values: readonly string[], tone?: string): string {
  if (values.length === 0) return "";
  return `<section class="context-panel"${tone && tone !== "none" ? ` data-tone="${escapeHtml(tone)}"` : ""}>
            <div class="section-heading"><div><h4>${escapeHtml(label)}</h4>${description ? `<small>${escapeHtml(description)}</small>` : ""}</div></div>
            <ul>${values.map((value) => `<li>${inlineCodeHtml(value)}</li>`).join("")}</ul>
          </section>`;
}

function agentPacketDigest(document: LedgerRenderedDocument): string {
  const lines = [
    packetCommand(document),
    "",
    `${document.id}: ${document.title}`,
    document.invariants.length > 0 ? `Invariants: ${document.invariants.slice(0, 3).join(" | ")}` : "",
    document.verification.length > 0 ? `Verification: ${document.verification.slice(0, 3).join(" | ")}` : "",
  ].filter((line) => line.length > 0);
  return `<details class="agent-packet">
            <summary><span>${icon("spark")} Agent context</span>${icon("chevron")}</summary>
            <pre>${escapeHtml(lines.join("\n"))}</pre>
          </details>`;
}

function graphSummary(model: LedgerStaticReaderModel): string {
  const count = (type: string) => model.graph.nodes.filter((node) => node.type === type).length;
  return `<section class="panel panel-graph" aria-labelledby="graph-title">
            <div class="panel-head">
              <div><h2 class="panel-title" id="graph-title">Relationships</h2><p class="panel-sub">What the records name and link</p></div>
              <a class="text-button" href="graph.json">Open graph data ${icon("arrow")}</a>
            </div>
            <dl class="graph-metrics">
              <div><dt>Records</dt><dd>${count("record")}</dd></div>
              <div><dt>Files</dt><dd>${count("file") + count("doc")}</dd></div>
              <div><dt>Symbols</dt><dd>${count("symbol")}</dd></div>
              <div><dt>Links</dt><dd>${model.graph.edges.length}</dd></div>
            </dl>
          </section>`;
}

function facetButtons(
  field: "kind" | "release" | "area" | "tag",
  facets: readonly LedgerFacet[],
): string {
  return facets
    .map(
      (facet) =>
        `<button class="facet-button" type="button" aria-pressed="false" data-filter-field="${field}" data-filter-value="${escapeHtml(facet.value)}"><span>${field === "kind" ? icon(iconForKind(facet.value)) : ""}${escapeHtml(facet.value === "__none" ? "No release" : field === "kind" ? labelForKind(facet.value) : facet.value)}</span><small>${facet.count}</small></button>`,
    )
    .join("");
}

function searchDialog(isPublic: boolean): string {
  return `<dialog class="command-palette" id="command-palette" aria-labelledby="command-title">
      <div class="command-shell">
        <div class="command-input-row">
          ${icon("search")}
          <label class="sr-only" id="command-title" for="command-search">Search ${isPublic ? "releases" : "records"}</label>
          <input id="command-search" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="command-results" aria-autocomplete="list" placeholder="${isPublic ? "Search versions and release notes" : "Search records, files, symbols, and areas"}">
          <button class="command-close" id="command-close" type="button" aria-label="Close search">esc</button>
        </div>
        <div class="command-status" id="command-status">Start typing or choose a recent record</div>
        <div class="command-results" id="command-results" role="listbox" aria-label="Search results"></div>
        <div class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></div>
      </div>
    </dialog>`;
}

function shortcutsDialog(isPublic: boolean): string {
  const rows: readonly (readonly [string, string])[] = isPublic
    ? [
        ["/", "Focus search"],
        ["⌘ K", "Search everything"],
        ["j", "Next release"],
        ["k", "Previous release"],
        ["?", "This list"],
        ["esc", "Close"],
      ]
    : [
        ["/", "Focus search"],
        ["⌘ K", "Search everything"],
        ["j", "Next record"],
        ["k", "Previous record"],
        ["o", "Open the selected record"],
        ["]", "Next record in the panel"],
        ["[", "Previous record in the panel"],
        ["g o", "Overview"],
        ["g r", "Records"],
        ["g t", "Timeline"],
        ["?", "This list"],
        ["esc", "Close"],
      ];
  return `<dialog class="shortcuts" id="shortcuts" aria-labelledby="shortcuts-title">
      <div class="shortcuts-shell">
        <div class="shortcuts-head"><h2 id="shortcuts-title">Keyboard shortcuts</h2><button class="icon-button" id="shortcuts-close" type="button" aria-label="Close">${icon("close")}</button></div>
        <dl class="shortcuts-list">${rows.map(([key, action]) => `<div><dt>${key.split(" ").map((part) => `<kbd>${escapeHtml(part)}</kbd>`).join("")}</dt><dd>${escapeHtml(action)}</dd></div>`).join("")}</dl>
      </div>
    </dialog>`;
}

function tag(value: string, tone = "default"): string {
  return `<span class="tag" data-tone="${tone}">${escapeHtml(value)}</span>`;
}

function option(value: string, label: string): string {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
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

function pluralize(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
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

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function sourceDownloadName(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "ledger-source.md";
}

function domId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** A consistent visual landmark for each kind, alongside its written label. */
function iconForKind(kind: string | undefined): string {
  switch (kind) {
    case "change": return "change";
    case "decision": return "compass";
    case "backlog": return "inbox";
    case "release": return "release";
    case "session": return "clock";
    case "feedback": return "message";
    case "product-note": return "file";
    default: return "layers";
  }
}

const iconPaths: Record<string, string> = {
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
  inbox: '<path d="M4 4h16v16H4zM4 13h5l1 3h4l1-3h5M8 8h8"/>',
  change: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/>',
  message: '<path d="M21 4H3v13h5v4l5-4h8V4ZM7 8h10M7 12h6"/>',
  search: '<path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/>',
  "theme-light":
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5m0 14v2.5M4.57 4.57 6.34 6.34m11.32 11.32 1.77 1.77M2.5 12H5m14 0h2.5M4.57 19.43l1.77-1.77M17.66 6.34l1.77-1.77"/>',
  "theme-dark": '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  "chevron-left": '<path d="m14 7-5 5 5 5"/>',
  "chevron-right": '<path d="m10 7 5 5-5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  file: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  spark:
    '<path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"/><path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75.75-2.25Z"/>',
  graph:
    '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="10" cy="18" r="2"/><path d="m8 6.5 8 1M7 8l2 8m3-1 5-5"/>',
  release:
    '<path d="M14 5c2.5-2 5-2 5-2s0 2.5-2 5l-5 5-4-4 6-4Z"/><path d="m8 9-3 1-2 3 5 1m4-1 1 5 3-2 1-4M7 17l-2 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  rows: '<path d="M4 5h16M4 9h16M4 13h16M4 17h16"/>',
  filter: '<path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  rss: '<path d="M5 19a1 1 0 1 0 0-.01M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/>',
  map: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v5m0 7v5M3.5 12h5m7 0h5"/>',
};

function iconSprite(): string {
  return `<svg aria-hidden="true" style="display:none">${Object.entries(iconPaths)
    .map(([name, paths]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${paths}</symbol>`)
    .join("")}</svg>`;
}

function icon(name: string, attrs = ""): string {
  return `<svg class="ui-icon"${attrs ? ` ${attrs}` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

interface ProseSegment {
  readonly text: string;
  readonly code: boolean;
  /** The segment as written, with a code span's backticks. */
  readonly raw: string;
}

interface ProseLine {
  readonly segments: readonly ProseSegment[];
  /** Offset of the first backtick run that opens no span, or -1. Everything from it on is literal. */
  readonly unpairedAt: number;
}

/**
 * Splits one line of prose into literal text and Markdown code spans in one
 * pass over its backtick runs. A run opens a span that the next run of the
 * same length closes, runs of other lengths in between are content, and a run
 * with no closer stays literal, so `` `ledger ready` `` shows its inner
 * backticks. One space of padding on both sides of a span is dropped.
 */
function scanProseLine(line: string): ProseLine {
  const runs: { readonly start: number; readonly length: number }[] = [];
  for (let index = 0; index < line.length; ) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < line.length && line[end] === "`") end += 1;
    runs.push({ start: index, length: end - index });
    index = end;
  }
  const closerOf = new Array<number>(runs.length).fill(-1);
  const nextByLength = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const length = runs[index]!.length;
    closerOf[index] = nextByLength.get(length) ?? -1;
    nextByLength.set(length, index);
  }
  const segments: ProseSegment[] = [];
  let unpairedAt = -1;
  let cursor = 0;
  for (let index = 0; index < runs.length; ) {
    const open = runs[index]!;
    const closer = closerOf[index]!;
    if (closer === -1) {
      if (unpairedAt === -1) unpairedAt = open.start;
      index += 1;
      continue;
    }
    const close = runs[closer]!;
    if (open.start > cursor) {
      const text = line.slice(cursor, open.start);
      segments.push({ text, code: false, raw: text });
    }
    const code = line.slice(open.start + open.length, close.start);
    const padded = code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "";
    segments.push({ text: padded ? code.slice(1, -1) : code, code: true, raw: line.slice(open.start, close.start + close.length) });
    cursor = close.start + close.length;
    index = closer + 1;
  }
  if (cursor < line.length) {
    const text = line.slice(cursor);
    segments.push({ text, code: false, raw: text });
  }
  return { segments, unpairedAt };
}

/** Marks a code span's place in `plainProse`; record text that already holds it is left as written. */
const codePlaceholder = "\u0000";

/**
 * Markdown prose as the plain text a one-line excerpt shows: list markers and
 * paired `**strong**` markers are dropped, including strong text around a code
 * span. Code spans keep their backticks and content, so `src/**` survives.
 */
export function plainProse(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      const { segments } = scanProseLine(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
      // Code spans become placeholders while strong markers pair up, so a pair may enclose one.
      if (line.includes(codePlaceholder)) return segments.map((segment) => segment.raw).join("");
      const codes: string[] = [];
      const masked = segments
        .map((segment) => (segment.code ? `${codePlaceholder}${codes.push(segment.raw) - 1}${codePlaceholder}` : segment.text))
        .join("");
      return masked
        .replace(/\*\*(?=\S)([^*]+?)(?<=\S)\*\*/g, "$1")
        .replace(new RegExp(`${codePlaceholder}(\\d+)${codePlaceholder}`, "g"), (_, index: string) => codes[Number(index)] ?? "");
    })
    .join("\n");
}

/** Record prose as HTML: every segment is escaped, and code spans become inline code, so nothing in a record is markup. */
export function inlineCodeHtml(value: string): string {
  return value
    .split("\n")
    .map((line) =>
      scanProseLine(line)
        .segments.map((segment) => (segment.code ? `<code class="inline-code">${escapeHtml(segment.text)}</code>` : escapeHtml(segment.text)))
        .join(""),
    )
    .join("\n");
}

/**
 * Text cut off inside a code span, such as a shortened summary, ends before
 * that span instead of on a stray backtick. When the span is the whole text,
 * the text is kept and the stray backtick renders literally.
 */
export function withoutOpenCodeSpan(value: string): string {
  let offset = 0;
  for (const line of value.split("\n")) {
    const { unpairedAt } = scanProseLine(line);
    if (unpairedAt !== -1) {
      const kept = value.slice(0, offset + unpairedAt);
      return kept.trim() ? kept : value;
    }
    offset += line.length + 1;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
