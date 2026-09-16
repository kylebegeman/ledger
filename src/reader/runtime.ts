/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The static reader's browser runtime. Bundled by esbuild into
 * dist/reader/runtime.js and inlined into index.html by the renderer, so the
 * reader keeps working from a file: URL and under any static host. Search
 * scoring is imported from the same module `ledger search` uses.
 */
import { fuzzyScore, scoreSearchFields, type SearchableFields } from "../searchCore.js";

interface IndexDocument {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly status?: string;
  readonly terms?: string;
  readonly fields?: SearchableFields;
}

interface CommandItem {
  readonly document: IndexDocument;
  readonly score: number;
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

let searchIndexPromise: Promise<readonly IndexDocument[]> | undefined;
let filterRequest = 0;
let commandItems: readonly CommandItem[] = [];
let commandSelection = 0;
let searchDebounce: ReturnType<typeof setTimeout> | undefined;
let currentPage = 1;
let pendingResultsScroll = false;
let openRecordId = "";

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function required<T extends HTMLElement>(id: string): T {
  const element = byId<T>(id);
  if (!element) throw new Error(`Ledger reader: missing #${id}`);
  return element;
}

function loadSearchIndex(): Promise<readonly IndexDocument[]> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch("search-index.json")
      .then((response) => (response.ok ? (response.json() as Promise<readonly IndexDocument[]>) : []))
      .catch(() => []);
  }
  return searchIndexPromise;
}

function scoreSearchDocument(query: string, document: IndexDocument): number {
  if (!document.fields) return fuzzyScore(query, document.terms || "");
  return scoreSearchFields({ terms: document.terms || "", fields: document.fields }, query).score;
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

const fallbackBlobs = new Map(
  entries.map((entry) => [
    entry,
    `${entry.querySelector("h3")?.textContent || ""} ${entry.dataset.search || ""}`.toLowerCase(),
  ]),
);

function datasetList(entry: HTMLElement, key: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(entry.dataset[key] || "[]");
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
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
  const transition = startViewTransition(update);
  if (!transition) {
    for (const entry of named) entry.style.viewTransitionName = "";
    update();
    return;
  }
  const watchdog = setTimeout(() => transition.skipTransition(), transitionWatchdogMs);
  void transition.finished.finally(() => {
    clearTimeout(watchdog);
    for (const entry of named) entry.style.viewTransitionName = "";
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
  return filterKeys.filter((key) => controlValue(key) !== "all").length;
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
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function recordEntry(id: string): HTMLElement | undefined {
  return entries.find((candidate) => candidate.dataset.id === id);
}

function openPanel(id: string, syncUrl = true): boolean {
  if (!recordPanel || !recordPanelBody) return false;
  const entry = recordEntry(id);
  const template = entry ? entry.querySelector<HTMLTemplateElement>("template.entry-detail") : null;
  if (!template) return false;
  recordPanelBody.replaceChildren(template.content.cloneNode(true));
  recordPanelBody.scrollTop = 0;
  const wasOpen = openRecordId !== "";
  openRecordId = id;
  recordPanel.classList.add("open");
  for (const candidate of entries) candidate.classList.toggle("is-open", candidate.dataset.id === id);
  if (syncUrl) writeUrlState(!wasOpen);
  recordPanel.focus({ preventScroll: true });
  return true;
}

function closePanel(syncUrl = true): void {
  if (!openRecordId || !recordPanel) return;
  const previous = recordEntry(openRecordId);
  openRecordId = "";
  recordPanel.classList.remove("open");
  for (const candidate of entries) candidate.classList.remove("is-open");
  if (syncUrl) writeUrlState();
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
  const record = params.get("record") || "";
  if (record !== openRecordId) {
    if (record) openPanel(record, false);
    else closePanel(false);
  }
}

function resetFilters(): void {
  clearTimeout(searchDebounce);
  searchInput.value = "";
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

async function renderCommandResults(): Promise<void> {
  const index = await loadSearchIndex();
  const query = paletteInput.value.trim().toLowerCase();
  const source = Array.isArray(index) ? index : [];
  commandItems = (
    query
      ? source
          .map((document) => ({ document, score: scoreSearchDocument(query, document) }))
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
      : source.slice(0, 8).map((document) => ({ document, score: 0 }))
  ).slice(0, 9);
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
  commandItems.forEach((item, indexValue) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-result";
    button.id = `command-result-${indexValue}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(indexValue === commandSelection));
    button.dataset.id = item.document.id;
    const copy = document.createElement("span");
    copy.className = "command-result-copy";
    const title = document.createElement("strong");
    title.textContent = item.document.title;
    const meta = document.createElement("small");
    meta.textContent = [item.document.id, item.document.kind, item.document.status].filter(Boolean).join(" · ");
    copy.append(title, meta);
    const score = document.createElement("span");
    score.className = "command-result-score";
    score.textContent = item.score ? (indexValue === 0 ? "Top match" : `#${indexValue + 1}`) : "Recent";
    button.append(copy, score);
    button.addEventListener("click", () => {
      void openRecord(item.document.id);
    });
    paletteResults.appendChild(button);
  });
  paletteStatus.textContent = query ? `${pluralize(commandItems.length, "result")} for “${paletteInput.value.trim()}”` : "Recent records";
  paletteInput.setAttribute("aria-activedescendant", `command-result-${commandSelection}`);
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
    void openRecord(selected.document.id);
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
function resolvedTheme(): "light" | "dark" {
  const value = document.documentElement.dataset.theme;
  if (value === "light" || value === "dark") return value;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function updateThemeLabel(): void {
  const next = resolvedTheme() === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
}
themeToggle.addEventListener("click", () => {
  const next = resolvedTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("ledger-theme", next);
  } catch {
    // Storage may be unavailable.
  }
  updateThemeLabel();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateThemeLabel);

entriesContainer.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest<HTMLElement>(".entry-link") : null;
  if (!link) return;
  event.preventDefault();
  const entry = link.closest<HTMLElement>(".entry");
  if (entry && entry.dataset.id) openPanel(entry.dataset.id);
});
recordPanelClose?.addEventListener("click", () => closePanel());
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
