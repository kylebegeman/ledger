// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { buildStaticReaderModel, buildSearchIndex, chunkRecordDetails, type LedgerStaticReaderModel } from "../src/render.js";
import { staticReaderRuntime, staticReaderStyles } from "../src/renderAssets.js";
import { renderRecordDetails, renderStaticReaderHtml } from "../src/renderHtml.js";
import { defaultConfig } from "../src/config.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.documentElement.innerHTML = "";
  delete document.documentElement.dataset.theme;
});

describe("reader runtime bundle", () => {
  it("is built from typed sources and imports the shared search scoring once", async () => {
    expect(staticReaderRuntime).toContain("function fuzzyScore(");
    expect(staticReaderRuntime).toContain("function scoreSearchFields(");
    expect(staticReaderRuntime.match(/function fuzzyScore\(/g)).toHaveLength(1);
    expect(staticReaderRuntime).not.toContain("import ");
    expect(staticReaderRuntime).not.toContain("export ");
    expect(staticReaderStyles).toContain("light-dark(");
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
    const index = buildSearchIndex(model.documents);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("search-index.json")) return new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    mount(renderStaticReaderHtml(model, { iconSvg: "<svg></svg>" }));
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

  it("toggles the theme and persists it", async () => {
    await settle(50);
    const toggle = document.getElementById("theme-toggle") as HTMLElement;
    expect(toggle.getAttribute("aria-label")).toMatch(/Switch to (dark|light) theme/);
    toggle.click();
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
    expect(localStorage.getItem("ledger-theme")).toBe(document.documentElement.dataset.theme);
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
    const results = Array.from(document.querySelectorAll(".command-result")).map((button) => (button as HTMLElement).dataset.id);
    expect(results[0]).toBe("0003");
    expect(document.getElementById("command-status")?.textContent).toContain("for “cache”");
  });
});

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
  });
});

function mount(html: string): void {
  const withoutScripts = html.replace(/<script>[\s\S]*?<\/script>/g, "");
  const bodyStart = withoutScripts.indexOf("<body");
  const bodyEnd = withoutScripts.lastIndexOf("</body>");
  const bodyInner = withoutScripts.slice(withoutScripts.indexOf(">", bodyStart) + 1, bodyEnd);
  document.body.innerHTML = bodyInner;
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

function record(id: string, title: string, areas: readonly string[], status: string): ParsedLedgerDocument {
  const raw = [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    `title: "${title}"`,
    'date: "2026-06-29"',
    'updated: "2026-06-29"',
    `status: "${status}"`,
    `areas: [${areas.map((area) => `"${area}"`).join(", ")}]`,
    'files: ["src/cli.ts"]',
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
    kind: "change",
  };
}
