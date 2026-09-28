/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The static reader's browser runtime. Bundled by esbuild into
 * dist/reader/runtime.js and inlined into index.html by the renderer, so the
 * reader keeps working from a file: URL and under any static host. Search
 * scoring is imported from the same module `ledger search` uses.
 *
 * The internal reader shows one record list three ways: the overview, with an
 * activity chart and summary panels; the records list; and the timeline, the
 * same list grouped by month. The public changelog has one view. Filters, the
 * sort, the open record, and the view all live in the URL, so any state links.
 */
import { coveragePatternMatches, isCoveragePattern } from "../pathPatterns.js";
import { recordsViewParams } from "../readerViewParams.js";
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

type SortKey = "newest" | "oldest" | "updated" | "title" | "id";

type ViewName = "overview" | "records" | "timeline" | "changelog";

/** A slice of the activity chart: one calendar month, or one week starting on a Monday. */
type PeriodKind = "month" | "week";

interface Period {
  readonly kind: PeriodKind;
  /** `YYYY-MM` for a month, the Monday's `YYYY-MM-DD` for a week. */
  readonly value: string;
}

interface ActivityBucket {
  readonly period: Period;
  /** The axis label, and the full name a tooltip and the table use. */
  readonly label: string;
  readonly title: string;
  count: number;
  readonly byKind: Map<string, number>;
}

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
const sortKeys: readonly SortKey[] = ["newest", "oldest", "updated", "title", "id"];
const defaultSort: SortKey = "newest";
const periodKinds: readonly PeriodKind[] = ["month", "week"];
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
/** A reload within this gap continues the same visit, so its change markers stay. */
const visitGapMs = 30 * 60 * 1000;
/** The activity chart buckets by week up to this many weeks, and by month past it. */
const maxWeeklyBuckets = 26;
const maxMonthlyBuckets = 24;
const maxAxisLabels = 8;
/** Narrow charts show fewer axis labels; each needs about this much room. */
const minAxisLabelSpacing = 56;
const chartHeight = 200;
const maxBarWidth = 24;
const barGap = 2;
const maxAreaBars = 8;
const maxMapNodes = 12;
/** A `g` prefix waits this long for its second key. */
const keySequenceMs = 900;
const resizeDebounceMs = 150;
/** An entry this far below the top bar, or higher, is the one in view for the version index. */
const versionInViewPx = 96;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const svgNamespace = "http://www.w3.org/2000/svg";
const chevronIcon = '<svg class="ui-icon" aria-hidden="true"><use href="#i-chevron"/></svg>';
const closeIcon = '<svg class="ui-icon" aria-hidden="true"><use href="#i-close"/></svg>';

let searchIndexPromise: Promise<readonly IndexDocument[]> | undefined;
let filterRequest = 0;
let commandItems: readonly CommandItem[] = [];
let commandSelection = 0;
let searchDebounce: ReturnType<typeof setTimeout> | undefined;
let currentPage = 1;
let pendingResultsScroll = false;
let openRecordId = "";
/** The entries the latest filter pass matched, in list order, and the ones on its page. */
let latestMatched: readonly HTMLElement[] = [];
let latestPage: ReadonlySet<HTMLElement> = new Set();
let latestPageList: readonly HTMLElement[] = [];
/** Whether the latest pass ranked by search score, which replaces the sort and the timeline's groups. */
let latestRanked = false;
let entityView: EntityView | undefined;
let entityMatches = new Map<HTMLElement, EntityRelation>();
let periodFilter: Period | undefined;
/** Records new or changed since the viewer's last visit, by id. */
let changedIds: ReadonlyMap<string, "new" | "updated"> = new Map();
let changedOnly = false;
let pendingSequenceAt = 0;
let chartBuckets: readonly ActivityBucket[] = [];
let chartTip: HTMLElement | undefined;
let areasRendered = false;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let versionFrame = 0;

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
        title: entryTitle(entry),
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

const root = document.documentElement;
const searchInput = required<HTMLInputElement>("search");
const entries = Array.from(document.querySelectorAll<HTMLElement>(".entry"));
const entriesContainer = required<HTMLElement>("entries");
const releaseFeed = entriesContainer.classList.contains("release-feed");
const resultCount = required<HTMLElement>("result-count");
const resultNoun = resultCount.dataset.resultNoun || "record";
const resultsEyebrow = byId<HTMLElement>("results-eyebrow");
const filterStatus = byId<HTMLElement>("filter-status");
const empty = required<HTMLElement>("empty");
const searchClear = required<HTMLElement>("search-clear");
const advancedFilters = document.querySelector<HTMLDetailsElement>(".advanced-filters");
const perPage = byId<HTMLSelectElement>("per-page");
const sortControl = byId<HTMLSelectElement>("sort");
const pagination = byId<HTMLElement>("pagination");
const activeFilters = byId<HTMLElement>("active-filters");
const library = byId<HTMLElement>("library");
const recordPanel = byId<HTMLElement>("record-panel");
const recordPanelBody = byId<HTMLElement>("record-panel-body");
const recordPanelClose = byId<HTMLElement>("record-panel-close");
const recordPrev = byId<HTMLButtonElement>("record-prev");
const recordNext = byId<HTMLButtonElement>("record-next");
const recordPosition = byId<HTMLElement>("record-position");
const viewTabs = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-view-tab]"));
/** The internal reader has views; the public changelog is one page. */
const hasViews = viewTabs.length > 0;
const activityChart = byId<HTMLElement>("activity-chart");
const activityTable = byId<HTMLTableElement>("activity-table");
const activitySub = byId<HTMLElement>("activity-sub");
const areaChart = byId<HTMLElement>("area-chart");
const shortcuts = byId<HTMLDialogElement>("shortcuts");
const versionLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".version-link[data-version]"));

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
const entryTitles = new Map(entries.map((entry) => [entry, entry.querySelector("h3")?.textContent?.trim() || entry.dataset.id || ""]));

function entryTitle(entry: HTMLElement): string {
  return entryTitles.get(entry) || "";
}

/** Offline search text: the title, the rendered search terms, and the entry's references. */
const fallbackBlobs = new Map(
  entries.map((entry) => {
    const refs = entryRefs.get(entry)!;
    const references = [...refs.files, ...refs.symbols, ...refs.docs, ...refs.links.map((link) => link.id)].join(" ");
    return [entry, `${entryTitle(entry)} ${entry.dataset.search || ""} ${references}`.toLowerCase()];
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

// Dates. Records carry `YYYY-MM-DD` days; everything here works in UTC so a
// day groups the same way in every time zone.

function parseDay(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseDay(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

/** The Monday on or before a day. */
function weekStart(value: string): string {
  const date = parseDay(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return isoDay(date);
}

function monthOf(value: string): string {
  return value.slice(0, 7);
}

function addMonths(month: string, count: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year || 0, (index || 1) - 1 + count, 1)).toISOString().slice(0, 7);
}

function formatMonth(month: string, withYear = true): string {
  const [year, index] = month.split("-");
  const name = monthNames[Number(index) - 1] ?? month;
  return withYear ? `${name} ${year}` : name;
}

function formatDay(value: string, withYear = false): string {
  const date = parseDay(value);
  if (!date) return value;
  const label = `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return withYear ? `${label}, ${date.getUTCFullYear()}` : label;
}

function periodLabel(period: Period): string {
  return period.kind === "month" ? formatMonth(period.value) : `Week of ${formatDay(period.value, true)}`;
}

function entryInPeriod(entry: HTMLElement, period: Period): boolean {
  const date = entry.dataset.date || "";
  if (period.kind === "month") return monthOf(date) === period.value;
  return date >= period.value && date < addDays(period.value, 7);
}

function parsePeriod(kind: PeriodKind, value: string | null): Period | undefined {
  if (!value) return undefined;
  const valid = kind === "month" ? /^\d{4}-\d{2}$/.test(value) : parseDay(value) !== undefined;
  return valid ? { kind, value } : undefined;
}

function labelForKind(kind: string): string {
  if (kind === "product-note") return "Product note";
  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}

// Views. The document's `data-view` attribute selects what the stylesheet
// shows; a head script sets it from the URL before the runtime loads.

function currentView(): ViewName {
  const value = root.dataset.view;
  return value === "overview" || value === "timeline" || value === "changelog" ? value : "records";
}

/** The view a URL without a `view` parameter opens on: records when any list parameter is set. */
function inferredView(params: URLSearchParams): ViewName {
  return recordsViewParams.some((key) => params.has(key)) ? "records" : "overview";
}

function applyView(view: ViewName): void {
  root.dataset.view = view;
  for (const tab of viewTabs) {
    if (tab.dataset.viewTab === view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  if (resultsEyebrow) resultsEyebrow.textContent = view === "timeline" ? "Timeline" : "Records";
}

interface ViewOptions {
  readonly push?: boolean;
  readonly scroll?: boolean;
}

function setView(view: ViewName, options: ViewOptions = {}): void {
  if (!hasViews) return;
  const changed = view !== currentView();
  applyView(view);
  if (changed) {
    layoutGroups();
    if (view === "overview") renderOverview();
  }
  writeUrlState(options.push ?? changed);
  if (changed && options.scroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Actions on the overview that filter the list show the list. */
function ensureListView(): void {
  if (hasViews && currentView() === "overview") setView("records", { push: false });
}

// Sorting. The renderer lists records newest first, so that order is the
// document order; the other sorts reorder a copy. A search ranks instead.

function currentSort(): SortKey {
  const value = sortControl?.value || "";
  return (sortKeys as readonly string[]).includes(value) ? (value as SortKey) : defaultSort;
}

function sortDate(entry: HTMLElement, key: SortKey): string {
  return key === "updated" ? entry.dataset.updated || entry.dataset.date || "" : entry.dataset.date || "";
}

function sortedEntries(key: SortKey): readonly HTMLElement[] {
  if (key === "newest") return entries;
  if (key === "oldest") return [...entries].reverse();
  const copy = [...entries];
  if (key === "updated") copy.sort((left, right) => sortDate(right, key).localeCompare(sortDate(left, key)));
  else if (key === "title") copy.sort((left, right) => entryTitle(left).localeCompare(entryTitle(right), undefined, { sensitivity: "base" }));
  else copy.sort((left, right) => (left.dataset.id || "").localeCompare(right.dataset.id || "", undefined, { numeric: true }));
  return copy;
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
  if (periodFilter && !entryInPeriod(entry, periodFilter)) return false;
  if (changedOnly && !changedIds.has(entry.dataset.id || "")) return false;
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
  /** Settles once the update callback has run; browsers run it after the call returns. */
  readonly updateCallbackDone?: Promise<void>;
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

/** Runs `update`, animated when the browser supports it; the promise settles once the update has run. */
function runTransition(update: () => void, candidates: readonly HTMLElement[]): Promise<void> {
  if (prefersReducedMotion()) {
    update();
    return Promise.resolve();
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
    return Promise.resolve();
  }
  // A skipped animation only rejects `ready`; `finished` still rejects when the update itself throws.
  void transition.ready.catch(() => undefined);
  const watchdog = setTimeout(() => transition.skipTransition(), transitionWatchdogMs);
  void transition.finished
    .finally(() => {
      clearTimeout(watchdog);
      clearNames();
    })
    .catch(() => undefined);
  return (transition.updateCallbackDone ?? transition.finished).catch(() => undefined);
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

/** Which date the rows show; the update date only under the sort that orders by it. */
let rowDateMode: "date" | "updated" = "date";

/** Rows show the creation date, or the update date under the "Recently updated" sort, so the date column reads in order. */
function syncRowDates(): void {
  const mode = currentSort() === "updated" ? "updated" : "date";
  if (mode === rowDateMode) return;
  rowDateMode = mode;
  for (const entry of entries) {
    const time = entry.querySelector<HTMLTimeElement>(":scope > time.record-date");
    const shown = mode === "updated" ? entry.dataset.updated || entry.dataset.date : entry.dataset.date;
    if (!time || !shown) continue;
    time.dateTime = shown;
    time.textContent = formatDay(shown, true);
  }
}

/**
 * The timeline's month headings, placed before the first entry of each month
 * on the page. A ranked search and the title and id sorts have no months.
 */
function layoutGroups(): void {
  for (const head of entriesContainer.querySelectorAll(".group-head")) head.remove();
  if (currentView() !== "timeline" || latestRanked) return;
  const sort = currentSort();
  if (sort === "title" || sort === "id") return;
  const counts = new Map<string, number>();
  for (const entry of latestPageList) {
    const month = monthOf(sortDate(entry, sort));
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  let previous = "";
  for (const entry of latestPageList) {
    const month = monthOf(sortDate(entry, sort));
    if (!month || month === previous) continue;
    previous = month;
    const head = document.createElement("div");
    head.className = "group-head";
    const title = document.createElement("h3");
    title.textContent = formatMonth(month);
    const count = document.createElement("small");
    count.textContent = pluralize(counts.get(month) || 0, resultNoun);
    head.append(title, count);
    entry.before(head);
  }
}

async function applyFilters(syncUrl = true): Promise<void> {
  const request = ++filterRequest;
  const search = searchInput.value.trim().toLowerCase();
  entriesContainer.setAttribute("aria-busy", "true");
  const matchedScores = await searchMatches(search);
  if (request !== filterRequest) return;
  const searchTokens = search.split(/\s+/).filter(Boolean);
  const ordered = matchedScores
    ? [...entries].sort(
        (left, right) => (matchedScores.get(right.dataset.id || "") || 0) - (matchedScores.get(left.dataset.id || "") || 0),
      )
    : sortedEntries(currentSort());
  const visibility = new Map(entries.map((entry) => [entry, matches(entry, matchedScores, searchTokens)]));
  const rankById = matchedScores ? new Map([...matchedScores.keys()].map((id, index) => [id, index + 1])) : undefined;
  const matchedList = ordered.filter((entry) => visibility.get(entry) === true);
  const total = matchedList.length;
  const per = perPageSize();
  const pageCount = per > 0 ? Math.max(1, Math.ceil(total / per)) : 1;
  if (currentPage > pageCount) currentPage = pageCount;
  if (currentPage < 1) currentPage = 1;
  const start = per > 0 ? (currentPage - 1) * per : 0;
  const pageList = per > 0 ? matchedList.slice(start, start + per) : matchedList;
  const pageSet = new Set(pageList);
  latestMatched = matchedList;
  latestPage = pageSet;
  latestPageList = pageList;
  latestRanked = Boolean(matchedScores);
  const candidates = entries.filter((entry) => !entry.hidden || pageSet.has(entry));
  const currentOrder = Array.from(entriesContainer.children).filter((child) => child.classList.contains("entry"));
  const orderChanged = ordered.some((entry, index) => currentOrder[index] !== entry);
  const visibilityChanged = entries.some((entry) => entry.hidden === pageSet.has(entry));
  const applyUpdate = () => {
    if (orderChanged) for (const entry of ordered) entriesContainer.appendChild(entry);
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
    syncRowDates();
    layoutGroups();
    resultCount.textContent = search && matchedScores ? pluralize(total, "ranked match") : pluralize(total, resultNoun);
    renderEntityBar();
    renderVisitNote();
    renderPagination(total, pageCount, per);
    renderActiveFilters();
    empty.hidden = total !== 0;
    empty.dataset.emptyState = search || activeFilterCount() > 0 ? "filtered" : "bare";
    entriesContainer.setAttribute("aria-busy", "false");
    updatePanelNav();
  };
  if (orderChanged || visibilityChanged) await runTransition(applyUpdate, candidates);
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
  updateActiveVersion();
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
  addPageButton(Math.max(1, currentPage - 1), { className: "page-prev", html: chevronIcon, ariaLabel: "Previous page", disabled: currentPage === 1, nav: true });
  let previous = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const nearCurrent = Math.abs(page - currentPage) <= 1;
    if (pageCount > 7 && page !== 1 && page !== pageCount && !nearCurrent) continue;
    if (previous && page - previous > 1) addGap();
    addPageButton(page, {});
    previous = page;
  }
  addPageButton(Math.min(pageCount, currentPage + 1), { className: "page-next", html: chevronIcon, ariaLabel: "Next page", disabled: currentPage === pageCount, nav: true });
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
  return (
    filterKeys.filter((key) => controlValue(key) !== "all").length +
    (entityView ? 1 : 0) +
    (periodFilter ? 1 : 0) +
    (changedOnly ? 1 : 0)
  );
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
    title.textContent = entryTitle(target);
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
  ensureListView();
  currentPage = 1;
  pendingResultsScroll = true;
  void applyFilters(false).then(() => {
    writeUrlState(true);
    // Focus lands on what names the new view: the entity bar, or the result count for a filter.
    (entityView && entityBar ? entityBar : resultCount).focus({ preventScroll: true });
  });
}

function clearEntity(): void {
  setEntityView(undefined);
  currentPage = 1;
  void applyFilters(false).then(() => {
    writeUrlState(true);
    resultCount.focus({ preventScroll: true });
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
  sortControl?.classList.toggle("is-active", currentSort() !== defaultSort);
}

function optionLabel(control: HTMLInputElement | HTMLSelectElement, value: string): string {
  if (control instanceof HTMLSelectElement) {
    const option = Array.from(control.options).find((candidate) => candidate.value === value);
    if (option) return option.textContent || value;
  }
  return value;
}

function filterChip(label: string, value: string, remove: () => void): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  const name = document.createElement("small");
  name.textContent = label;
  const text = document.createElement("strong");
  text.textContent = value;
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `Remove the ${label.toLowerCase()} filter`);
  button.innerHTML = closeIcon;
  button.addEventListener("click", remove);
  chip.append(name, text, button);
  return chip;
}

/** One chip per active filter, each removable on its own; two or more add a clear-all. */
function renderActiveFilters(): void {
  if (!activeFilters) return;
  const chips: HTMLElement[] = [];
  for (const key of filterKeys) {
    const value = controlValue(key);
    const control = controls[key];
    if (value === "all" || !control) continue;
    chips.push(
      filterChip(filterLabels[key], optionLabel(control, value), () => {
        control.value = "all";
        currentPage = 1;
        void applyFilters();
      }),
    );
  }
  if (entityView) chips.push(filterChip(entityLabels[entityView.type], entityView.value, clearEntity));
  if (periodFilter) {
    chips.push(filterChip(periodFilter.kind === "month" ? "Month" : "Week", periodLabel(periodFilter), () => setPeriod(undefined)));
  }
  if (changedOnly) {
    chips.push(
      filterChip("Visit", "Changed since your last visit", () => {
        changedOnly = false;
        currentPage = 1;
        void applyFilters(false).then(() => writeUrlState(true));
      }),
    );
  }
  activeFilters.replaceChildren(...chips);
  if (chips.length > 1) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-button";
    clear.textContent = "Clear all";
    clear.addEventListener("click", resetFilters);
    activeFilters.append(clear);
  }
  activeFilters.hidden = chips.length === 0;
}

function setPeriod(period: Period | undefined, push = false): void {
  periodFilter = period;
  currentPage = 1;
  void applyFilters(false).then(() => {
    writeUrlState(push);
    renderActivity();
  });
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
  const sort = currentSort();
  if (sort !== defaultSort) url.searchParams.set("sort", sort);
  else url.searchParams.delete("sort");
  if (openRecordId) url.searchParams.set("record", openRecordId);
  else url.searchParams.delete("record");
  for (const type of entityTypes) {
    if (entityView?.type === type) url.searchParams.set(type, entityView.value);
    else url.searchParams.delete(type);
  }
  for (const kind of periodKinds) {
    if (periodFilter?.kind === kind) url.searchParams.set(kind, periodFilter.value);
    else url.searchParams.delete(kind);
  }
  if (changedOnly) url.searchParams.set("changed", "1");
  else url.searchParams.delete("changed");
  // The view is implied by the other parameters where it can be, so plain links stay short.
  url.searchParams.delete("view");
  if (hasViews && currentView() !== inferredView(url.searchParams)) url.searchParams.set("view", currentView());
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
  title.textContent = entryTitle(entry);
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
  updatePanelNav();
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

/** The panel's place in the list it was opened from, and whether a neighbor exists on each side. */
function updatePanelNav(): void {
  if (!recordPosition || !recordPrev || !recordNext) return;
  const index = openRecordId ? latestMatched.findIndex((entry) => entry.dataset.id === openRecordId) : -1;
  recordPosition.textContent = index >= 0 ? `${index + 1} of ${latestMatched.length}` : "";
  recordPrev.disabled = index <= 0;
  recordNext.disabled = index < 0 || index >= latestMatched.length - 1;
}

/** Turns to the page that lists an entry when the current page does not. */
async function ensureOnPage(entry: HTMLElement): Promise<void> {
  if (latestPage.has(entry)) return;
  const per = perPageSize();
  const index = latestMatched.indexOf(entry);
  if (per <= 0 || index < 0) return;
  currentPage = Math.floor(index / per) + 1;
  await applyFilters(false);
}

/** Opens the record before or after the open one in the list, turning the page when needed. */
async function stepRecord(delta: 1 | -1): Promise<void> {
  if (!openRecordId) return;
  const index = latestMatched.findIndex((entry) => entry.dataset.id === openRecordId);
  const target = index >= 0 ? latestMatched[index + delta] : undefined;
  if (!target?.dataset.id) return;
  await ensureOnPage(target);
  openPanel(target.dataset.id, true, false);
  target.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
    if (control) control.value = value && hasOption(control, value) ? value : "all";
  }
  const per = params.get("per");
  if (per && perPage && hasOption(perPage, per)) perPage.value = per;
  const sort = params.get("sort");
  if (sortControl) sortControl.value = sort && hasOption(sortControl, sort) ? sort : defaultSort;
  const page = parseInt(params.get("page") || "1", 10);
  currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  const entityType = entityTypes.find((type) => params.get(type));
  const entityValueParam = entityType ? params.get(entityType) || "" : "";
  if (entityType !== entityView?.type || entityValueParam !== entityView?.value) {
    setEntityView(entityType ? { type: entityType, value: entityValueParam } : undefined);
  }
  const periodKind = periodKinds.find((kind) => params.get(kind));
  periodFilter = periodKind ? parsePeriod(periodKind, params.get(periodKind)) : undefined;
  changedOnly = params.get("changed") === "1" && changedIds.size > 0;
  if (hasViews) {
    const view = params.get("view");
    applyView(view === "overview" || view === "timeline" || view === "records" ? view : inferredView(params));
  }
  const record = params.get("record") || "";
  if (record !== openRecordId) {
    if (record) openPanel(record, false);
    else closePanel(false);
  }
}

/** Clears the search, every filter, the entity view, the period, and the changed-only filter. */
function clearFilters(): void {
  clearTimeout(searchDebounce);
  searchInput.value = "";
  setEntityView(undefined);
  periodFilter = undefined;
  changedOnly = false;
  for (const key of filterKeys) {
    const control = controls[key];
    if (control) control.value = "all";
  }
}

function resetFilters(): void {
  clearFilters();
  currentPage = 1;
  void applyFilters().then(renderActivity);
  searchInput.focus();
}

/**
 * Brings the entry a URL fragment names into view, such as a release
 * permalink, clearing filters that hide it and turning to its page.
 */
async function revealHashTarget(): Promise<void> {
  let id: string;
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  const entry = id ? entries.find((candidate) => candidate.id === id) : undefined;
  if (!entry) return;
  if (!latestPage.has(entry)) {
    // Filters hide it: show everything, in which order the entry sits where the page lists it.
    let index = latestMatched.indexOf(entry);
    if (index === -1) {
      clearFilters();
      index = entries.indexOf(entry);
    }
    const per = perPageSize();
    currentPage = per > 0 ? Math.floor(index / per) + 1 : 1;
    await applyFilters();
  }
  // An instant scroll; a smooth one can be dropped while the page is still loading.
  entry.scrollIntoView({ block: "start", behavior: "instant" });
  entry.focus({ preventScroll: true });
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
sortControl?.addEventListener("input", () => {
  currentPage = 1;
  void applyFilters();
});

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

// Filter buttons live in the rail, the overview's tiles, panels, and charts,
// and the area bars the runtime draws, so one listener serves them all. A
// rail button toggles its value; an overview button sets it and shows the list.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const tab = target.closest<HTMLAnchorElement>("[data-view-tab]");
  if (tab) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    const view = tab.dataset.viewTab;
    if (view === "overview" || view === "records" || view === "timeline") setView(view, { push: true, scroll: true });
    return;
  }
  const opener = target.closest<HTMLAnchorElement>("a[data-open-record]");
  if (opener?.dataset.openRecord) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    openPanel(opener.dataset.openRecord, true, true);
    return;
  }
  const reset = target.closest<HTMLElement>("[data-reset-filters]");
  if (reset) {
    if (reset.dataset.viewTarget) ensureListView();
    resetFilters();
    return;
  }
  const button = target.closest<HTMLElement>("[data-filter-field]");
  if (!button) return;
  const field = button.dataset.filterField || "";
  const value = button.dataset.filterValue;
  if (!isControlKey(field) || value === undefined) return;
  const control = controls[field];
  if (!control) return;
  const fromOverview = Boolean(button.dataset.viewTarget);
  control.value = !fromOverview && control.value === value ? "all" : value;
  currentPage = 1;
  if (fromOverview) {
    ensureListView();
    pendingResultsScroll = true;
  }
  void applyFilters();
});
byId<HTMLElement>("entity-clear")?.addEventListener("click", clearEntity);
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

// The overview's charts, drawn from the rows so they agree with the list. The
// activity chart is one series in the accent hue: thin columns, a hairline
// grid, a tooltip with the kinds behind each column, and a table twin.

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(svgNamespace, name);
}

function svgAttributes(element: Element, attributes: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
}

function samePeriod(left: Period | undefined, right: Period): boolean {
  return left !== undefined && left.kind === right.kind && left.value === right.value;
}

/** Weekly buckets across a short history, monthly across a long one; the latest months when there are more than the chart shows. */
function activityBuckets(): readonly ActivityBucket[] {
  const dates = entries.map((entry) => entry.dataset.date || "").filter((value) => parseDay(value) !== undefined).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return [];
  const spanWeeks = Math.floor((parseDay(last)!.getTime() - parseDay(first)!.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weekly = spanWeeks <= maxWeeklyBuckets;
  const buckets: ActivityBucket[] = [];
  if (weekly) {
    const end = weekStart(last);
    for (let start = weekStart(first); start <= end && buckets.length < maxWeeklyBuckets; start = addDays(start, 7)) {
      buckets.push({ period: { kind: "week", value: start }, label: formatDay(start), title: `Week of ${formatDay(start, true)}`, count: 0, byKind: new Map() });
    }
  } else {
    const months: string[] = [];
    for (let month = monthOf(first); month <= monthOf(last); month = addMonths(month, 1)) months.push(month);
    months.slice(-maxMonthlyBuckets).forEach((month, index) => {
      const withYear = index === 0 || month.endsWith("-01");
      buckets.push({ period: { kind: "month", value: month }, label: formatMonth(month, withYear), title: formatMonth(month), count: 0, byKind: new Map() });
    });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.period.value, bucket]));
  for (const entry of entries) {
    const date = entry.dataset.date || "";
    if (!parseDay(date)) continue;
    const bucket = byKey.get(weekly ? weekStart(date) : monthOf(date));
    if (!bucket) continue;
    bucket.count += 1;
    const kind = entry.dataset.kind || "record";
    bucket.byKind.set(kind, (bucket.byKind.get(kind) || 0) + 1);
  }
  return buckets;
}

/** The axis top: twice a round step at or above half the largest value, so the middle gridline is a round number. */
function niceCeiling(max: number): number {
  const half = Math.max(1, max) / 2;
  let magnitude = 1;
  while (magnitude * 10 <= half) magnitude *= 10;
  for (const factor of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const step = factor * magnitude;
    if (step >= half) return step * 2;
  }
  return magnitude * 20;
}

function roundedColumnPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return "";
  const radius = Math.min(4, width / 2, height);
  const round = (value: number) => value.toFixed(1);
  return [
    `M${round(x)},${round(y + height)}`,
    `V${round(y + radius)}`,
    `Q${round(x)},${round(y)} ${round(x + radius)},${round(y)}`,
    `H${round(x + width - radius)}`,
    `Q${round(x + width)},${round(y)} ${round(x + width)},${round(y + radius)}`,
    `V${round(y + height)}`,
    "Z",
  ].join(" ");
}

function hideChartTip(): void {
  chartTip?.remove();
  chartTip = undefined;
}

function showChartTip(index: number, x: number, y: number, width: number): void {
  const bucket = chartBuckets[index];
  if (!bucket || !activityChart) return;
  hideChartTip();
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  const total = document.createElement("strong");
  total.textContent = pluralize(bucket.count, "record");
  const title = document.createElement("small");
  title.textContent = bucket.title;
  tip.append(total, title);
  if (bucket.byKind.size > 0) {
    const list = document.createElement("ul");
    for (const [kind, count] of [...bucket.byKind.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))) {
      const item = document.createElement("li");
      item.dataset.kindTone = kind;
      const name = document.createElement("span");
      name.textContent = labelForKind(kind);
      const value = document.createElement("span");
      value.textContent = String(count);
      item.append(name, value);
      list.append(item);
    }
    tip.append(list);
  }
  tip.style.left = `${Math.min(Math.max(x, 80), width - 80)}px`;
  tip.style.top = `${y}px`;
  activityChart.append(tip);
  chartTip = tip;
}

function renderActivityTable(weekly: boolean): void {
  if (!activityTable) return;
  const heading = activityTable.querySelector("thead th");
  if (heading) heading.textContent = weekly ? "Week" : "Month";
  const caption = activityTable.querySelector("caption");
  if (caption) caption.textContent = weekly ? "Records by week" : "Records by month";
  const body = activityTable.tBodies[0] ?? activityTable.createTBody();
  body.replaceChildren(
    ...chartBuckets.map((bucket) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = bucket.title;
      const count = document.createElement("td");
      count.textContent = String(bucket.count);
      row.append(name, count);
      return row;
    }),
  );
}

function renderActivity(): void {
  if (!activityChart) return;
  hideChartTip();
  chartBuckets = activityBuckets();
  const weekly = chartBuckets[0]?.period.kind === "week";
  if (activitySub) {
    activitySub.textContent = weekly ? "Records by week. Select a week to list its records." : "Records by month. Select a month to list its records.";
  }
  renderActivityTable(weekly);
  if (chartBuckets.length === 0) {
    const note = document.createElement("p");
    note.className = "chart-empty";
    note.textContent = "No dated records yet.";
    activityChart.replaceChildren(note);
    return;
  }
  const width = Math.max(320, activityChart.clientWidth || 720);
  const left = 34;
  const right = 8;
  const top = 18;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = chartHeight - top - bottom;
  const count = chartBuckets.length;
  const slot = plotWidth / count;
  const barWidth = Math.max(3, Math.min(maxBarWidth, slot - barGap));
  const max = Math.max(...chartBuckets.map((bucket) => bucket.count));
  const ceiling = niceCeiling(max);
  const svg = svgElement("svg");
  svgAttributes(svg, {
    viewBox: `0 0 ${width} ${chartHeight}`,
    width,
    height: chartHeight,
    role: "img",
    "aria-label": `Records per ${weekly ? "week" : "month"} across ${pluralize(count, weekly ? "week" : "month")}`,
  });
  for (const tick of [0, ceiling / 2, ceiling]) {
    const y = top + plotHeight - (tick / ceiling) * plotHeight;
    const line = svgElement("line");
    svgAttributes(line, { class: "grid-line", x1: left, x2: width - right, y1: y, y2: y });
    const label = svgElement("text");
    svgAttributes(label, { class: "axis-label", x: left - 8, y: y + 4, "text-anchor": "end" });
    label.textContent = String(tick);
    svg.append(line, label);
  }
  const labelRoom = Math.max(2, Math.min(maxAxisLabels, Math.floor((width - left - right) / minAxisLabelSpacing)));
  const labelEvery = Math.max(1, Math.ceil(count / labelRoom));
  let valueLabelled = false;
  chartBuckets.forEach((bucket, index) => {
    const slotStart = left + index * slot;
    const x = slotStart + (slot - barWidth) / 2;
    const height = (bucket.count / ceiling) * plotHeight;
    const y = top + plotHeight - height;
    const selected = samePeriod(periodFilter, bucket.period);
    const group = svgElement("g");
    const hit = svgElement("rect");
    svgAttributes(hit, {
      class: "bar-hit",
      x: slotStart,
      y: top,
      width: slot,
      height: plotHeight,
      tabindex: 0,
      role: "button",
      "aria-label": `${bucket.title}: ${pluralize(bucket.count, "record")}`,
      "aria-pressed": String(selected),
    });
    const bar = svgElement("path");
    svgAttributes(bar, { class: `bar${selected ? " is-selected" : ""}`, d: roundedColumnPath(x, y, barWidth, height) });
    const center = slotStart + slot / 2;
    const show = () => showChartTip(index, center, y, width);
    hit.addEventListener("mouseenter", show);
    hit.addEventListener("focus", show);
    hit.addEventListener("mouseleave", hideChartTip);
    hit.addEventListener("blur", hideChartTip);
    const choose = () => {
      ensureListView();
      pendingResultsScroll = true;
      setPeriod(selected ? undefined : bucket.period, true);
    };
    hit.addEventListener("click", choose);
    hit.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choose();
    });
    group.append(hit, bar);
    if (index % labelEvery === 0) {
      const label = svgElement("text");
      svgAttributes(label, { class: "axis-label", x: center, y: chartHeight - 6, "text-anchor": "middle" });
      label.textContent = bucket.label;
      group.append(label);
    }
    if (!valueLabelled && bucket.count === max && max > 0) {
      valueLabelled = true;
      const label = svgElement("text");
      svgAttributes(label, { class: "value-label", x: center, y: y - 6, "text-anchor": "middle" });
      label.textContent = String(bucket.count);
      group.append(label);
    }
    svg.append(group);
  });
  activityChart.replaceChildren(svg);
}

/** Records per area as horizontal bars in one hue; each bar filters the list. */
function renderAreas(): void {
  if (!areaChart || areasRendered) return;
  areasRendered = true;
  const counts = new Map<string, number>();
  for (const refs of entryRefs.values()) {
    for (const area of new Set(refs.areas)) counts.set(area, (counts.get(area) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, maxAreaBars);
  if (rows.length === 0) {
    const note = document.createElement("p");
    note.className = "panel-empty";
    note.textContent = "No areas recorded yet.";
    areaChart.replaceChildren(note);
    return;
  }
  const max = rows[0]![1];
  areaChart.replaceChildren(
    ...rows.map(([area, count]) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "bar-row";
      row.dataset.filterField = "area";
      row.dataset.filterValue = area;
      row.dataset.viewTarget = "records";
      row.setAttribute("aria-pressed", "false");
      row.setAttribute("aria-label", `${area}: ${pluralize(count, "record")}`);
      const label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = area;
      const track = document.createElement("span");
      track.className = "bar-track";
      const fill = document.createElement("span");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(2, Math.round((count / max) * 100))}%`;
      track.append(fill);
      const value = document.createElement("span");
      value.className = "bar-value";
      value.textContent = String(count);
      row.append(label, track, value);
      return row;
    }),
  );
  updateFacetButtons();
}

function renderOverview(): void {
  renderActivity();
  renderAreas();
}

window.addEventListener("resize", () => {
  if (!activityChart || currentView() !== "overview") return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderActivity, resizeDebounceMs);
});

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
  // Focus and select before the index loads, so text typed meanwhile is kept, not selected.
  paletteInput.focus();
  paletteInput.select();
  await renderCommandResults();
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
  if (event.key === "Escape") {
    // Chrome clears a search field on Escape instead of cancelling the dialog.
    event.preventDefault();
    closePalette();
    return;
  }
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

function openShortcuts(): void {
  if (shortcuts && !shortcuts.open) shortcuts.showModal();
}
byId<HTMLElement>("shortcuts-trigger")?.addEventListener("click", openShortcuts);
byId<HTMLElement>("shortcuts-close")?.addEventListener("click", () => shortcuts?.close());
shortcuts?.addEventListener("click", (event) => {
  if (event.target === shortcuts) shortcuts.close();
});

/** The list's search box when the list is showing; the palette on the overview, where there is none. */
function focusSearch(): void {
  if (currentView() === "overview") {
    void openPalette();
    return;
  }
  searchInput.focus();
  searchInput.select();
}

function focusedEntry(): HTMLElement | undefined {
  const active = document.activeElement;
  return active instanceof HTMLElement ? (active.closest<HTMLElement>(".entry") ?? undefined) : undefined;
}

function selectEntry(entry: HTMLElement): void {
  for (const candidate of entries) candidate.classList.toggle("is-selected", candidate === entry);
  entry.focus({ preventScroll: true });
  entry.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Moves the keyboard selection through the page's rows; from nothing, `j` takes the first and `k` the last. */
function moveSelection(delta: 1 | -1): void {
  if (currentView() === "overview" || latestPageList.length === 0) return;
  const current = focusedEntry();
  const index = current ? latestPageList.indexOf(current) : -1;
  const next = index === -1
    ? latestPageList[delta === 1 ? 0 : latestPageList.length - 1]
    : latestPageList[Math.min(latestPageList.length - 1, Math.max(0, index + delta))];
  if (next) selectEntry(next);
}

function openSelected(): void {
  const entry = focusedEntry();
  if (entry?.dataset.id) openPanel(entry.dataset.id, true, true);
}

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const editing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  const key = event.key;
  if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "k") {
    event.preventDefault();
    void openPalette();
    return;
  }
  if (key === "Escape") {
    if (palette.open) closePalette();
    else if (!shortcuts?.open && openRecordId) closePanel();
    return;
  }
  if (editing || event.metaKey || event.ctrlKey || event.altKey || palette.open || shortcuts?.open) return;
  const inSequence = pendingSequenceAt > 0 && Date.now() - pendingSequenceAt <= keySequenceMs;
  pendingSequenceAt = 0;
  if (inSequence && hasViews) {
    const view = key === "o" ? "overview" : key === "r" ? "records" : key === "t" ? "timeline" : undefined;
    if (view) {
      event.preventDefault();
      setView(view, { push: true, scroll: true });
      return;
    }
  }
  switch (key) {
    case "/":
      event.preventDefault();
      focusSearch();
      return;
    case "?":
      event.preventDefault();
      openShortcuts();
      return;
    case "g":
      if (hasViews) pendingSequenceAt = Date.now();
      return;
    case "j":
      event.preventDefault();
      if (openRecordId) void stepRecord(1);
      else moveSelection(1);
      return;
    case "k":
      event.preventDefault();
      if (openRecordId) void stepRecord(-1);
      else moveSelection(-1);
      return;
    case "]":
      if (openRecordId) {
        event.preventDefault();
        void stepRecord(1);
      }
      return;
    case "[":
      if (openRecordId) {
        event.preventDefault();
        void stepRecord(-1);
      }
      return;
    case "o":
      event.preventDefault();
      openSelected();
      return;
    case "Enter":
      // A focused row opens; a link or button inside it keeps its own Enter.
      if (focusedEntry() && !(target instanceof HTMLAnchorElement) && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        openSelected();
      }
      return;
    default:
      return;
  }
});

const themeToggle = required<HTMLElement>("theme-toggle");
const themeLabel = themeToggle.querySelector<HTMLElement>("[data-theme-label]");
type ThemeMode = "system" | "light" | "dark";
/** The toggle cycles auto, light, and dark; auto follows the system and stores nothing. */
const themeOrder: readonly ThemeMode[] = ["system", "light", "dark"];
const themeNames: Readonly<Record<ThemeMode, string>> = { system: "Auto", light: "Light", dark: "Dark" };
function currentTheme(): ThemeMode {
  const value = root.dataset.theme;
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
  root.dataset.theme = next;
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
  if (isModifiedClick(event)) return;
  event.preventDefault();
  const entry = link.closest<HTMLElement>(".entry");
  if (entry && entry.dataset.id) openPanel(entry.dataset.id);
});
recordPanelClose?.addEventListener("click", () => closePanel());
recordPrev?.addEventListener("click", () => void stepRecord(-1));
recordNext?.addEventListener("click", () => void stepRecord(1));
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
  details.className = "record-list-details";
  const summary = document.createElement("summary");
  const heading = document.createElement("span");
  const count = document.createElement("small");
  count.textContent = String(options.count ?? items.length);
  heading.append(`${label} `, count);
  summary.append(heading);
  summary.insertAdjacentHTML("beforeend", chevronIcon);
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
  title.textContent = entryTitle(entry);
  button.append(label, code, title);
  return button;
}

interface MapNode {
  readonly id: string;
  readonly relation: string;
  readonly entry: HTMLElement | undefined;
}

/**
 * A small map of the open record's relationships: the record at the center,
 * the records it links to and the ones that link to it around it, colored by
 * kind and labeled by id. Selecting one opens it.
 */
function addRecordMap(body: HTMLElement, entry: HTMLElement, columns: Element): void {
  body.querySelector(".record-map")?.remove();
  const refs = entryRefs.get(entry);
  const id = entry.dataset.id || "";
  if (!refs || !id) return;
  const nodes: MapNode[] = [];
  const seen = new Set<string>([id]);
  for (const link of refs.links) {
    if (seen.has(link.id)) continue;
    seen.add(link.id);
    nodes.push({ id: link.id, relation: relationLabels[link.type] || link.type, entry: recordEntry(link.id) });
  }
  for (const link of backlinksTo(id)) {
    const linkId = link.entry.dataset.id || "";
    if (seen.has(linkId)) continue;
    seen.add(linkId);
    nodes.push({ id: linkId, relation: backlinkLabels[link.type] || link.type, entry: link.entry });
  }
  if (nodes.length === 0) return;
  const shown = nodes.slice(0, maxMapNodes);
  const width = 520;
  const height = 260;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 84;
  const svg = svgElement("svg");
  svgAttributes(svg, { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": `Relationship map: ${pluralize(nodes.length, "linked record")}` });
  const edges = svgElement("g");
  const ring = svgElement("g");
  shown.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / shown.length;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    const edge = svgElement("line");
    svgAttributes(edge, { class: "map-edge", x1: centerX, y1: centerY, x2: x.toFixed(1), y2: y.toFixed(1) });
    edges.append(edge);
    const group = svgElement("g");
    const kind = node.entry?.dataset.kind;
    svgAttributes(group, { class: `map-node${node.entry ? "" : " map-missing"}` });
    if (kind) group.setAttribute("data-kind-tone", kind);
    const circle = svgElement("circle");
    svgAttributes(circle, { cx: x.toFixed(1), cy: y.toFixed(1), r: 7 });
    const label = svgElement("text");
    const cosine = Math.cos(angle);
    const anchor = cosine > 0.2 ? "start" : cosine < -0.2 ? "end" : "middle";
    const labelX = anchor === "start" ? x + 12 : anchor === "end" ? x - 12 : x;
    const labelY = anchor === "middle" ? (Math.sin(angle) < 0 ? y - 14 : y + 20) : y + 4;
    svgAttributes(label, { x: labelX.toFixed(1), y: labelY.toFixed(1), "text-anchor": anchor });
    label.textContent = node.id;
    const title = svgElement("title");
    title.textContent = node.entry ? `${node.relation}: ${node.id}, ${entryTitle(node.entry)}` : `${node.relation}: ${node.id} is not in this reader`;
    group.append(title, circle, label);
    if (node.entry) {
      svgAttributes(group, { tabindex: 0, role: "button", "aria-label": `Open ${node.id}` });
      const open = () => openPanel(node.id, true, true);
      group.addEventListener("click", open);
      group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
    }
    ring.append(group);
  });
  const center = svgElement("g");
  svgAttributes(center, { class: "map-node map-center" });
  const centerCircle = svgElement("circle");
  svgAttributes(centerCircle, { cx: centerX, cy: centerY, r: 9 });
  const centerLabel = svgElement("text");
  svgAttributes(centerLabel, { x: centerX, y: centerY + 24, "text-anchor": "middle" });
  centerLabel.textContent = id;
  center.append(centerCircle, centerLabel);
  svg.append(edges, center, ring);
  if (nodes.length > shown.length) {
    const more = svgElement("text");
    svgAttributes(more, { class: "map-more", x: width - 8, y: height - 8, "text-anchor": "end" });
    more.textContent = `${nodes.length - shown.length} more in the lists below`;
    svg.append(more);
  }
  const section = document.createElement("section");
  section.className = "record-map";
  section.setAttribute("aria-label", "Relationship map");
  const head = document.createElement("div");
  head.className = "panel-head";
  const heading = document.createElement("div");
  const title = document.createElement("h4");
  title.className = "panel-title";
  title.textContent = "Relationship map";
  const sub = document.createElement("p");
  sub.className = "panel-sub";
  sub.textContent = `${pluralize(nodes.length, "linked record")}. Select one to open it.`;
  heading.append(title, sub);
  head.append(heading);
  section.append(head, svg);
  const kinds = [...new Set(shown.map((node) => node.entry?.dataset.kind).filter((kind): kind is string => Boolean(kind)))].sort();
  if (kinds.length > 1) {
    const legend = document.createElement("div");
    legend.className = "map-legend";
    for (const kind of kinds) {
      const item = document.createElement("span");
      item.dataset.kindTone = kind;
      item.textContent = labelForKind(kind);
      legend.append(item);
    }
    section.append(legend);
  }
  columns.before(section);
}

/**
 * The panel's Files, Symbols, Documentation, Relationships, and Referenced by
 * lists, and the relationship map, built from the entries so detail HTML does
 * not repeat them. Paths and symbols open entity views; relationships and
 * backlinks open records.
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
  addRecordMap(body, entry, columns);
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

interface VisitState {
  readonly v: 1;
  readonly visitedAt: number;
  /** Content hashes by record id as of the latest load. */
  readonly current: Readonly<Record<string, string>>;
  /** Content hashes as of the visit before this one; absent on a first visit. */
  readonly previous?: Readonly<Record<string, string>>;
}

const visitNote = byId<HTMLElement>("visit-note");
const changedToggle = byId<HTMLButtonElement>("changed-toggle");
const visitKey = `ledger-visits:${document.body.dataset.readerKey || document.title}`;

function isHashMap(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((hash) => typeof hash === "string");
}

/** The stored visit, or nothing when storage is unavailable, empty, or unreadable. */
function readVisitState(): VisitState | undefined {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(visitKey) || "null");
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const state = parsed as Partial<VisitState>;
    if (state.v !== 1 || typeof state.visitedAt !== "number" || !isHashMap(state.current)) return undefined;
    if (state.previous !== undefined && !isHashMap(state.previous)) return undefined;
    return state as VisitState;
  } catch {
    return undefined;
  }
}

function writeVisitState(state: VisitState): void {
  try {
    localStorage.setItem(visitKey, JSON.stringify(state));
  } catch {
    // Storage may be unavailable or full; change markers then last for this page load only.
  }
}

function currentHashes(): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.dataset.id || "", entry.dataset.hash || ""]));
}

/**
 * Compares this load with the viewer's previous visit. A first visit only
 * records a baseline; a load after a gap of `visitGapMs` starts a new visit,
 * and a reload within it keeps comparing with the same earlier visit.
 */
function trackVisit(): void {
  const current = currentHashes();
  const now = Date.now();
  const stored = readVisitState();
  const previous = !stored ? undefined : now - stored.visitedAt > visitGapMs ? stored.current : stored.previous;
  writeVisitState({ v: 1, visitedAt: now, current, ...(previous ? { previous } : {}) });
  const changes = new Map<string, "new" | "updated">();
  if (previous) {
    for (const [id, hash] of Object.entries(current)) {
      if (!(id in previous)) changes.set(id, "new");
      else if (previous[id] !== hash) changes.set(id, "updated");
    }
  }
  changedIds = changes;
  markChangedEntries();
}

function markChangedEntries(): void {
  for (const entry of entries) {
    entry.querySelector(".change-chip")?.remove();
    const change = changedIds.get(entry.dataset.id || "");
    if (!change) continue;
    const chip = document.createElement("span");
    chip.className = "tag change-chip";
    chip.dataset.tone = "new";
    chip.textContent = change === "new" ? "New" : "Updated";
    entry.querySelector("[data-score-label]")?.after(chip);
  }
}

function renderVisitNote(): void {
  if (!visitNote || !changedToggle) return;
  visitNote.hidden = changedIds.size === 0;
  changedToggle.textContent = `${changedIds.size} changed since your last visit`;
  changedToggle.setAttribute("aria-pressed", String(changedOnly));
}

changedToggle?.addEventListener("click", () => {
  changedOnly = !changedOnly;
  currentPage = 1;
  void applyFilters(false).then(() => writeUrlState(true));
});
byId<HTMLElement>("mark-seen")?.addEventListener("click", () => {
  const current = currentHashes();
  writeVisitState({ v: 1, visitedAt: Date.now(), current, previous: current });
  changedIds = new Map();
  changedOnly = false;
  markChangedEntries();
  void applyFilters(false).then(() => {
    writeUrlState();
    resultCount.focus({ preventScroll: true });
  });
});

/** Marks the version index entry for the release under the top bar, or the first on the page. */
function updateActiveVersion(): void {
  if (versionLinks.length === 0) return;
  let active: HTMLElement | undefined;
  for (const entry of latestPageList) {
    const box = entry.getBoundingClientRect();
    if (box.height === 0) break;
    if (box.top <= versionInViewPx) active = entry;
    else break;
  }
  const current = (active ?? latestPageList[0])?.id || "";
  for (const link of versionLinks) {
    if (link.dataset.version === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
}

if (versionLinks.length > 0) {
  window.addEventListener(
    "scroll",
    () => {
      if (versionFrame) return;
      versionFrame = requestAnimationFrame(() => {
        versionFrame = 0;
        updateActiveVersion();
      });
    },
    { passive: true },
  );
}

window.addEventListener("popstate", () => {
  readUrlState();
  void applyFilters(false).then(() => {
    layoutGroups();
    if (currentView() === "overview") renderOverview();
  });
});
// The rail folds into a drawer on narrow screens. It starts closed there so the
// results come first, and stays open on wide screens where it is a sidebar.
const railDrawer = document.querySelector<HTMLDetailsElement>("details.rail-drawer");
const narrowScreen = window.matchMedia("(max-width: 960px)");
function syncRailDrawer(): void {
  if (railDrawer) railDrawer.open = !narrowScreen.matches;
}
narrowScreen.addEventListener("change", syncRailDrawer);
syncRailDrawer();

trackVisit();
readUrlState();
updateThemeLabel();
void applyFilters(false).then(revealHashTarget);
if (currentView() === "overview") renderOverview();
window.addEventListener("hashchange", () => void revealHashTarget());

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
