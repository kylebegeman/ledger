// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceSelectMenus } from "../src/reader/selectMenus.js";

beforeEach(() => {
  document.body.innerHTML = `<span class="select-wrap"><select id="area" aria-label="Filter by area" data-menu-label="Area" data-placeholder="Area" data-label-prefix="Area">
    <option value="all">All areas</option><option value="api">API</option><option value="cache" disabled>Cache</option><option value="cli">CLI</option><option value="reader">Reader</option>
  </select></span><span class="select-wrap"><select id="sort" aria-label="Sort records">
    <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
  </select></span><button id="outside">Outside</button>`;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function native(id = "area"): HTMLSelectElement {
  return document.getElementById(id) as HTMLSelectElement;
}

function trigger(id = "area"): HTMLButtonElement {
  return document.getElementById(`${id}-trigger`) as HTMLButtonElement;
}

function menu(): HTMLElement {
  return document.querySelector<HTMLElement>(".select-menu")!;
}

function key(value: string, id = "area"): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  trigger(id).dispatchEvent(event);
  return event;
}

function row(label: string): HTMLElement {
  return Array.from(menu().querySelectorAll<HTMLElement>(".select-option")).find((option) => option.querySelector(".select-option-label")?.textContent === label)!;
}

describe("reader select menus", () => {
  it("retains native fallback until enhanced and dispatches native selection events after closing", () => {
    expect(native().hidden).toBe(false);
    enhanceSelectMenus();
    expect(native().hidden).toBe(true);
    expect(trigger().getAttribute("role")).toBe("combobox");
    expect(trigger().getAttribute("aria-label")).toBe("Filter by area: All areas");
    expect(trigger("sort").getAttribute("aria-label")).toBe("Sort records: Newest first");
    expect(trigger().textContent).toBe("Area");
    const events: string[] = [];
    const onSelection = (event: Event) => {
      if (event.target !== native()) return;
      expect(menu().hidden).toBe(true);
      expect(native().value).toBe("reader");
      events.push(event.type);
    };
    document.addEventListener("input", onSelection);
    document.addEventListener("change", onSelection);
    try {
      trigger().click();
      expect(menu().getAttribute("role")).toBe("listbox");
      expect(menu().querySelector(".select-menu-title")?.textContent).toBe("Area");
      expect(row("All areas").getAttribute("aria-selected")).toBe("true");
      row("Reader").click();
      expect(events).toEqual(["input", "change"]);
      expect(trigger().textContent).toBe("Area: Reader");
      expect(trigger().getAttribute("aria-label")).toBe("Filter by area: Reader");
      expect(trigger().getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger());
    } finally {
      document.removeEventListener("input", onSelection);
      document.removeEventListener("change", onSelection);
    }
  });

  it("synchronizes programmatic values, active filters, option labels, and disabled state", () => {
    const menus = enhanceSelectMenus();
    native().value = "api";
    native().classList.add("is-active");
    menus.sync();
    expect(trigger().textContent).toBe("Area: API");
    expect(trigger().getAttribute("aria-label")).toBe("Filter by area: API");
    expect(trigger().classList.contains("is-active")).toBe(true);
    trigger().click();
    native().value = "cli";
    native().options[3]!.setAttribute("label", "Command line");
    menus.sync();
    expect(row("Command line").getAttribute("aria-selected")).toBe("true");
    expect(trigger().getAttribute("aria-activedescendant")).toBe(row("Command line").id);
    native().disabled = true;
    menus.sync();
    expect(trigger().disabled).toBe(true);
    expect(menu().hidden).toBe(true);
    native().disabled = false;
    native().value = "all";
    native().classList.remove("is-active");
    native().dispatchEvent(new Event("input", { bubbles: true }));
    expect(trigger().disabled).toBe(false);
    expect(trigger().textContent).toBe("Area");
    expect(trigger().classList.contains("is-active")).toBe(false);
  });

  it("navigates enabled options without committing until Enter or Space and contains reader shortcuts", () => {
    enhanceSelectMenus();
    const shortcut = vi.fn();
    document.addEventListener("keydown", shortcut);
    try {
      trigger().focus();
      key("ArrowDown");
      key("ArrowDown");
      expect(row("API").classList.contains("is-focused")).toBe(true);
      key("ArrowDown");
      expect(row("CLI").classList.contains("is-focused")).toBe(true);
      expect(native().value).toBe("all");
      key("Enter");
      expect(native().value).toBe("cli");
      key(" ");
      key("Home");
      expect(row("All areas").classList.contains("is-focused")).toBe(true);
      key("End");
      key(" ");
      expect(native().value).toBe("reader");
      expect(shortcut).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", shortcut);
    }
  });

  it("supports typeahead and Escape without changing the canonical value", () => {
    enhanceSelectMenus();
    trigger().focus();
    key("c");
    key("l");
    expect(row("CLI").classList.contains("is-focused")).toBe(true);
    expect(native().value).toBe("all");
    expect(key("Escape").defaultPrevented).toBe(true);
    expect(menu().hidden).toBe(true);
    expect(trigger().hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(native().value).toBe("all");
  });

  it("contains Escape while open and lets a subsequent Escape reach the surrounding reader", () => {
    enhanceSelectMenus();
    const surrounding = vi.fn();
    document.addEventListener("keydown", surrounding);
    try {
      trigger().focus();
      for (const character of ["j", "k", "g"]) key(character);
      expect(menu().hidden).toBe(false);
      expect(key("Escape").defaultPrevented).toBe(true);
      expect(surrounding).not.toHaveBeenCalled();
      expect(menu().hidden).toBe(true);
      expect(key("Escape").defaultPrevented).toBe(false);
      expect(surrounding).toHaveBeenCalledOnce();
      expect(native().value).toBe("all");
    } finally {
      document.removeEventListener("keydown", surrounding);
    }
  });

  it.each(["ctrlKey", "metaKey"] as const)("closes before passing %s+K to the command palette shortcut", (modifier) => {
    enhanceSelectMenus();
    trigger().click();
    const shortcut = vi.fn(() => expect(menu().hidden).toBe(true));
    document.addEventListener("keydown", shortcut);
    try {
      const event = new KeyboardEvent("keydown", { key: "k", [modifier]: true, bubbles: true, cancelable: true });
      trigger().dispatchEvent(event);
      expect(shortcut).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(false);
      expect(trigger().getAttribute("aria-expanded")).toBe("false");
      expect(native().value).toBe("all");
    } finally {
      document.removeEventListener("keydown", shortcut);
    }
  });

  it("closes on Tab, outside interaction, resize, and public close while allowing ordinary focus movement", () => {
    const menus = enhanceSelectMenus();
    trigger().click();
    expect(key("Tab").defaultPrevented).toBe(false);
    expect(menu().hidden).toBe(true);
    trigger().click();
    document.getElementById("outside")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(menu().hidden).toBe(true);
    document.getElementById("outside")!.focus();
    expect(document.activeElement?.id).toBe("outside");
    trigger().click();
    document.getElementById("outside")!.click();
    expect(menu().hidden).toBe(true);
    trigger().click();
    window.dispatchEvent(new Event("resize"));
    expect(menu().hidden).toBe(true);
    trigger().click();
    menus.close();
    expect(menu().hidden).toBe(true);
  });

  it("shares one menu across controls and never chooses disabled or hidden options", () => {
    native().insertAdjacentHTML("beforeend", '<optgroup label="Unavailable" disabled><option value="docs">Docs</option></optgroup><option value="hidden" hidden>Hidden</option>');
    const menus = enhanceSelectMenus();
    expect(enhanceSelectMenus()).toBe(menus);
    trigger().click();
    expect(row("Cache").getAttribute("aria-disabled")).toBe("true");
    row("Cache").click();
    row("Docs").click();
    expect(native().value).toBe("all");
    expect(row("Hidden")).toBeUndefined();
    trigger("sort").click();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger("sort").getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".select-menu")).toHaveLength(1);
    row("Oldest first").click();
    expect(native("sort").value).toBe("oldest");
    expect(trigger("sort").textContent).toBe("Oldest first");
  });

  it("bounds the popup to the viewport and flips above a low trigger", () => {
    enhanceSelectMenus();
    vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue({ left: window.innerWidth - 50, right: window.innerWidth, top: window.innerHeight - 40, bottom: window.innerHeight - 10, width: 50, height: 30, x: 0, y: 0, toJSON() {} });
    trigger().click();
    expect(parseFloat(menu().style.left) + parseFloat(menu().style.width)).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(parseFloat(menu().style.top)).toBeLessThan(window.innerHeight - 40);
    expect(parseFloat(menu().style.top)).toBeGreaterThanOrEqual(12);
  });
});
