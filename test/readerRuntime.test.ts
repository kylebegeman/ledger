// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel, buildSearchIndex, chunkRecordDetails, type LedgerStaticReaderModel } from "../src/render.js";
import { staticReaderRuntime, staticReaderStyles } from "../src/renderAssets.js";
import { renderRecordDetails, renderStaticReaderHtml } from "../src/renderHtml.js";
import { scoreSearchDocument } from "../src/search.js";
import { defaultConfig } from "../src/config.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.documentElement.innerHTML = "";
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("reader runtime bundle", () => {
  it("is built from typed sources and imports the shared search scoring once", async () => {
    expect(staticReaderRuntime).toContain("function fuzzyScore(");
    expect(staticReaderRuntime).toContain("function scoreSearchFields(");
    expect(staticReaderRuntime.match(/function fuzzyScore\(/g)).toHaveLength(1);
    expect(staticReaderRuntime).not.toContain("import ");
    expect(staticReaderRuntime).not.toContain("export ");
    expect(staticReaderStyles).toContain("light-dark(");
    // Every page embeds the stylesheet; Dossier holds its own to a budget, and so does Ledger.
    expect(Buffer.byteLength(staticReaderStyles)).toBeLessThan(40 * 1024);
    const source = await readFile(path.join(process.cwd(), "src", "reader", "runtime.ts"), "utf8");
    expect(source).toContain('from "../searchCore.js"');
    expect(source).not.toMatch(/function fuzzyScore\(/);
  });
});

describe("reader runtime in a browser document", () => {
  let model: LedgerStaticReaderModel;

  beforeEach(() => {
    model = buildStaticReaderModel(workspace(), [
      record("0001", "Static reader renderer", ["reader"], "landed"),
      record("0002", "Retry policy for the CLI", ["cli"], "landed"),
      record("0003", "Cache warm command", ["cache"], "draft"),
    ]);
    // The sidecar on disk omits `terms`; the browser derives it like `ledger search` does.
    const index = buildSearchIndex(model.documents).map(({ terms: _terms, ...document }) => document);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("search-index.json")) return new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" }));
  });

  it("ranks search results exactly as ledger search does", async () => {
    await settle(50);
    for (const query of ["retry cli landed", "reader", "cache draft"]) {
      const expected = buildSearchIndex(model.documents)
        .map((document) => scoreSearchDocument(document, query))
        .filter((result) => result.score > 0)
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
        .map((result) => result.id);
      expect(expected.length).toBeGreaterThan(0);
      type("search", query);
      await settle(250);
      expect(visibleIds()).toEqual(expected);
    }
  });

  it("keeps a modified click on a record link for the browser", async () => {
    await settle(50);
    const link = document.querySelector('.entry[data-id="0002"] .entry-link') as HTMLElement;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(click);
    await settle(20);
    expect(click.defaultPrevented).toBe(false);
    expect(document.getElementById("record-panel")?.classList.contains("open")).toBe(false);
  });

  it("filters records by search text and by kind, and reports counts", async () => {
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
    expect(document.getElementById("result-count")?.textContent).toBe("3 records");

    type("search", "retry");
    await settle(250);
    expect(visibleIds()[0]).toBe("0002");
    expect(document.getElementById("result-count")?.textContent).toMatch(/^\d ranked match(es)?$/);
    expect(document.querySelector('.entry[data-id="0002"] [data-score-label]')?.textContent).toBe("Top match");
    expect(new URL(window.location.href).searchParams.get("q")).toBe("retry");

    type("search", "");
    await settle(250);
    select("status", "draft");
    await settle(50);
    expect(visibleIds()).toEqual(["0003"]);
    expect(document.getElementById("filter-status")?.textContent).toContain("1 active filter");

    (document.querySelector("[data-reset-filters]") as HTMLElement | null)?.click();
    await settle(50);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
  });

  it("still updates the list when the browser skips a view transition", async () => {
    await settle(50);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    let started = 0;
    // A hidden document skips the animation: the update runs, `finished` resolves, and only `ready` rejects.
    const skippedTransition = (update: () => void) => {
      started += 1;
      update();
      return {
        ready: Promise.reject(new DOMException("Transition was aborted because of invalid state", "InvalidStateError")),
        finished: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => undefined,
      };
    };
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: skippedTransition });
    try {
      select("status", "draft");
      await settle(50);
      expect(started).toBe(1);
      expect(visibleIds()).toEqual(["0003"]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      delete (document as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it("opens the record panel from an entry link and closes it with Escape", async () => {
    await settle(50);
    (document.querySelector('.entry[data-id="0002"] .entry-link') as HTMLElement).click();
    await settle(20);
    const panel = document.getElementById("record-panel");
    expect(panel?.classList.contains("open")).toBe(true);
    expect(document.getElementById("record-panel-body")?.textContent).toContain("Retry policy for the CLI");
    expect(new URL(window.location.href).searchParams.get("record")).toBe("0002");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(20);
    expect(panel?.classList.contains("open")).toBe(false);
    expect(new URL(window.location.href).searchParams.get("record")).toBeNull();
  });

  it("cycles the theme through auto, light, and dark and remembers an explicit choice", async () => {
    await settle(50);
    const toggle = document.getElementById("theme-toggle") as HTMLElement;
    const label = toggle.querySelector("[data-theme-label]");
    const root = document.documentElement;
    root.dataset.theme = "system";
    localStorage.removeItem("ledger-theme");
    toggle.click();
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem("ledger-theme")).toBe("light");
    expect(label?.textContent).toBe("Light");
    expect(toggle.getAttribute("aria-label")).toBe("Theme: light. Switch to dark");
    toggle.click();
    expect(root.dataset.theme).toBe("dark");
    expect(localStorage.getItem("ledger-theme")).toBe("dark");
    expect(label?.textContent).toBe("Dark");
    toggle.click();
    expect(root.dataset.theme).toBe("system");
    expect(localStorage.getItem("ledger-theme")).toBeNull();
    expect(label?.textContent).toBe("Auto");
    expect(toggle.getAttribute("aria-label")).toBe("Theme: auto, follows your system. Switch to light");
  });

  it("opens the command palette on Cmd+K and ranks results", async () => {
    await settle(50);
    const dialog = document.getElementById("command-palette") as HTMLDialogElement;
    if (typeof dialog.showModal !== "function") {
      dialog.showModal = () => {
        dialog.setAttribute("open", "");
      };
      dialog.close = () => {
        dialog.removeAttribute("open");
      };
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    await settle(50);
    expect(dialog.hasAttribute("open")).toBe(true);
    const input = document.getElementById("command-search") as HTMLInputElement;
    expect(input.getAttribute("aria-expanded")).toBe("true");
    input.value = "cache";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(50);
    const results = Array.from(document.querySelectorAll(".command-result[data-id]")).map((button) => (button as HTMLElement).dataset.id);
    expect(results[0]).toBe("0003");
    // The area named by the query comes first, before the records.
    const first = document.querySelector(".command-result") as HTMLElement;
    expect(first.dataset.entity).toBe("area");
    expect(first.textContent).toContain("Show 1 record");
    expect(document.getElementById("command-status")?.textContent).toContain("for “cache”");
  });

  it("fills the command palette from the rendered rows when the search index cannot load", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" }));
    await settle(50);
    const dialog = document.getElementById("command-palette") as HTMLDialogElement;
    if (typeof dialog.showModal !== "function") {
      dialog.showModal = () => dialog.setAttribute("open", "");
      dialog.close = () => dialog.removeAttribute("open");
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    await settle(50);
    const ids = () => Array.from(document.querySelectorAll(".command-result")).map((button) => (button as HTMLElement).dataset.id);
    expect(ids()).toEqual(["0003", "0002", "0001"]);
    expect(document.getElementById("command-status")?.textContent).toBe("Recent records");
    const input = document.getElementById("command-search") as HTMLInputElement;
    input.value = "cache draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(50);
    expect(ids()).toEqual(["0003"]);
    expect(document.querySelector(".command-result strong")?.textContent).toBe("Cache warm command");
    expect(document.getElementById("command-status")?.textContent).toContain("1 result for");
  });
});

describe("reader entity views", () => {
  let copied: string[];

  beforeEach(() => {
    copied = [];
    window.history.replaceState(null, "", "/");
    const model = buildStaticReaderModel(workspace(), [
      record("0001", "Run the CLI", ["cli"], "landed", { files: ["src/cli.ts"], symbols: ["runCli"], decisions: ["D001"] }),
      record("0002", "Cover the sources", ["reader"], "landed", { files: ["src/**"], related: ["0001"] }),
      record("0003", "Document the API", ["docs"], "landed", { files: ["README.md"], docs: ["docs/API.md"], backlog: ["B001"] }),
      record("D001", "Keep one CLI", ["cli"], "accepted", { kind: "decision", files: [] }),
    ]);
    globalThis.fetch = (async () => new Response("[]", { headers: { "content-type": "application/json" } })) as typeof fetch;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
    mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" }));
  });

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
    window.history.replaceState(null, "", "/");
  });

  it("lists a file's records from the record panel, with pattern matches, and returns with Back", async () => {
    await settle(50);
    expect(visibleIds()).toEqual(["D001", "0003", "0002", "0001"]);
    openRecordLink("0001");
    await settle(20);
    panelEntity("file", "src/cli.ts").click();
    await settle(50);

    expect(document.getElementById("record-panel")?.classList.contains("open")).toBe(false);
    const url = new URL(window.location.href);
    expect(url.searchParams.get("file")).toBe("src/cli.ts");
    expect(url.searchParams.get("record")).toBeNull();
    expect(visibleIds()).toEqual(["0002", "0001"]);
    expect(document.getElementById("entity-bar")?.hidden).toBe(false);
    expect(document.getElementById("entity-kind")?.textContent).toBe("File");
    expect(document.getElementById("entity-value")?.textContent).toBe("src/cli.ts");
    expect(document.getElementById("entity-count")?.textContent).toBe("1 record names it, 1 more by pattern");
    expect(document.activeElement?.id).toBe("entity-bar");

    window.history.replaceState(null, "", "/?record=0001");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(document.getElementById("record-panel")?.classList.contains("open")).toBe(true);
    expect(document.getElementById("entity-bar")?.hidden).toBe(true);
    expect(visibleIds()).toHaveLength(4);
  });

  it("gathers the paths under a pattern and the records of a symbol, doc, or area", async () => {
    await settle(50);
    openRecordLink("0002");
    await settle(20);
    panelEntity("file", "src/**").click();
    await settle(50);
    expect(visibleIds()).toEqual(["0002", "0001"]);
    expect(document.getElementById("entity-count")?.textContent).toBe("1 record names it, 1 more by pattern");

    openRecordLink("0003");
    await settle(20);
    panelEntity("file", "docs/API.md").click();
    await settle(50);
    expect(visibleIds()).toEqual(["0003"]);

    openRecordLink("0001");
    await settle(20);
    panelEntity("area", "cli").click();
    await settle(50);
    // The area filter joins the path view; clearing the view keeps the area.
    expect(visibleIds()).toEqual([]);
    expect(document.activeElement?.id).toBe("entity-bar");
    (document.getElementById("entity-clear") as HTMLElement).click();
    await settle(50);
    expect(visibleIds()).toEqual(["D001", "0001"]);
    expect(document.activeElement?.id).toBe("result-count");
    expect(new URL(window.location.href).searchParams.get("area")).toBe("cli");

    window.history.replaceState(null, "", "/?symbol=runCli");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(visibleIds()).toEqual(["0001"]);
    expect(document.getElementById("entity-kind")?.textContent).toBe("Symbol");
  });

  it("follows relationships and backlinks between records", async () => {
    await settle(50);
    openRecordLink("0001");
    await settle(20);
    const decision = panelButton('[data-open-record="D001"]');
    expect(decision.textContent).toContain("Keep one CLI");
    decision.click();
    await settle(20);
    const body = document.getElementById("record-panel-body")!;
    expect(body.querySelector(".record-panel-title")?.textContent).toBe("Keep one CLI");
    expect(new URL(window.location.href).searchParams.get("record")).toBe("D001");

    const backlink = panelButton('[data-open-record="0001"]');
    expect(backlink.textContent).toContain("Depends on it");
    panelEntity("linked", "D001").click();
    await settle(50);
    expect(visibleIds()).toEqual(["0001"]);
    expect(document.getElementById("entity-kind")?.textContent).toBe("Linked to");
    expect(document.getElementById("entity-count")?.textContent).toBe("1 record links here");
    (document.querySelector('#entity-value [data-open-record="D001"]') as HTMLElement).click();
    await settle(20);
    expect(body.querySelector(".record-panel-title")?.textContent).toBe("Keep one CLI");

    openRecordLink("0003");
    await settle(20);
    expect(body.querySelector(".entity-missing")?.textContent).toContain("B001 is not in this reader");
  });

  it("suggests symbols, paths, and areas in the palette and opens the chosen one", async () => {
    await settle(50);
    const dialog = document.getElementById("command-palette") as HTMLDialogElement;
    if (typeof dialog.showModal !== "function") {
      dialog.showModal = () => dialog.setAttribute("open", "");
      dialog.close = () => dialog.removeAttribute("open");
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    await settle(50);
    const input = document.getElementById("command-search") as HTMLInputElement;
    input.value = "runcli";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(50);
    const first = document.querySelector(".command-result") as HTMLElement;
    expect(first.dataset.entity).toBe("symbol");
    expect(first.textContent).toContain("runCli");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(50);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(visibleIds()).toEqual(["0001"]);
    expect(new URL(window.location.href).searchParams.get("symbol")).toBe("runCli");

    input.value = "api.md";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(50);
    const path = document.querySelector('.command-result[data-entity="file"]') as HTMLElement;
    expect(path.textContent).toContain("docs/API.md");
    path.click();
    await settle(50);
    expect(visibleIds()).toEqual(["0003"]);
    expect(new URL(window.location.href).searchParams.get("symbol")).toBeNull();
    expect(new URL(window.location.href).searchParams.get("file")).toBe("docs/API.md");
  });

  it("copies a record's link, path, packet command, and context, and falls back to a selection", async () => {
    await settle(50);
    openRecordLink("0001");
    await settle(20);
    const link = panelButton('[data-copy="link"]');
    link.click();
    await settle(20);
    expect(copied[0]).toMatch(/\?record=0001$/);
    expect(link.textContent).toBe("Copied");
    expect(document.getElementById("filter-status")?.textContent).toBe("Copied the link.");
    panelButton('[data-copy="path"]').click();
    panelButton('[data-copy="command"]').click();
    panelButton('.agent-packet [data-copy="context"]').click();
    await settle(20);
    expect(copied.slice(1)).toEqual([
      ".ledger/entries/0001.md",
      "ledger packet src/cli.ts --budget 1200",
      "ledger packet src/cli.ts --budget 1200\n0001: Run the CLI\nInvariants: Stays.\nVerification: npm test",
    ]);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => Promise.reject(new DOMException("Denied", "NotAllowedError")) },
    });
    const selections: string[] = [];
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => {
        selections.push(`${command}:${(document.activeElement as HTMLTextAreaElement | null)?.value ?? ""}`);
        return true;
      },
    });
    try {
      const path = panelButton('[data-copy="path"]');
      path.click();
      await settle(20);
      expect(selections).toEqual(["copy:.ledger/entries/0001.md"]);
      expect(path.textContent).toBe("Copied");
      expect(document.querySelector("textarea")).toBeNull();
    } finally {
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });
});

describe("changes since the last visit", () => {
  const key = "ledger-visits:reader-runtime:internal";
  const hour = 60 * 60 * 1000;
  let html: string;
  let hashes: Record<string, string>;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    const model = buildStaticReaderModel(workspace(), [
      record("0001", "Static reader renderer", ["reader"], "landed"),
      record("0002", "Retry policy for the CLI", ["cli"], "landed"),
      record("0003", "Cache warm command", ["cache"], "draft"),
    ]);
    globalThis.fetch = (async () => new Response("[]", { headers: { "content-type": "application/json" } })) as typeof fetch;
    html = renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" });
    hashes = Object.fromEntries([...html.matchAll(/data-id="([^"]+)"[^>]*?data-hash="([^"]+)"/g)].map((match) => [match[1]!, match[2]!]));
  });

  const chips = () =>
    Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>(".change-chip")).map((chip) => [chip.closest<HTMLElement>(".entry")?.dataset.id, chip.textContent]));
  const stored = () => JSON.parse(localStorage.getItem(key) || "null") as { current: Record<string, string>; previous?: Record<string, string> };

  it("records a baseline on a first visit and marks nothing", async () => {
    expect(Object.keys(hashes)).toEqual(["0003", "0002", "0001"]);
    mount(html);
    await settle(50);
    expect(chips()).toEqual({});
    expect(document.getElementById("visit-note")?.hidden).toBe(true);
    expect(stored()).toMatchObject({ current: hashes });
    expect(stored().previous).toBeUndefined();
  });

  it("marks new and updated records after a gap, lists only them, and forgets them once seen", async () => {
    localStorage.setItem(key, JSON.stringify({ v: 1, visitedAt: Date.now() - 2 * hour, current: { "0001": "0123456789ab", "0002": hashes["0002"] } }));
    mount(html);
    await settle(50);
    expect(chips()).toEqual({ "0003": "New", "0001": "Updated" });
    const toggle = document.getElementById("changed-toggle") as HTMLElement;
    expect(document.getElementById("visit-note")?.hidden).toBe(false);
    expect(toggle.textContent).toBe("2 changed since your last visit");

    toggle.click();
    await settle(50);
    expect(visibleIds()).toEqual(["0003", "0001"]);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(new URL(window.location.href).searchParams.get("changed")).toBe("1");
    expect(document.getElementById("filter-status")?.textContent).toContain("1 active filter");

    // A reload within the same visit keeps comparing with the earlier visit, and the URL keeps the filter.
    mount(html);
    await settle(50);
    expect(chips()).toEqual({ "0003": "New", "0001": "Updated" });
    expect(visibleIds()).toEqual(["0003", "0001"]);

    (document.getElementById("mark-seen") as HTMLElement).click();
    await settle(50);
    expect(chips()).toEqual({});
    expect(document.getElementById("visit-note")?.hidden).toBe(true);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
    expect(new URL(window.location.href).searchParams.get("changed")).toBeNull();
    expect(stored().previous).toEqual(hashes);
    expect(document.activeElement?.id).toBe("result-count");
  });

  it("starts a new visit after a gap, so changes seen last time are no longer marked", async () => {
    localStorage.setItem(
      key,
      JSON.stringify({ v: 1, visitedAt: Date.now() - 2 * hour, current: hashes, previous: { "0001": "0123456789ab" } }),
    );
    mount(html);
    await settle(50);
    expect(chips()).toEqual({});
    expect(stored().previous).toEqual(hashes);
  });

  it("ignores unreadable state and keeps working without storage", async () => {
    localStorage.setItem(key, "{not json");
    mount(html);
    await settle(50);
    expect(chips()).toEqual({});
    expect(stored().current).toEqual(hashes);

    const denied = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: denied, setItem: denied, removeItem: denied, clear: () => undefined });
    mount(html);
    await settle(50);
    expect(visibleIds()).toEqual(["0003", "0002", "0001"]);
    expect(document.getElementById("visit-note")?.hidden).toBe(true);
  });
});

function openRecordLink(id: string): void {
  (document.querySelector(`.entry[data-id="${id}"] .entry-link`) as HTMLElement).click();
}

function panelButton(selector: string): HTMLElement {
  const button = document.getElementById("record-panel-body")?.querySelector<HTMLElement>(selector);
  if (!button) throw new Error(`No ${selector} in the record panel`);
  return button;
}

/** A panel button for an entity: an item of the list that names the type, or a chip that carries it. */
function panelEntity(type: string, value: string): HTMLElement {
  const buttons = document.getElementById("record-panel-body")?.querySelectorAll<HTMLElement>(`[data-entity="${type}"] button, button[data-entity="${type}"]`) ?? [];
  const button = Array.from(buttons).find((candidate) => (candidate.dataset.value ?? candidate.textContent) === value);
  if (!button) throw new Error(`No ${type} ${value} in the record panel`);
  return button;
}

describe("reader runtime with chunked details", () => {
  it("fetches a detail chunk when a record opens and falls back when it cannot", async () => {
    const model = buildStaticReaderModel(workspace(), [
      record("0001", "Static reader renderer", ["reader"], "landed"),
      record("0002", "Retry policy for the CLI", ["cli"], "landed"),
    ]);
    const chunked = chunkRecordDetails(renderRecordDetails(model), 250_000);
    const chunks = new Map(chunked.files.map((file) => [file.href, file.content]));
    let failChunks = false;
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("search-index.json")) return new Response("[]", { headers: { "content-type": "application/json" } });
      const chunk = [...chunks.entries()].find(([href]) => url.endsWith(href));
      if (chunk && !failChunks) return new Response(chunk[1], { headers: { "content-type": "application/json" } });
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const html = renderStaticReaderHtml(model, { iconSvg: "<svg></svg>", detailChunks: chunked.hrefById });
    expect(html).not.toContain('<template class="entry-detail">');
    mount(html);
    await settle(50);

    (document.querySelector('.entry[data-id="0002"] .entry-link') as HTMLElement).click();
    await settle(50);
    const body = document.getElementById("record-panel-body");
    expect(document.getElementById("record-panel")?.classList.contains("open")).toBe(true);
    expect(body?.querySelector(".record-panel-title")?.textContent).toBe("Retry policy for the CLI");
    expect(body?.querySelector(".context-panel")).not.toBeNull();
    expect(Array.from(body?.querySelectorAll("[data-copy]") ?? []).map((button) => (button as HTMLElement).dataset.copy)).toEqual([
      "link",
      "path",
      "command",
      "context",
    ]);
    expect(requested.filter((url) => url.endsWith("details/000.json"))).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(20);
    (document.querySelector('.entry[data-id="0001"] .entry-link') as HTMLElement).click();
    await settle(50);
    expect(body?.querySelector(".record-panel-title")?.textContent).toBe("Static reader renderer");
    expect(requested.filter((url) => url.endsWith("details/000.json"))).toHaveLength(1);
  });

  it("shows the row title, a served-over-HTTP note, and the source link when chunks cannot load", async () => {
    const model = buildStaticReaderModel(workspace(), [record("0001", "Static reader renderer", ["reader"], "landed")]);
    const chunked = chunkRecordDetails(renderRecordDetails(model), 250_000);
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>", detailChunks: chunked.hrefById }));
    await settle(50);
    (document.querySelector('.entry[data-id="0001"] .entry-link') as HTMLElement).click();
    await settle(50);
    const body = document.getElementById("record-panel-body");
    expect(body?.querySelector(".record-panel-title")?.textContent).toBe("Static reader renderer");
    expect(body?.textContent).toContain("served over HTTP");
    expect(body?.querySelector("a")?.getAttribute("href")).toMatch(/^sources\/0001-[a-f0-9]{16}\.md$/);
    // The reference lists come from the row, so they work offline too.
    expect(body?.querySelector('ul[data-entity="file"] code')?.textContent).toBe("src/cli.ts");
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

function visibleIds(): readonly string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".entry"))
    .filter((entry) => !entry.hidden)
    .map((entry) => entry.dataset.id || "");
}

function type(id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function select(id: string, value: string): void {
  const control = document.getElementById(id) as HTMLSelectElement;
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workspace(): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger-reader-runtime",
    ledgerRoot: "/tmp/ledger-reader-runtime/.ledger",
    configPath: "/tmp/ledger-reader-runtime/.ledger/config.yaml",
    config: { ...defaultConfig, project: "reader-runtime" },
  };
}

interface RecordOptions {
  readonly kind?: "change" | "decision";
  readonly files?: readonly string[];
  readonly symbols?: readonly string[];
  readonly docs?: readonly string[];
  readonly decisions?: readonly string[];
  readonly backlog?: readonly string[];
  readonly related?: readonly string[];
}

function record(id: string, title: string, areas: readonly string[], status: string, options: RecordOptions = {}): ParsedLedgerDocument {
  const list = (values: readonly string[]) => `[${values.map((value) => `"${value}"`).join(", ")}]`;
  const kind = options.kind ?? "change";
  const raw = [
    "---",
    `id: "${id}"`,
    `kind: "${kind}"`,
    `title: "${title}"`,
    'date: "2026-06-29"',
    'updated: "2026-06-29"',
    `status: "${status}"`,
    `areas: ${list(areas)}`,
    `files: ${list(options.files ?? ["src/cli.ts"])}`,
    ...(["symbols", "docs", "decisions", "backlog", "related"] as const)
      .filter((field) => options[field])
      .map((field) => `${field}: ${list(options[field]!)}`),
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
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger-reader-runtime/.ledger/entries/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}
