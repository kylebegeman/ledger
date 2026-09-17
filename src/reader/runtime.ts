/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The static reader's browser runtime. Bundled by esbuild into
 * dist/reader/runtime.js and inlined into index.html by the renderer, so the
 * reader keeps working from a file: URL and under any static host. Search
 * scoring is imported from the same module `ledger search` uses.
 */
import { coveragePatternMatches, isCoveragePattern } from "../pathPatterns.js";
import { fuzzyScore, scoreSearchFields, type SearchableFields } from "../searchCore.js";

interface IndexDocument {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly status?: string;
  readonly terms?: string;
  readonly fields?: SearchableFields;
}

/** Views of one thing's records: a path or pattern, a symbol, or the records linking to a record. */
type EntityType = "file" | "symbol" | "linked";

interface EntityView {
  readonly type: EntityType;
  readonly value: string;
}

/** What a panel or palette item can show: an entity view, or the area or release filter. */
type EntityTarget = EntityType | "area" | "release";

type CommandItem =
  | { readonly type: "record"; readonly document: IndexDocument; readonly score: number }
  | { readonly type: "entity"; readonly entity: EntityTarget; readonly value: string; readonly count: number };

/** How an entry relates to the entity in view: it names it, or one of its patterns covers it. */
type EntityRelation = "exact" | "pattern";

interface EntryRefs {
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly docs: readonly string[];
  readonly links: readonly { readonly type: string; readonly id: string }[];
  readonly areas: readonly string[];
}

type ControlKey =
  | "search"
  | "kind"
  | "warning"
  | "missingRef"
  | "duplicate"
  | "coverage"
  | "status"
  | "area"
  | "release"
  | "tag";

type FilterKey = Exclude<ControlKey, "search">;

const filterLabels: Readonly<Record<FilterKey, string>> = {
  kind: "Type",
  status: "Status",
  area: "Area",
  release: "Release",
  tag: "Tag",
  warning: "Warnings",
  missingRef: "References",
  duplicate: "Identifiers",
  coverage: "Coverage",
};

const filterKeys = Object.keys(filterLabels) as readonly FilterKey[];
const defaultPerPage = "25";
const searchDebounceMs = 140;
const transitionWatchdogMs = 600;
const maxNamedTransitions = 28;
const entityTypes: readonly EntityType[] = ["file", "symbol", "linked"];
const entityLabels: Readonly<Record<EntityTarget, string>> = {
  file: "File",
  symbol: "Symbol",
  linked: "Linked to",
  area: "Area",
  release: "Release",
};
const maxPaletteEntities = 3;
const maxPaletteItems = 9;
const copiedLabelMs = 1600;

let searchIndexPromise: Promise<readonly IndexDocument[]> | undefined;
let filterRequest = 0;
let commandItems: readonly CommandItem[] = [];
let commandSelection = 0;
let searchDebounce: ReturnType<typeof setTimeout> | undefined;
let currentPage = 1;
let pendingResultsScroll = false;
let openRecordId = "";
let entityView: EntityView | undefined;
let entityMatches = new Map<HTMLElement, EntityRelation>();

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function required<T extends HTMLElement>(id: string): T {
  const element = byId<T>(id);
  if (!element) throw new Error(`Ledger reader: missing #${id}`);
  return element;
}

interface SearchIndexManifest {
  readonly shards: readonly string[];
  readonly documents: number;
}

async function fetchJson(href: string): Promise<unknown> {
  const response = await fetch(href);
  return response.ok ? ((await response.json()) as unknown) : [];
}

/** Load search-index.json, following the shard manifest when the index was sharded. */
function loadSearchIndex(): Promise<readonly IndexDocument[]> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetchJson("search-index.json")
      .then(async (index) => {
        if (Array.isArray(index)) return index as IndexDocument[];
        const manifest = index as Partial<SearchIndexManifest> | null;
        if (!manifest || !Array.isArray(manifest.shards)) return [];
        const shards = await Promise.all(manifest.shards.map((href) => fetchJson(href)));
        return shards.flatMap((shard) => (Array.isArray(shard) ? (shard as IndexDocument[]) : []));
      })
      .catch(() => []);
  }
  return searchIndexPromise;
}

function scoreSearchDocument(query: string, document: IndexDocument): number {
  if (!document.fields) return fuzzyScore(query, document.terms || "");
  // The sidecar omits `terms`; leaving it undefined lets the shared scorer derive it as `ledger search` does.
  return scoreSearchFields({ terms: document.terms, fields: document.fields }, query).score;
}

/** Palette entries built from the rendered rows, for readers whose search sidecar cannot load, such as a file: URL. */
function fallbackCommandItems(query: string): readonly CommandItem[] {
  const tokens = query.split(/\s+/).filter((token) => token.length > 0);
  return entries
    .filter((entry) => {
      const blob = fallbackBlobs.get(entry) || "";
      return tokens.every((token) => blob.includes(token));
    })
    .map((entry) => ({
      type: "record" as const,
      document: {
        id: entry.dataset.id || "",
        title: entry.querySelector("h3")?.textContent || entry.dataset.id || "",
        kind: entry.dataset.kind,
        status: entry.dataset.status,
      },
      score: 0,
    }));
}

async function searchMatches(query: string): Promise<Map<string, number> | undefined> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return undefined;
  const index = await loadSearchIndex();
  if (!Array.isArray(index) || index.length === 0) return undefined;
  const scored = index
    .map((document) => ({ id: document.id, score: scoreSearchDocument(trimmed, document) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return new Map(scored.map((result) => [result.id, result.score]));
}

const controls: Readonly<Record<ControlKey, HTMLInputElement | HTMLSelectElement | null>> = {
  search: byId<HTMLInputElement>("search"),
  kind: byId<HTMLSelectElement>("kind"),
  warning: byId<HTMLSelectElement>("warning"),
  missingRef: byId<HTMLSelectElement>("missingRef"),
  duplicate: byId<HTMLSelectElement>("duplicate"),
  coverage: byId<HTMLSelectElement>("coverage"),
  status: byId<HTMLSelectElement>("status"),
  area: byId<HTMLSelectElement>("area"),
  release: byId<HTMLSelectElement>("release"),
  tag: byId<HTMLSelectElement>("tag"),
};

function isControlKey(value: string): value is ControlKey {
  return value === "search" || (filterKeys as readonly string[]).includes(value);
}

function controlValue(key: ControlKey): string {
  const control = controls[key];
  return control ? control.value : "all";
}

const searchInput = required<HTMLInputElement>("search");
const entries = Array.from(document.querySelectorAll<HTMLElement>(".entry"));
const entriesContainer = required<HTMLElement>("entries");
const releaseFeed = entriesContainer.classList.contains("release-feed");
const resultCount = required<HTMLElement>("result-count");
const resultNoun = resultCount.dataset.resultNoun || "record";
const filterStatus = byId<HTMLElement>("filter-status");
const empty = required<HTMLElement>("empty");
const searchClear = required<HTMLElement>("search-clear");
const advancedFilters = document.querySelector<HTMLDetailsElement>(".advanced-filters");
const perPage = byId<HTMLSelectElement>("per-page");
const pagination = byId<HTMLElement>("pagination");
const library = byId<HTMLElement>("library");
const recordPanel = byId<HTMLElement>("record-panel");
const recordPanelBody = byId<HTMLElement>("record-panel-body");
const recordPanelClose = byId<HTMLElement>("record-panel-close");

function perPageSize(): number {
  if (!perPage || perPage.value === "all") return 0;
  const parsed = parseInt(perPage.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function datasetList(entry: HTMLElement, key: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(entry.dataset[key] || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/** A reference list the renderer wrote one value per line. */
function datasetLines(entry: HTMLElement, key: string): readonly string[] {
  return (entry.dataset[key] || "").split("\n").filter((value) => value.length > 0);
}

function readRefs(entry: HTMLElement): EntryRefs {
  return {
    files: datasetLines(entry, "files"),
    symbols: datasetLines(entry, "symbols"),
    docs: datasetLines(entry, "docs"),
    links: datasetLines(entry, "links").map((link) => {
      const separator = link.indexOf(":");
      return { type: link.slice(0, separator), id: link.slice(separator + 1) };
    }),
    areas: datasetList(entry, "areas"),
  };
}

const entryRefs = new Map(entries.map((entry) => [entry, readRefs(entry)]));

/** Offline search text: the title, the rendered search terms, and the entry's references. */
const fallbackBlobs = new Map(
  entries.map((entry) => {
    const refs = entryRefs.get(entry)!;
    const references = [...refs.files, ...refs.symbols, ...refs.docs, ...refs.links.map((link) => link.id)].join(" ");
    return [entry, `${entry.querySelector("h3")?.textContent || ""} ${entry.dataset.search || ""} ${references}`.toLowerCase()];
  }),
);

function entityRelation(refs: EntryRefs, view: EntityView): EntityRelation | undefined {
  if (view.type === "symbol") return refs.symbols.includes(view.value) ? "exact" : undefined;
  if (view.type === "linked") return refs.links.some((link) => link.id === view.value) ? "exact" : undefined;
  if (refs.files.includes(view.value) || refs.docs.includes(view.value)) return "exact";
  // A pattern in view gathers the records naming a path under it; a path in view, the records whose patterns cover it.
  const covered = isCoveragePattern(view.value)
    ? refs.files.some((file) => !isCoveragePattern(file) && coveragePatternMatches(file, view.value))
    : refs.files.some((file) => isCoveragePattern(file) && coveragePatternMatches(view.value, file));
  return covered ? "pattern" : undefined;
}

function setEntityView(view: EntityView | undefined): void {
  entityView = view;
  entityMatches = new Map();
  if (!view) return;
  for (const [entry, refs] of entryRefs) {
    const relation = entityRelation(refs, view);
    if (relation) entityMatches.set(entry, relation);
  }
}

function matches(entry: HTMLElement, matchedScores: Map<string, number> | undefined, searchTokens: readonly string[]): boolean {
  if (matchedScores && !matchedScores.has(entry.dataset.id || "")) return false;
  if (!matchedScores && searchTokens.length > 0) {
    const blob = fallbackBlobs.get(entry) || "";
    if (!searchTokens.every((token) => blob.includes(token))) return false;
  }
  const kind = controlValue("kind");
  const status = controlValue("status");
  const area = controlValue("area");
  const release = controlValue("release");
  const warning = controlValue("warning");
  const missingRef = controlValue("missingRef");
  const duplicate = controlValue("duplicate");
  const coverage = controlValue("coverage");
  const tag = controlValue("tag");
  if (entityView && !entityMatches.has(entry)) return false;
  if (kind !== "all" && entry.dataset.kind !== kind) return false;
  if (status !== "all" && entry.dataset.status !== status) return false;
  if (area !== "all" && !datasetList(entry, "areas").includes(area)) return false;
  if (release === "__none" && entry.dataset.release !== "") return false;
  if (release !== "all" && release !== "__none" && entry.dataset.release !== release) return false;
  if (warning === "with" && entry.dataset.warnings === "0") return false;
  if (warning === "without" && entry.dataset.warnings !== "0") return false;
  if (missingRef === "missing" && entry.dataset.missingRefs !== "true") return false;
  if (missingRef === "ok" && entry.dataset.missingRefs === "true") return false;
  if (duplicate === "duplicate" && entry.dataset.duplicateId !== "true") return false;
  if (duplicate === "unique" && entry.dataset.duplicateId === "true") return false;
  if (coverage !== "all" && entry.dataset.coverage !== coverage) return false;
  if (tag !== "all" && !datasetList(entry, "tags").includes(tag)) return false;
  return true;
}

interface ViewTransitionLike {
  /** Rejects when the browser skips the animation, as in a hidden document; the update still runs. */
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
  skipTransition(): void;
}

function startViewTransition(update: () => void): ViewTransitionLike | undefined {
  const starter = (document as Document & { startViewTransition?: (callback: () => void) => ViewTransitionLike }).startViewTransition;
  return typeof starter === "function" ? starter.call(document, update) : undefined;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts started transitions so an earlier one's cleanup leaves the names a later one has just set. */
let transitionGeneration = 0;
/** Entries the latest transition named; a newer transition clears the ones it does not name itself. */
let namedEntries: readonly HTMLElement[] = [];

function runTransition(update: () => void, candidates: readonly HTMLElement[]): void {
  if (prefersReducedMotion()) {
    update();
    return;
  }
  const nearViewport = window.innerHeight * 2;
  const named: HTMLElement[] = [];
  const usedNames = new Set<string>();
  for (const entry of candidates) {
    if (named.length >= maxNamedTransitions) break;
    const box = entry.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.bottom < -nearViewport || box.top > nearViewport) continue;
    const name = `rec-${(entry.dataset.id || "").replace(/[^A-Za-z0-9_-]/g, "-")}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    entry.style.viewTransitionName = name;
    named.push(entry);
  }
  for (const entry of namedEntries) if (!named.includes(entry)) entry.style.viewTransitionName = "";
  namedEntries = named;
  const generation = (transitionGeneration += 1);
  const clearNames = () => {
    if (generation !== transitionGeneration) return;
    for (const entry of named) entry.style.viewTransitionName = "";
    namedEntries = [];
  };
  const transition = startViewTransition(update);
  if (!transition) {
    clearNames();
    update();
    return;
  }
  // A skipped animation only rejects `ready`; `finished` still rejects when the update itself throws.
  void transition.ready.catch(() => undefined);
  const watchdog = setTimeout(() => transition.skipTransition(), transitionWatchdogMs);
  void transition.finished.finally(() => {
    clearTimeout(watchdog);
    clearNames();
  });
}

function pluralize(value: number, noun: string): string {
  if (value === 1) return `${value} ${noun}`;
  return `${value} ${noun}${noun.endsWith("ch") ? "es" : "s"}`;
}

function markYearBreaks(pageList: readonly HTMLElement[], ranked: boolean): void {
  if (!releaseFeed) return;
  let previousYear = "";
  for (const entry of pageList) {
    const year = entry.dataset.year || "";
    entry.classList.toggle("year-start", !ranked && year !== "" && year !== previousYear);
    if (year) previousYear = year;
  }
}

async function applyFilters(syncUrl = true): Promise<void> {
  const request = ++filterRequest;
  const search = searchInput.value.trim().toLowerCase();
  entriesContainer.setAttribute("aria-busy", "true");
  const matchedScores = await searchMatches(search);
  if (request !== filterRequest) return;
  const searchTokens = search.split(/\s+/).filter(Boolean);
  const sortedEntries = matchedScores
    ? [...entries].sort(
        (left, right) => (matchedScores.get(right.dataset.id || "") || 0) - (matchedScores.get(left.dataset.id || "") || 0),
      )
    : entries;
  const visibility = new Map(entries.map((entry) => [entry, matches(entry, matchedScores, searchTokens)]));
  const rankById = matchedScores ? new Map([...matchedScores.keys()].map((id, index) => [id, index + 1])) : undefined;
  const matchedList = sortedEntries.filter((entry) => visibility.get(entry) === true);
  const total = matchedList.length;
  const per = perPageSize();
  const pageCount = per > 0 ? Math.max(1, Math.ceil(total / per)) : 1;
  if (currentPage > pageCount) currentPage = pageCount;
  if (currentPage < 1) currentPage = 1;
  const start = per > 0 ? (currentPage - 1) * per : 0;
  const pageList = per > 0 ? matchedList.slice(start, start + per) : matchedList;
  const pageSet = new Set(pageList);
  const candidates = entries.filter((entry) => !entry.hidden || pageSet.has(entry));
  const orderChanged = sortedEntries.some((entry, index) => entriesContainer.children[index] !== entry);
  const visibilityChanged = entries.some((entry) => entry.hidden === pageSet.has(entry));
  const applyUpdate = () => {
    if (orderChanged) for (const entry of sortedEntries) entriesContainer.appendChild(entry);
    for (const entry of entries) {
      const show = pageSet.has(entry);
      entry.hidden = !show;
      const scoreLabel = entry.querySelector<HTMLElement>("[data-score-label]");
      if (scoreLabel) {
        const rank = rankById ? rankById.get(entry.dataset.id || "") : undefined;
        scoreLabel.hidden = !rank;
        scoreLabel.textContent = rank ? (rank === 1 ? "Top match" : `#${rank}`) : "";
      }
    }
    markYearBreaks(pageList, Boolean(matchedScores));
    resultCount.textContent = search && matchedScores ? pluralize(total, "ranked match") : pluralize(total, resultNoun);
    renderEntityBar();
    renderPagination(total, pageCount, per);
    empty.hidden = total !== 0;
    empty.dataset.emptyState = search || activeFilterCount() > 0 ? "filtered" : "bare";
    entriesContainer.setAttribute("aria-busy", "false");
  };
  if (orderChanged || visibilityChanged) runTransition(applyUpdate, candidates);
  else applyUpdate();
  searchClear.hidden = searchInput.value.length === 0;
  updateFacetButtons();
  updateFilterPills();
  announceFilterStatus(total, pageCount, search, matchedScores);
  if (advancedFilters) {
    advancedFilters.open = (["warning", "missingRef", "duplicate", "coverage"] as const).some((key) => controlValue(key) !== "all");
  }
  if (syncUrl) writeUrlState();
  if (pendingResultsScroll) {
    pendingResultsScroll = false;
    library?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}

interface PageButtonOptions {
  readonly className?: string;
  readonly html?: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly nav?: boolean;
}

function renderPagination(total: number, pageCount: number, per: number): void {
  if (!pagination) return;
  if (pageCount <= 1) {
    pagination.hidden = true;
    pagination.replaceChildren();
    return;
  }
  pagination.hidden = false;
  pagination.replaceChildren();
  const summary = document.createElement("span");
  summary.className = "pagination-summary";
  const first = (currentPage - 1) * per + 1;
  const last = Math.min(total, currentPage * per);
  summary.textContent = `${first}–${last} of ${total}`;
  const pages = document.createElement("div");
  pages.className = "pagination-pages";
  const chevronUse = '<svg class="ui-icon" aria-hidden="true"><use href="#i-chevron"/></svg>';
  const addPageButton = (page: number, options: PageButtonOptions) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-button${options.className ? ` ${options.className}` : ""}`;
    if (options.html) button.innerHTML = options.html;
    else button.textContent = String(page);
    if (options.ariaLabel) button.setAttribute("aria-label", options.ariaLabel);
    if (!options.nav && page === currentPage) button.setAttribute("aria-current", "page");
    if (options.disabled) button.disabled = true;
    else {
      button.addEventListener("click", () => {
        currentPage = page;
        pendingResultsScroll = true;
        void applyFilters();
      });
    }
    pages.appendChild(button);
  };
  const addGap = () => {
    const gap = document.createElement("span");
    gap.className = "page-gap";
    gap.textContent = "…";
    pages.appendChild(gap);
  };
  addPageButton(Math.max(1, currentPage - 1), { className: "page-prev", html: chevronUse, ariaLabel: "Previous page", disabled: currentPage === 1, nav: true });
  let previous = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const nearCurrent = Math.abs(page - currentPage) <= 1;
    if (pageCount > 7 && page !== 1 && page !== pageCount && !nearCurrent) continue;
    if (previous && page - previous > 1) addGap();
    addPageButton(page, {});
    previous = page;
  }
  addPageButton(Math.min(pageCount, currentPage + 1), { className: "page-next", html: chevronUse, ariaLabel: "Next page", disabled: currentPage === pageCount, nav: true });
  pagination.append(summary, pages);
}

function updateFacetButtons(): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-filter-field]")) {
    const field = button.dataset.filterField || "";
    const control = isControlKey(field) ? controls[field] : null;
    button.setAttribute("aria-pressed", String(Boolean(control && control.value === button.dataset.filterValue)));
  }
}

function activeFilterCount(): number {
  return filterKeys.filter((key) => controlValue(key) !== "all").length + (entityView ? 1 : 0);
}

const entityBar = byId<HTMLElement>("entity-bar");
const entityKind = byId<HTMLElement>("entity-kind");
const entityValue = byId<HTMLElement>("entity-value");
const entityCount = byId<HTMLElement>("entity-count");

/** Names the entity in view and how many records it has; the counts ignore the other filters. */
function renderEntityBar(): void {
  if (!entityBar || !entityKind || !entityValue || !entityCount) return;
  entityBar.hidden = !entityView;
  if (!entityView) return;
  const view = entityView;
  entityKind.textContent = entityLabels[view.type];
  const code = document.createElement("code");
  code.textContent = view.value;
  const target = view.type === "linked" ? recordEntry(view.value) : undefined;
  if (target) {
    const open = document.createElement("button");
    open.type = "button";
    open.dataset.openRecord = view.value;
    const title = document.createElement("span");
    title.textContent = target.querySelector(".entry-title")?.textContent || "";
    open.append(code, title);
    entityValue.replaceChildren(open);
  } else {
    entityValue.replaceChildren(code);
  }
  const exact = [...entityMatches.values()].filter((relation) => relation === "exact").length;
  const covered = entityMatches.size - exact;
  const verb = view.type === "linked" ? (exact === 1 ? "links here" : "link here") : exact === 1 ? "names it" : "name it";
  entityCount.textContent = `${pluralize(exact, "record")} ${verb}${covered > 0 ? `, ${covered} more by pattern` : ""}`;
}

/** Shows an entity view, or sets the area or release filter, from a panel or palette item. */
function showEntity(target: string | undefined, value: string | undefined): void {
  if (!target || value === undefined) return;
  if (target === "area" || target === "release") {
    const control = controls[target];
    if (!control || !hasOption(control, value)) return;
    control.value = value;
  } else if ((entityTypes as readonly string[]).includes(target)) {
    setEntityView({ type: target as EntityType, value });
  } else {
    return;
  }
  closePalette();
  closePanel(false, false);
  currentPage = 1;
  pendingResultsScroll = true;
  void applyFilters(false).then(() => {
    writeUrlState(true);
    // Focus lands on what names the new view: the entity bar, or the result count for a filter.
    (entityView && entityBar ? entityBar : resultCount).focus({ preventScroll: true });
  });
}

function announceFilterStatus(total: number, pageCount: number, search: string, matchedScores: Map<string, number> | undefined): void {
  if (!filterStatus) return;
  const noun = search && matchedScores ? "ranked match" : resultNoun;
  let message = pluralize(total, noun);
  if (pageCount > 1) message += `, page ${currentPage} of ${pageCount}`;
  const active = activeFilterCount();
  if (active > 0) message += `, ${pluralize(active, "active filter")}`;
  filterStatus.textContent = message;
}

function updateFilterPills(): void {
  for (const key of filterKeys) {
    const control = controls[key];
    if (control) control.classList.toggle("is-active", control.value !== "all");
  }
}

function writeUrlState(push = false): void {
  const url = new URL(window.location.href);
  const values: Record<string, string> = { q: searchInput.value };
  for (const key of filterKeys) values[key] = controlValue(key);
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== "all") url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (currentPage > 1) url.searchParams.set("page", String(currentPage));
  else url.searchParams.delete("page");
  if (perPage && perPage.value !== defaultPerPage) url.searchParams.set("per", perPage.value);
  else url.searchParams.delete("per");
  if (openRecordId) url.searchParams.set("record", openRecordId);
  else url.searchParams.delete("record");
  for (const type of entityTypes) {
    if (entityView?.type === type) url.searchParams.set(type, entityView.value);
    else url.searchParams.delete(type);
  }
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function recordEntry(id: string): HTMLElement | undefined {
  return entries.find((candidate) => candidate.dataset.id === id);
}

const detailChunks = new Map<string, Promise<Record<string, string>>>();

/** Fetch a detail chunk once; the promise rejects when the chunk cannot be read, for example from a file: URL. */
function loadDetailChunk(href: string): Promise<Record<string, string>> {
  let chunk = detailChunks.get(href);
  if (!chunk) {
    chunk = fetch(href).then(async (response) => {
      if (!response.ok) throw new Error(`detail chunk ${href} returned ${response.status}`);
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`detail chunk ${href} is not an object`);
      return parsed as Record<string, string>;
    });
    chunk.catch(() => detailChunks.delete(href));
    detailChunks.set(href, chunk);
  }
  return chunk;
}

/** A detail panel built from the entry row alone, shown while a chunk loads or when it cannot load. */
function fallbackDetail(entry: HTMLElement, message: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("h2");
  title.className = "record-panel-title";
  title.textContent = entry.querySelector(".entry-title")?.textContent || entry.dataset.id || "";
  const note = document.createElement("p");
  note.className = "entry-summary";
  note.textContent = message;
  fragment.append(title, note);
  const source = entry.dataset.source;
  if (source) {
    const link = document.createElement("a");
    link.href = source;
    link.textContent = "Open the source record";
    const paragraph = document.createElement("p");
    paragraph.append(link);
    fragment.append(paragraph);
  }
  return fragment;
}

function detailFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

function openPanel(id: string, syncUrl = true, push = false): boolean {
  if (!recordPanel || !recordPanelBody) return false;
  const entry = recordEntry(id);
  if (!entry) return false;
  const template = entry.querySelector<HTMLTemplateElement>("template.entry-detail");
  const chunkHref = entry.dataset.detail;
  if (!template && !chunkHref) return false;
  if (template) {
    recordPanelBody.replaceChildren(template.content.cloneNode(true));
    addCopyActions(recordPanelBody);
    addReferenceLists(recordPanelBody, entry);
  } else if (chunkHref) {
    const body = recordPanelBody;
    body.replaceChildren(fallbackDetail(entry, "Loading record details."));
    addReferenceLists(body, entry);
    loadDetailChunk(chunkHref)
      .then((chunk) => {
        if (openRecordId !== id) return;
        const html = chunk[id];
        body.replaceChildren(html ? detailFragment(html) : fallbackDetail(entry, "This record's details are missing from its chunk."));
        if (html) addCopyActions(body);
        addReferenceLists(body, entry);
      })
      .catch(() => {
        if (openRecordId !== id) return;
        body.replaceChildren(
          fallbackDetail(entry, "Record details load when the reader is served over HTTP, for example with ledger serve."),
        );
        addReferenceLists(body, entry);
      });
  }
  recordPanelBody.scrollTop = 0;
  const wasOpen = openRecordId !== "";
  openRecordId = id;
  recordPanel.classList.add("open");
  for (const candidate of entries) candidate.classList.toggle("is-open", candidate.dataset.id === id);
  if (syncUrl) writeUrlState(push || !wasOpen);
  recordPanel.focus({ preventScroll: true });
  return true;
}

function closePanel(syncUrl = true, restoreFocus = true): void {
  if (!openRecordId || !recordPanel) return;
  const previous = recordEntry(openRecordId);
  openRecordId = "";
  recordPanel.classList.remove("open");
  for (const candidate of entries) candidate.classList.remove("is-open");
  if (syncUrl) writeUrlState();
  if (!restoreFocus) return;
  const link = previous && !previous.hidden ? previous.querySelector<HTMLElement>(".entry-link") : null;
  if (link) link.focus();
  else searchInput.focus();
}

function hasOption(control: HTMLInputElement | HTMLSelectElement, value: string): boolean {
  return control instanceof HTMLSelectElement && Array.from(control.options).some((option) => option.value === value);
}

function readUrlState(): void {
  const params = new URL(window.location.href).searchParams;
  searchInput.value = params.get("q") || "";
  for (const key of filterKeys) {
    const value = params.get(key);
    const control = controls[key];
    if (value && control && hasOption(control, value)) control.value = value;
  }
  const per = params.get("per");
  if (per && perPage && hasOption(perPage, per)) perPage.value = per;
  const page = parseInt(params.get("page") || "1", 10);
  currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  const entityType = entityTypes.find((type) => params.get(type));
  const entityValueParam = entityType ? params.get(entityType) || "" : "";
  if (entityType !== entityView?.type || entityValueParam !== entityView?.value) {
    setEntityView(entityType ? { type: entityType, value: entityValueParam } : undefined);
  }
  const record = params.get("record") || "";
  if (record !== openRecordId) {
    if (record) openPanel(record, false);
    else closePanel(false);
  }
}

function resetFilters(): void {
  clearTimeout(searchDebounce);
  searchInput.value = "";
  setEntityView(undefined);
  for (const key of filterKeys) {
    const control = controls[key];
    if (control) control.value = "all";
  }
  currentPage = 1;
  void applyFilters();
  searchInput.focus();
}

for (const [key, control] of Object.entries(controls)) {
  if (!control) continue;
  if (key === "search") {
    control.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        currentPage = 1;
        void applyFilters();
      }, searchDebounceMs);
    });
  } else {
    control.addEventListener("input", () => {
      currentPage = 1;
      void applyFilters();
    });
  }
}
perPage?.addEventListener("input", () => {
  currentPage = 1;
  void applyFilters();
});
for (const button of document.querySelectorAll<HTMLElement>("[data-filter-field]")) {
  button.addEventListener("click", () => {
    const field = button.dataset.filterField || "";
    const value = button.dataset.filterValue;
    if (!isControlKey(field) || value === undefined) return;
    const control = controls[field];
    if (!control) return;
    control.value = control.value === value ? "all" : value;
    currentPage = 1;
    void applyFilters();
  });
}
for (const button of document.querySelectorAll<HTMLElement>("[data-reset-filters]")) {
  button.addEventListener("click", resetFilters);
}
byId<HTMLElement>("entity-clear")?.addEventListener("click", () => {
  setEntityView(undefined);
  currentPage = 1;
  void applyFilters(false).then(() => {
    writeUrlState(true);
    resultCount.focus({ preventScroll: true });
  });
});
entityBar?.addEventListener("click", (event) => {
  const opener = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-open-record]") : null;
  if (opener?.dataset.openRecord) openPanel(opener.dataset.openRecord);
});
searchClear.addEventListener("click", () => {
  clearTimeout(searchDebounce);
  searchInput.value = "";
  currentPage = 1;
  void applyFilters();
  searchInput.focus();
});

const densityButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-density]"));
function setDensity(value: string | undefined, persist = true): void {
  const density = value === "compact" ? "compact" : "expanded";
  entriesContainer.classList.toggle("compact", density === "compact");
  for (const button of densityButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.density === density));
  }
  if (persist) {
    try {
      localStorage.setItem("ledger-density", density);
    } catch {
      // Storage may be unavailable; density stays per page load.
    }
  }
}
for (const button of densityButtons) {
  button.addEventListener("click", () => setDensity(button.dataset.density));
}
try {
  if (localStorage.getItem("ledger-density") === "compact") setDensity("compact", false);
} catch {
  // Storage may be unavailable.
}

const palette = required<HTMLDialogElement>("command-palette");
const paletteTrigger = required<HTMLElement>("search-trigger");
const paletteInput = required<HTMLInputElement>("command-search");
const paletteResults = required<HTMLElement>("command-results");
const paletteStatus = required<HTMLElement>("command-status");

async function openPalette(): Promise<void> {
  if (!palette.open) palette.showModal();
  paletteInput.setAttribute("aria-expanded", "true");
  paletteInput.value = searchInput.value;
  commandSelection = 0;
  await renderCommandResults();
  paletteInput.focus();
  paletteInput.select();
}

let entityCatalog: ReadonlyMap<string, { readonly entity: EntityTarget; readonly value: string; readonly count: number }> | undefined;

/** Every file, doc, symbol, and area the entries name, with how many entries name each. */
function paletteEntityCatalog(): NonNullable<typeof entityCatalog> {
  if (entityCatalog) return entityCatalog;
  const catalog = new Map<string, { entity: EntityTarget; value: string; count: number }>();
  const add = (entity: EntityTarget, value: string) => {
    const key = `${entity}\u0000${value}`;
    const existing = catalog.get(key);
    if (existing) existing.count += 1;
    else catalog.set(key, { entity, value, count: 1 });
  };
  for (const refs of entryRefs.values()) {
    for (const value of new Set([...refs.files, ...refs.docs])) add("file", value);
    for (const value of new Set(refs.symbols)) add("symbol", value);
    for (const value of new Set(refs.areas)) add("area", value);
  }
  entityCatalog = catalog;
  return catalog;
}

/** Up to three entities whose names contain the query: exact names first, then names or last segments that start with it. */
function paletteEntities(query: string): readonly CommandItem[] {
  if (query.length < 2) return [];
  const rank = (value: string): number => {
    const lower = value.toLowerCase();
    if (lower === query) return 3;
    const lastSegment = lower.split(/[/.:]/).pop() || "";
    if (lower.startsWith(query) || lastSegment.startsWith(query)) return 2;
    return lower.includes(query) ? 1 : 0;
  };
  return [...paletteEntityCatalog().values()]
    .map((item) => ({ item, rank: rank(item.value) }))
    .filter((candidate) => candidate.rank > 0)
    .sort((left, right) => right.rank - left.rank || right.item.count - left.item.count || left.item.value.localeCompare(right.item.value))
    .slice(0, maxPaletteEntities)
    .map(({ item }) => ({ type: "entity" as const, ...item }));
}

async function renderCommandResults(): Promise<void> {
  const index = await loadSearchIndex();
  const query = paletteInput.value.trim().toLowerCase();
  const source = Array.isArray(index) ? index : [];
  const ranked: readonly CommandItem[] = source.length === 0
    ? fallbackCommandItems(query)
    : query
      ? source
          .map((document) => ({ type: "record" as const, document, score: scoreSearchDocument(query, document) }))
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
      : source.slice(0, 8).map((document) => ({ type: "record" as const, document, score: 0 }));
  const entities = paletteEntities(query);
  commandItems = [...entities, ...ranked.slice(0, maxPaletteItems - entities.length)];
  commandSelection = Math.min(commandSelection, Math.max(0, commandItems.length - 1));
  paletteResults.replaceChildren();
  if (commandItems.length === 0) {
    paletteInput.removeAttribute("aria-activedescendant");
    const message = document.createElement("div");
    message.className = "command-empty";
    message.textContent = "No matching Ledger records";
    paletteResults.appendChild(message);
    paletteStatus.textContent = "Try a broader phrase";
    return;
  }
  let recordRank = 0;
  commandItems.forEach((item, indexValue) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-result";
    button.id = `command-result-${indexValue}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(indexValue === commandSelection));
    const copy = document.createElement("span");
    copy.className = "command-result-copy";
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const score = document.createElement("span");
    score.className = "command-result-score";
    if (item.type === "entity") {
      button.dataset.entity = item.entity;
      title.textContent = item.value;
      meta.textContent = `Show ${pluralize(item.count, "record")}`;
      score.textContent = entityLabels[item.entity];
    } else {
      recordRank += 1;
      button.dataset.id = item.document.id;
      title.textContent = item.document.title;
      meta.textContent = [item.document.id, item.document.kind, item.document.status].filter(Boolean).join(" · ");
      score.textContent = item.score ? (recordRank === 1 ? "Top match" : `#${recordRank}`) : "Recent";
    }
    copy.append(title, meta);
    button.append(copy, score);
    button.addEventListener("click", () => chooseCommand(item));
    paletteResults.appendChild(button);
  });
  paletteStatus.textContent = query ? `${pluralize(commandItems.length, "result")} for “${paletteInput.value.trim()}”` : "Recent records";
  paletteInput.setAttribute("aria-activedescendant", `command-result-${commandSelection}`);
}

function chooseCommand(item: CommandItem): void {
  if (item.type === "entity") showEntity(item.entity, item.value);
  else void openRecord(item.document.id);
}

function updateCommandSelection(next: number): void {
  if (commandItems.length === 0) return;
  commandSelection = (next + commandItems.length) % commandItems.length;
  const buttons = Array.from(paletteResults.querySelectorAll<HTMLElement>(".command-result"));
  buttons.forEach((button, indexValue) => button.setAttribute("aria-selected", String(indexValue === commandSelection)));
  paletteInput.setAttribute("aria-activedescendant", `command-result-${commandSelection}`);
  buttons[commandSelection]?.scrollIntoView({ block: "nearest" });
}

function closePalette(): void {
  paletteInput.setAttribute("aria-expanded", "false");
  if (palette.open) palette.close();
}

async function openRecord(id: string): Promise<void> {
  closePalette();
  if (openPanel(id)) return;
  const entry = recordEntry(id);
  if (!entry) return;
  searchInput.value = "";
  const per = perPageSize();
  const index = entries.indexOf(entry);
  currentPage = per > 0 && index >= 0 ? Math.floor(index / per) + 1 : 1;
  await applyFilters();
  entry.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  entry.focus({ preventScroll: true });
}

paletteTrigger.addEventListener("click", () => {
  void openPalette();
});
byId<HTMLElement>("command-close")?.addEventListener("click", closePalette);
palette.addEventListener("click", (event) => {
  if (event.target === palette) closePalette();
});
palette.addEventListener("close", () => paletteInput.setAttribute("aria-expanded", "false"));
paletteInput.addEventListener("input", () => {
  commandSelection = 0;
  void renderCommandResults();
});
paletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateCommandSelection(commandSelection + 1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    updateCommandSelection(commandSelection - 1);
  }
  const selected = commandItems[commandSelection];
  if (event.key === "Enter" && selected) {
    event.preventDefault();
    chooseCommand(selected);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const editing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    void openPalette();
  } else if (event.key === "/" && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    void openPalette();
  }
});

const themeToggle = required<HTMLElement>("theme-toggle");
const themeLabel = themeToggle.querySelector<HTMLElement>("[data-theme-label]");
type ThemeMode = "system" | "light" | "dark";
/** The toggle cycles auto, light, and dark; auto follows the system and stores nothing. */
const themeOrder: readonly ThemeMode[] = ["system", "light", "dark"];
const themeNames: Readonly<Record<ThemeMode, string>> = { system: "Auto", light: "Light", dark: "Dark" };
function currentTheme(): ThemeMode {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}
function nextTheme(mode: ThemeMode): ThemeMode {
  return themeOrder[(themeOrder.indexOf(mode) + 1) % themeOrder.length]!;
}
function updateThemeLabel(): void {
  const mode = currentTheme();
  const now = mode === "system" ? "auto, follows your system" : mode;
  const label = `Theme: ${now}. Switch to ${themeNames[nextTheme(mode)].toLowerCase()}`;
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
  if (themeLabel) themeLabel.textContent = themeNames[mode];
}
themeToggle.addEventListener("click", () => {
  const next = nextTheme(currentTheme());
  document.documentElement.dataset.theme = next;
  try {
    if (next === "system") localStorage.removeItem("ledger-theme");
    else localStorage.setItem("ledger-theme", next);
  } catch {
    // Storage may be unavailable.
  }
  updateThemeLabel();
});

entriesContainer.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest<HTMLElement>(".entry-link") : null;
  if (!link) return;
  // A modified click keeps its browser meaning, such as opening the record link in a new tab.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  const entry = link.closest<HTMLElement>(".entry");
  if (entry && entry.dataset.id) openPanel(entry.dataset.id);
});
recordPanelClose?.addEventListener("click", () => closePanel());
recordPanelBody?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
  if (!button) return;
  if (button.dataset.openRecord) {
    openPanel(button.dataset.openRecord, true, true);
  } else if (button.dataset.copy) {
    void copyFromButton(button);
  } else {
    // A list names the entity type once, and its buttons' text is the value.
    const entity = button.closest<HTMLElement>("[data-entity]");
    if (entity) showEntity(entity.dataset.entity, button.dataset.value ?? button.textContent ?? "");
  }
});

const relationLabels: Readonly<Record<string, string>> = {
  decision: "Decision",
  backlog: "Backlog",
  supersedes: "Supersedes",
  related: "Related",
};

/** How a record that links to the open one relates to it. */
const backlinkLabels: Readonly<Record<string, string>> = {
  decision: "Depends on it",
  backlog: "Works on it",
  supersedes: "Supersedes it",
  related: "Related",
};

let backlinkIndex: ReadonlyMap<string, readonly { readonly type: string; readonly entry: HTMLElement }[]> | undefined;

/** The entries that link to each record id, other than itself. */
function backlinksTo(id: string): readonly { readonly type: string; readonly entry: HTMLElement }[] {
  if (!backlinkIndex) {
    const index = new Map<string, { type: string; entry: HTMLElement }[]>();
    for (const [entry, refs] of entryRefs) {
      for (const link of refs.links) {
        if (link.id === entry.dataset.id) continue;
        const sources = index.get(link.id) ?? [];
        if (!sources.some((source) => source.entry === entry && source.type === link.type)) sources.push({ type: link.type, entry });
        index.set(link.id, sources);
      }
    }
    backlinkIndex = index;
  }
  return backlinkIndex.get(id) ?? [];
}

interface ReferenceListOptions {
  /** The entity the list's buttons show, named once for all of them. */
  readonly entity?: EntityType;
  readonly hint?: string;
  /** The count in the heading, when it differs from the number of items. */
  readonly count?: number;
}

function referenceList(label: string, items: readonly HTMLElement[], options: ReferenceListOptions = {}): HTMLDetailsElement | undefined {
  if (items.length === 0) return undefined;
  const details = document.createElement("details");
  details.className = "record-list";
  const summary = document.createElement("summary");
  const heading = document.createElement("span");
  const count = document.createElement("small");
  count.textContent = String(options.count ?? items.length);
  heading.append(`${label} `, count);
  summary.append(heading);
  summary.insertAdjacentHTML("beforeend", '<svg class="ui-icon" aria-hidden="true"><use href="#i-chevron"/></svg>');
  const list = document.createElement("ul");
  if (options.entity) list.dataset.entity = options.entity;
  if (options.hint) list.title = options.hint;
  for (const item of items) {
    const row = document.createElement("li");
    row.append(item);
    list.append(row);
  }
  details.append(summary, list);
  return details;
}

function codeButton(value: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const code = document.createElement("code");
  code.textContent = value;
  button.append(code);
  return button;
}

/** A button that opens a record, or a note when the record is not in this reader. */
function recordLinkItem(id: string, relation: string, entry: HTMLElement | undefined): HTMLElement {
  const label = document.createElement("small");
  label.textContent = relation;
  const code = document.createElement("code");
  code.textContent = id;
  if (!entry) {
    const missing = document.createElement("span");
    missing.className = "entity-missing";
    const note = document.createElement("small");
    note.textContent = "is not in this reader";
    missing.append(label, " ", code, " ", note);
    return missing;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.openRecord = id;
  const title = document.createElement("span");
  title.textContent = entry.querySelector(".entry-title")?.textContent || "";
  button.append(label, code, title);
  return button;
}

/**
 * The panel's Files, Symbols, Documentation, Relationships, and Referenced by
 * lists, built from the entries so detail HTML does not repeat them. Paths and
 * symbols open entity views; relationships and backlinks open records.
 */
function addReferenceLists(body: HTMLElement, entry: HTMLElement): void {
  const refs = entryRefs.get(entry);
  if (!refs) return;
  const columns = body.querySelector(".record-columns") ?? body.appendChild(Object.assign(document.createElement("div"), { className: "record-columns" }));
  const pathHint = (values: readonly string[]) =>
    `Select a ${values.some(isCoveragePattern) ? "path or pattern" : "path"} to list every record that names it`;
  const backlinks = backlinksTo(entry.dataset.id || "");
  const showAll = document.createElement("button");
  showAll.type = "button";
  showAll.dataset.entity = "linked";
  showAll.dataset.value = entry.dataset.id || "";
  showAll.append(Object.assign(document.createElement("span"), { textContent: "Show them in the list" }));
  const lists = [
    referenceList("Files", refs.files.map(codeButton), { entity: "file", hint: pathHint(refs.files) }),
    referenceList("Symbols", refs.symbols.map(codeButton), { entity: "symbol", hint: "Select a symbol to list every record that names it" }),
    referenceList("Documentation", refs.docs.map(codeButton), { entity: "file", hint: pathHint(refs.docs) }),
    referenceList("Relationships", refs.links.map((link) => recordLinkItem(link.id, relationLabels[link.type] || link.type, recordEntry(link.id)))),
    referenceList(
      "Referenced by",
      backlinks.length === 0
        ? []
        : [...backlinks.map((link) => recordLinkItem(link.entry.dataset.id || "", backlinkLabels[link.type] || link.type, link.entry)), showAll],
      { count: backlinks.length },
    ),
  ];
  columns.replaceChildren(...lists.filter((list): list is HTMLDetailsElement => list !== undefined));
}

/** Copy buttons for a record panel, taking the path and the packet command from the panel itself. */
function addCopyActions(body: HTMLElement): void {
  const makeButton = (kind: string, label: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.dataset.copy = kind;
    button.textContent = label;
    return button;
  };
  const actions = document.createElement("div");
  actions.className = "copy-actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Copy");
  actions.append(makeButton("link", "Copy link"));
  const source = body.querySelector(".source-reference");
  if (source?.querySelector("code")) actions.append(makeButton("path", "Copy path"));
  const packet = body.querySelector(".agent-packet");
  if (packet?.querySelector("pre")) {
    actions.append(makeButton("command", "Copy packet command"));
    packet.append(makeButton("context", "Copy context"));
  }
  (source ?? body.querySelector(".record-panel-title"))?.after(actions);
}

/** Copies with the Clipboard API, or with a selected text area where that API is missing or refused. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a selection below.
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus({ preventScroll: true });
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  previous?.focus({ preventScroll: true });
  return copied;
}

function copyPayload(button: HTMLButtonElement): string {
  const body = recordPanelBody;
  const context = body?.querySelector(".agent-packet pre")?.textContent || "";
  switch (button.dataset.copy) {
    case "link":
      return new URL(`?record=${encodeURIComponent(openRecordId)}`, window.location.href).href;
    case "path":
      return body?.querySelector(".source-reference code")?.textContent || "";
    case "command":
      return context.split("\n")[0] || "";
    case "context":
      return context;
    default:
      return "";
  }
}

async function copyFromButton(button: HTMLButtonElement): Promise<void> {
  const text = copyPayload(button);
  if (!text) return;
  const copied = await copyText(text);
  const label = button.dataset.label || button.textContent || "";
  button.dataset.label = label;
  button.textContent = copied ? "Copied" : "Copy failed";
  if (filterStatus) filterStatus.textContent = copied ? `${label.replace(/^Copy /, "Copied the ")}.` : "Copying failed; select the text instead.";
  setTimeout(() => {
    button.textContent = label;
  }, copiedLabelMs);
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !palette.open && openRecordId) closePanel();
});

window.addEventListener("popstate", () => {
  readUrlState();
  void applyFilters(false);
});
readUrlState();
updateThemeLabel();
void applyFilters(false);

// Live reload when served by `ledger serve --api`: the engine streams a
// rebuilt event after watched records change. A static file server answers
// /events with 404, which closes the EventSource without retrying.
if (window.location.protocol === "http:" || window.location.protocol === "https:") {
  try {
    const liveEvents = new EventSource("events");
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    liveEvents.addEventListener("rebuilt", () => {
      if (filterStatus) filterStatus.textContent = "Ledger records changed; reloading.";
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => window.location.reload(), 150);
    });
    liveEvents.addEventListener("rebuild-failed", () => {
      if (filterStatus) filterStatus.textContent = "Ledger records changed but failed validation; showing the last good render.";
    });
  } catch {
    // EventSource unavailable; the reader stays static.
  }
}
