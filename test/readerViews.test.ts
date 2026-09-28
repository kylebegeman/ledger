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
function mountInternal(): void {
  window.history.replaceState(null, "", "/");
  const model = buildStaticReaderModel(workspace(), [
    record("0001", "Static reader renderer", "2026-06-29", { related: ["0002"] }),
    record("0002", "Retry policy for the CLI", "2026-07-06"),
    record("0003", "Cache warm command", "2026-07-14", { status: "draft" }),
  ]);
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

function record(id: string, title: string, date: string, options: { status?: string; related?: readonly string[] } = {}): ParsedLedgerDocument {
  const raw = [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    `title: "${title}"`,
    `date: "${date}"`,
    `updated: "${date}"`,
    `status: "${options.status ?? "landed"}"`,
    'areas: ["reader"]',
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
