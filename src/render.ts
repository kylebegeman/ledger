import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export interface LedgerRenderedDocument extends NormalizedLedgerDocument {
  readonly source: string;
}

export interface LedgerStaticReaderModel {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly project: string;
  readonly documents: readonly LedgerRenderedDocument[];
  readonly stats: {
    readonly documents: number;
    readonly changes: number;
    readonly backlog: number;
    readonly decisions: number;
    readonly releases: number;
  };
}

export interface RenderStaticReaderResult {
  readonly outputPath: string;
  readonly documents: number;
}

export function buildStaticReaderModel(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerStaticReaderModel {
  const renderedDocuments = documents
    .map((document) => ({
      ...normalizeDocument(document),
      source: document.raw,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    documents: renderedDocuments,
    stats: {
      documents: renderedDocuments.length,
      changes: renderedDocuments.filter((document) => document.kind === "change").length,
      backlog: renderedDocuments.filter((document) => document.kind === "backlog").length,
      decisions: renderedDocuments.filter((document) => document.kind === "decision").length,
      releases: renderedDocuments.filter((document) => document.kind === "release").length,
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
  await writeFile(outputPath, renderStaticReaderHtml(model), "utf8");
  return {
    outputPath: normalizeOutputPath(workspace, outputPath),
    documents: model.documents.length,
  };
}

export function renderStaticReaderHtml(model: LedgerStaticReaderModel): string {
  const areas = uniqueSorted(model.documents.flatMap((document) => document.areas));
  const statuses = uniqueSorted(model.documents.map((document) => document.status));
  const releases = uniqueSorted(
    model.documents.map((document) => document.release).filter((value): value is string => Boolean(value)),
  );

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
    .paths, .source { margin-top: 12px; }
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
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(model.project)} Ledger</h1>
    <p class="subhead">Generated ${escapeHtml(model.generatedAt)} from Ledger source Markdown.</p>
    <div class="stats">
      ${stat("Documents", model.stats.documents)}
      ${stat("Changes", model.stats.changes)}
      ${stat("Backlog", model.stats.backlog)}
      ${stat("Decisions", model.stats.decisions)}
      ${stat("Releases", model.stats.releases)}
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
      status: document.getElementById("status"),
      area: document.getElementById("area"),
      release: document.getElementById("release")
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
      if (kind !== "all" && entry.dataset.kind !== kind) return false;
      if (status !== "all" && entry.dataset.status !== status) return false;
      if (area !== "all" && !entry.dataset.areas.split(" ").includes(area)) return false;
      if (release === "__none" && entry.dataset.release !== "") return false;
      if (release !== "all" && release !== "__none" && entry.dataset.release !== release) return false;
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
    ...document.files,
    ...document.symbols,
    document.source,
  ]
    .join(" ")
    .toLowerCase();
  return `<article class="entry" data-kind="${escapeHtml(document.kind)}" data-status="${escapeHtml(document.status)}" data-areas="${escapeHtml(document.areas.join(" "))}" data-release="${escapeHtml(document.release ?? "")}" data-search="${escapeHtml(searchText)}">
          <h3>${escapeHtml(document.id)}: ${escapeHtml(document.title)}</h3>
          <div class="meta">
            <span class="pill">${escapeHtml(document.kind)}</span>
            <span class="pill">${escapeHtml(document.status)}</span>
            ${document.release ? `<span class="pill">${escapeHtml(document.release)}</span>` : ""}
            ${document.areas.map((area) => `<span class="pill">${escapeHtml(area)}</span>`).join("")}
          </div>
          <p><strong>Source:</strong> ${escapeHtml(document.path)}</p>
          ${detailList("Files", document.files)}
          ${detailList("Symbols", document.symbols)}
          ${detailList("Docs", document.docs)}
          <details class="source">
            <summary>Markdown Source</summary>
            <pre>${escapeHtml(document.source)}</pre>
          </details>
        </article>`;
}

function detailList(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<details class="paths">
            <summary>${escapeHtml(label)} (${values.length})</summary>
            <ul>${values.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join("")}</ul>
          </details>`;
}

function stat(label: string, value: number): string {
  return `<div class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function option(value: string, label: string): string {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
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
