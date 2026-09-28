// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel, buildSearchIndex } from "../src/render.js";
import { staticReaderRuntime } from "../src/renderAssets.js";
import { renderStaticReaderHtml } from "../src/renderHtml.js";
import { defaultConfig } from "../src/config.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.documentElement.innerHTML = "";
  delete document.documentElement.dataset.view;
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Three records across two months, so the chart, the timeline, and the sort orders have something to separate. */
function mountInternal(records: readonly ParsedLedgerDocument[] = [
  record("0001", "Static reader renderer", "2026-06-29", { related: ["0002"] }),
  record("0002", "Retry policy for the CLI", "2026-07-06"),
  record("0003", "Cache warm command", "2026-07-14", { status: "draft" }),
]): void {
  window.history.replaceState(null, "", "/");
  const model = buildStaticReaderModel(workspace(), [...records]);
  const index = buildSearchIndex(model.documents).map(({ terms: _terms, ...document }) => document);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("search-index.json")) return new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" }));
}

describe("reader views", () => {
  it("starts on the overview and moves between views by tab, key sequence, and URL", async () => {
    mountInternal();
    await settle(50);
    expect(document.documentElement.dataset.view).toBe("overview");
    expect(document.querySelectorAll("#activity-chart rect.bar-hit").length).toBeGreaterThan(0);
    expect(document.querySelector('.tile[data-filter-value="change"] .tile-value')?.textContent).toBe("3");

    click('[data-view-tab="records"]');
    await settle(20);
    expect(document.documentElement.dataset.view).toBe("records");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("records");

    press("g");
    press("t");
    await settle(20);
    expect(document.documentElement.dataset.view).toBe("timeline");
    expect(Array.from(document.querySelectorAll(".group-head h3")).map((heading) => heading.textContent)).toEqual(["Jul 2026", "Jun 2026"]);

    // A list parameter alone still means the list, so older links keep working.
    window.history.replaceState(null, "", "/?kind=change");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(document.documentElement.dataset.view).toBe("records");
    expect(document.querySelectorAll(".group-head")).toHaveLength(0);
  });

  it("opens recent changes from the overview and browses their full history", async () => {
    mountInternal();
    await settle(50);
    const recent = document.querySelectorAll<HTMLAnchorElement>(".recent-list-item");
    expect(Array.from(recent).map((link) => link.dataset.openRecord)).toEqual(["0003", "0002", "0001"]);
    click('.recent-list-item[data-open-record="0002"]');
    await settle(30);
    expect(document.querySelector("#record-panel.open")?.textContent).toContain("Retry policy for the CLI");
    expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
    click("#record-panel-close");
    click('.panel-recent [data-filter-value="change"]');
    await settle(30);
    expect(document.documentElement.dataset.view).toBe("records");
    expect(new URL(window.location.href).searchParams.get("kind")).toBe("change");
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
  });

  it("sorts the list and records the order in the URL", async () => {
    mountInternal();
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);

    select("sort", "oldest");
    await settle(30);
    expect(visibleIds()).toEqual(["0001", "0002", "0003"]);
    expect(new URL(window.location.href).searchParams.get("sort")).toBe("oldest");

    select("sort", "title");
    await settle(30);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);

    select("sort", "newest");
    await settle(30);
    expect(new URL(window.location.href).searchParams.get("sort")).toBeNull();
  });

  it("filters through the type and status menus and preserves the native control and URL contract", async () => {
    mountInternal([
      record("0001", "Landed change", "2026-07-01"),
      record("0002", "Draft change", "2026-07-02", { status: "draft" }),
      release("v1.0.0", "2026-07-03"),
    ]);
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    expect(visibleIds()).toEqual(["v1.0.0", "0002", "0001"]);

    const kindTrigger = menuTrigger("kind");
    expect(kindTrigger.getAttribute("role")).toBe("combobox");
    openSelectMenu("kind");
    expect(kindTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(selectMenu("kind").getAttribute("role")).toBe("listbox");
    menuOption("kind", "Changes").click();
    await settle(30);
    expect(nativeSelect("kind").value).toBe("change");
    expect(kindTrigger.textContent).toContain("Type");
    expect(kindTrigger.textContent).toContain("Changes");
    expect(kindTrigger.getAttribute("aria-expanded")).toBe("false");
    expectSelectedOption("kind", "Changes");
    expect(visibleIds()).toEqual(["0002", "0001"]);
    expect(new URL(window.location.href).searchParams.get("kind")).toBe("change");

    openSelectMenu("status");
    menuOption("status", "draft").click();
    await settle(30);
    expect(nativeSelect("status").value).toBe("draft");
    expect(menuTrigger("status").textContent).toContain("Status");
    expect(menuTrigger("status").textContent).toContain("draft");
    expectSelectedOption("status", "draft");
    expect(visibleIds()).toEqual(["0002"]);
    expect(new URL(window.location.href).searchParams.get("status")).toBe("draft");
  });

  it("keeps menu labels and selections synchronized with rail shortcuts and reset", async () => {
    mountInternal([
      record("0001", "Landed change", "2026-07-01"),
      release("v1.0.0", "2026-07-03"),
    ]);
    await settle(50);
    const initialLabels = new Map(["kind", "area"].map((id) => [id, menuTrigger(id).textContent]));
    click('[data-view-tab="records"]');
    await settle(20);

    click('.rail .facet-button[data-filter-field="kind"][data-filter-value="release"]');
    await settle(30);
    expect(nativeSelect("kind").value).toBe("release");
    expect(menuTrigger("kind").textContent).toContain("Releases");
    expectSelectedOption("kind", "Releases");
    expect(visibleIds()).toEqual(["v1.0.0"]);

    const allTypes = document.querySelector<HTMLElement>('.rail .facet-button[data-filter-field="kind"][data-filter-value="all"]')!;
    expect(allTypes.textContent).toContain("All types");
    allTypes.click();
    await settle(30);
    expect(nativeSelect("kind").value).toBe("all");
    expect(menuTrigger("kind").textContent).toBe(initialLabels.get("kind"));
    expectSelectedOption("kind", "All record types");
    expect(visibleIds()).toEqual(["v1.0.0", "0001"]);

    click('.rail .facet-button[data-filter-field="kind"][data-filter-value="change"]');
    select("area", "reader");
    await settle(30);
    expect(menuTrigger("area").textContent).toContain("Area");
    expect(menuTrigger("area").textContent).toContain("reader");
    click('.filter-bar [data-reset-filters]');
    await settle(30);
    for (const [id, allLabel] of [["kind", "All record types"], ["area", "All areas"]] as const) {
      expect(nativeSelect(id).value).toBe("all");
      expect(menuTrigger(id).textContent).toBe(initialLabels.get(id));
      expectSelectedOption(id, allLabel);
      expect(new URL(window.location.href).searchParams.has(id)).toBe(false);
    }
    expect(visibleIds()).toEqual(["v1.0.0", "0001"]);
  });

  it("restores visible dropdown state with browser history", async () => {
    mountInternal();
    await settle(50);
    const initialLabels = new Map(["kind", "status", "area"].map((id) => [id, menuTrigger(id).textContent]));
    window.history.replaceState(null, "", "/?view=records&kind=change&status=draft&area=reader");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(visibleIds()).toEqual(["0003"]);
    for (const [id, value, label] of [["kind", "change", "Changes"], ["status", "draft", "draft"], ["area", "reader", "reader"]] as const) {
      expect(nativeSelect(id).value).toBe(value);
      expect(menuTrigger(id).textContent).toContain(label);
      expectSelectedOption(id, label);
    }

    window.history.replaceState(null, "", "/?view=records");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
    for (const [id, allLabel] of [["kind", "All record types"], ["status", "All statuses"], ["area", "All areas"]] as const) {
      expect(nativeSelect(id).value).toBe("all");
      expect(menuTrigger(id).textContent).toBe(initialLabels.get(id));
      expectSelectedOption(id, allLabel);
    }
  });

  it("isolates menu keys from reader shortcuts and closes only the menu on Escape", async () => {
    mountInternal();
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    click('.entry[data-id="0002"] .entry-link');
    await settle(30);
    const trigger = menuTrigger("kind");
    openSelectMenu("kind");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    for (const key of ["j", "k", "g", "t"]) {
      (document.activeElement ?? trigger).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      await settle(20);
      expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
      expect(document.documentElement.dataset.view).toBe("records");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }

    (document.activeElement ?? trigger).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await settle(20);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector("#record-panel.open")).not.toBeNull();
    expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
  });

  it("moves the canonical area filter between desktop rail and mobile toolbar without losing its state", async () => {
    let narrow = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() { return query === "(max-width: 960px)" && narrow; },
      addEventListener(_type: string, listener: () => void) {
        if (query === "(max-width: 960px)") listeners.add(listener);
      },
      removeEventListener() {},
    }));
    const resize = (value: boolean) => {
      narrow = value;
      for (const listener of listeners) listener();
    };
    mountInternal(Array.from({ length: 8 }, (_, index) => record(
      `000${index + 1}`,
      `Change in area ${index + 1}`,
      `2026-07-0${index + 1}`,
      { areas: [`area-${index + 1}`] },
    )));
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    const control = nativeSelect("area");
    const trigger = menuTrigger("area");
    expect(control.closest(".rail-refine")).not.toBeNull();
    openSelectMenu("area");
    menuOption("area", "area-8").click();
    await settle(30);
    expect(control.value).toBe("area-8");
    expect(trigger.textContent).toContain("area-8");
    expect(visibleIds()).toEqual(["0008"]);
    expect(new URL(window.location.href).searchParams.get("area")).toBe("area-8");

    openSelectMenu("area");
    resize(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(nativeSelect("area")).toBe(control);
    expect(menuTrigger("area")).toBe(trigger);
    expect(control.closest(".filter-bar")).not.toBeNull();
    expect(control.closest(".rail-refine")).toBeNull();
    expect(control.value).toBe("area-8");
    expectSelectedOption("area", "area-8");

    resize(false);
    expect(control.closest(".rail-refine")).not.toBeNull();
    expect(control.closest(".filter-bar")).toBeNull();
    expect(nativeSelect("area")).toBe(control);
    expect(control.value).toBe("area-8");
    expect(trigger.textContent).toContain("area-8");
    expect(visibleIds()).toEqual(["0008"]);
  });

  it("filters by the week a chart bar names and clears it from its chip", async () => {
    mountInternal();
    await settle(50);
    const bar = document.querySelector('#activity-chart rect.bar-hit[aria-label^="Week of Jun 29, 2026"]');
    expect(bar).not.toBeNull();
    bar!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(50);
    expect(document.documentElement.dataset.view).toBe("records");
    expect(new URL(window.location.href).searchParams.get("week")).toBe("2026-06-29");
    expect(visibleIds()).toEqual(["0001"]);
    const chip = document.querySelector("#active-filters .chip") as HTMLElement;
    expect(chip.textContent).toContain("Week of Jun 29, 2026");

    (chip.querySelector("button") as HTMLElement).click();
    await settle(50);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
    expect(new URL(window.location.href).searchParams.get("week")).toBeNull();
    expect((document.getElementById("active-filters") as HTMLElement).hidden).toBe(true);
  });

  it("steps between records from the panel header and the bracket keys", async () => {
    mountInternal();
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    click('.entry[data-id="0003"] .entry-link');
    await settle(30);
    const position = () => document.getElementById("record-position")?.textContent;
    expect(position()).toBe("1 of 3");
    expect((document.getElementById("record-prev") as HTMLButtonElement).disabled).toBe(true);

    click("#record-next");
    await settle(30);
    expect(position()).toBe("2 of 3");
    expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
    expect(document.getElementById("record-panel-body")?.textContent).toContain("Retry policy for the CLI");

    press("]");
    await settle(30);
    expect(position()).toBe("3 of 3");
    expect((document.getElementById("record-next") as HTMLButtonElement).disabled).toBe(true);

    press("[");
    await settle(30);
    expect(position()).toBe("2 of 3");
  });

  it("maps the records a record links and opens one from the map", async () => {
    mountInternal();
    await settle(50);
    click('[data-view-tab="records"]');
    await settle(20);
    click('.entry[data-id="0001"] .entry-link');
    await settle(30);
    const map = document.querySelector("#record-panel-body .record-map") as HTMLElement;
    expect(map).not.toBeNull();
    expect(map.textContent).toContain("1 linked record");
    const nodes = Array.from(map.querySelectorAll(".map-node"));
    expect(nodes).toHaveLength(2);
    const linked = nodes.find((node) => !node.classList.contains("map-center"))!;
    expect(linked.textContent).toContain("0002");

    linked.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(30);
    expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
    expect(document.getElementById("record-panel-body")?.textContent).toContain("Retry policy for the CLI");
  });

  it("takes / to the palette on the overview and to the search field on the list", async () => {
    mountInternal();
    await settle(50);
    const dialog = document.getElementById("command-palette") as HTMLDialogElement;
    if (typeof dialog.showModal !== "function") {
      dialog.showModal = () => dialog.setAttribute("open", "");
      dialog.close = () => dialog.removeAttribute("open");
    }
    press("/");
    await settle(20);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(document.activeElement?.id).toBe("command-search");

    press("Escape");
    await settle(20);
    expect(dialog.hasAttribute("open")).toBe(false);

    click('[data-view-tab="records"]');
    await settle(20);
    press("/");
    await settle(20);
    expect(document.activeElement?.id).toBe("search");
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});

describe("public changelog", () => {
  it("lists releases under year headings beside a version index that marks one release current", async () => {
    window.history.replaceState(null, "", "/");
    const releases = [release("v1.1.0", "2026-07-14"), release("v1.0.0", "2026-06-29"), release("v0.9.0", "2025-12-01")];
    globalThis.fetch = (async () => new Response("[]", { headers: { "content-type": "application/json" } })) as typeof fetch;
    mount(renderStaticReaderHtml(buildStaticReaderModel(workspace(), releases, { profile: "public" }), { iconSvg: "<svg></svg>" }));
    await settle(50);
    expect(Array.from(document.querySelectorAll(".version-link")).map((link) => link.getAttribute("data-version"))).toEqual(["v1.1.0", "v1.0.0", "v0.9.0"]);
    expect(document.querySelectorAll('.version-link[aria-current="true"]')).toHaveLength(1);
    expect(Array.from(document.querySelectorAll(".year-start")).map((entry) => entry.getAttribute("data-year"))).toEqual(["2026", "2025"]);
    expect(document.querySelector("#result-count")?.textContent).toContain("3 releases");
  });
});

function mount(html: string): void {
  const withoutScripts = html.replace(/<script>[\s\S]*?<\/script>/g, "");
  const bodyStart = withoutScripts.indexOf("<body");
  const bodyEnd = withoutScripts.lastIndexOf("</body>");
  const bodyTagEnd = withoutScripts.indexOf(">", bodyStart);
  for (const attribute of withoutScripts.slice(bodyStart, bodyTagEnd).matchAll(/([\w-]+)="([^"]*)"/g)) {
    document.body.setAttribute(attribute[1]!, attribute[2]!);
  }
  document.body.innerHTML = withoutScripts.slice(bodyTagEnd + 1, bodyEnd);
  new Function(staticReaderRuntime)();
}

function click(selector: string): void {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`nothing matches ${selector}`);
  element.click();
}

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function select(id: string, value: string): void {
  const control = document.getElementById(id) as HTMLSelectElement;
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function nativeSelect(id: string): HTMLSelectElement {
  const control = document.getElementById(id);
  if (!(control instanceof HTMLSelectElement)) throw new Error(`missing native select ${id}`);
  return control;
}

function menuTrigger(id: string): HTMLButtonElement {
  const trigger = document.getElementById(`${id}-trigger`);
  if (!(trigger instanceof HTMLButtonElement)) throw new Error(`missing menu trigger for ${id}`);
  return trigger;
}

function openSelectMenu(id: string): void {
  const trigger = menuTrigger(id);
  trigger.focus();
  if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
}

function expectSelectedOption(id: string, label: string): void {
  openSelectMenu(id);
  expect(menuOption(id, label).getAttribute("aria-selected")).toBe("true");
  expect(selectMenu(id).querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  menuTrigger(id).click();
}

function selectMenu(id: string): HTMLElement {
  const menu = document.getElementById(menuTrigger(id).getAttribute("aria-controls") ?? "");
  if (!menu) throw new Error(`missing menu controlled by ${id}`);
  return menu;
}

function menuOption(id: string, label: string): HTMLElement {
  const option = Array.from(selectMenu(id).querySelectorAll<HTMLElement>('.select-option[role="option"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!option) throw new Error(`missing option ${label} in ${id}`);
  return option;
}

function visibleIds(): readonly string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".entry"))
    .filter((entry) => !entry.hidden)
    .map((entry) => entry.dataset.id || "");
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workspace(): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger-reader-views",
    ledgerRoot: "/tmp/ledger-reader-views/.ledger",
    configPath: "/tmp/ledger-reader-views/.ledger/config.yaml",
    config: { ...defaultConfig, project: "reader-views" },
  };
}

function parsed(raw: string, relativePath: string, kind: ParsedLedgerDocument["kind"]): ParsedLedgerDocument {
  const result = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger-reader-views/${relativePath}`,
    relativePath,
    raw,
    frontmatterRaw: result.frontmatterRaw,
    frontmatter: result.frontmatter,
    body: result.body,
    sections: result.sections,
    kind,
  };
}

function record(id: string, title: string, date: string, options: { status?: string; related?: readonly string[]; areas?: readonly string[] } = {}): ParsedLedgerDocument {
  const raw = [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    `title: "${title}"`,
    `date: "${date}"`,
    `updated: "${date}"`,
    `status: "${options.status ?? "landed"}"`,
    `areas: ${JSON.stringify(options.areas ?? ["reader"])}`,
    'files: ["src/cli.ts"]',
    ...(options.related ? [`related: [${options.related.map((value) => `"${value}"`).join(", ")}]`] : []),
    "---",
    "",
    `# ${id}: ${title}`,
    "",
    "## Summary",
    "",
    `${title} summary.`,
    "",
    "## Why",
    "",
    "Because.",
    "",
    "## Changed Files",
    "",
    "### src/cli.ts",
    "",
    "- What changed: things.",
    "- On conflict: keep.",
    "",
    "## Behavior And UX Impact",
    "",
    "None.",
    "",
    "## Invariants",
    "",
    "- Stays.",
    "",
    "## Verification",
    "",
    "- npm test",
    "",
  ].join("\n");
  return parsed(raw, `.ledger/entries/${id}.md`, "change");
}

function release(version: string, date: string): ParsedLedgerDocument {
  const raw = [
    "---",
    `id: "${version}"`,
    'kind: "release"',
    `title: "Ledger ${version}"`,
    `date: "${date}"`,
    'status: "released"',
    "entries: []",
    "---",
    "",
    `# Release ${version}`,
    "",
    "## Summary",
    "",
    "Shipped.",
    "",
    "## Public Notes",
    "",
    `- Notes for ${version}.`,
    "",
  ].join("\n");
  return parsed(raw, `.ledger/releases/${version}.md`, "release");
}
