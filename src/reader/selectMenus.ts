export interface SelectMenus {
  sync(): void;
  close(): void;
}

interface SelectControl {
  readonly select: HTMLSelectElement;
  readonly trigger: HTMLButtonElement;
  readonly label: HTMLSpanElement;
  value: string;
}

const enhancedDocuments = new WeakMap<Document, { readonly controls: readonly SelectControl[]; readonly menus: SelectMenus }>();
const typeaheadDelay = 600;
const viewportMargin = 12;
const menuGap = 6;
let nextMenuId = 0;

/** Enhance the reader's native selects while keeping their values and events canonical. */
export function enhanceSelectMenus(root: Document = document): SelectMenus {
  const existing = enhancedDocuments.get(root);
  if (existing?.controls.some((control) => control.trigger.isConnected)) return existing.menus;
  const view = root.defaultView;
  if (!view) return { sync() {}, close() {} };
  const menu = root.createElement("div");
  menu.className = "select-menu";
  menu.id = `ledger-select-menu-${++nextMenuId}`;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  menu.style.position = "fixed";
  root.body.append(menu);
  const controls: SelectControl[] = [];
  let openControl: SelectControl | undefined;
  let activeIndex = -1;
  let typed = "";
  let typedAt = 0;

  function icon(name: string, className: string): SVGSVGElement {
    const svg = root.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `ui-icon ${className}`);
    svg.setAttribute("aria-hidden", "true");
    const use = root.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function labelFor(select: HTMLSelectElement): string {
    return select.dataset.menuLabel ?? select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent?.trim() ?? "Choose an option";
  }

  function enabled(option: HTMLOptionElement): boolean {
    return !option.disabled && !option.hidden && !(option.parentElement?.tagName === "OPTGROUP" && (option.parentElement as HTMLOptGroupElement).disabled);
  }

  function optionLabel(option: HTMLOptionElement): string {
    return option.getAttribute("label") ?? option.textContent?.trim() ?? "";
  }

  function close(): void {
    openControl?.trigger.setAttribute("aria-expanded", "false");
    openControl?.trigger.removeAttribute("aria-activedescendant");
    openControl = undefined;
    activeIndex = -1;
    typed = "";
    menu.hidden = true;
  }

  function position(): void {
    if (!openControl) return;
    const rect = openControl.trigger.getBoundingClientRect();
    const width = root.documentElement.clientWidth || view!.innerWidth;
    const height = root.documentElement.clientHeight || view!.innerHeight;
    const menuWidth = Math.min(Math.max(220, rect.width), Math.max(0, width - 2 * viewportMargin));
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${Math.max(0, Math.min(360, height - 2 * viewportMargin))}px`;
    const desiredHeight = menu.getBoundingClientRect().height || Math.min(360, menu.children.length * 40);
    const below = height - rect.bottom - viewportMargin - menuGap;
    const above = rect.top - viewportMargin - menuGap;
    const flip = below < desiredHeight && above > below;
    const available = Math.max(0, flip ? above : below);
    const actualHeight = Math.min(desiredHeight, available);
    menu.style.maxHeight = `${Math.min(360, available)}px`;
    menu.style.left = `${Math.max(viewportMargin, Math.min(rect.left, width - menuWidth - viewportMargin))}px`;
    menu.style.top = `${Math.max(viewportMargin, flip ? rect.top - menuGap - actualHeight : rect.bottom + menuGap)}px`;
  }

  function markActive(scroll = false): void {
    if (!openControl) return;
    for (const row of menu.querySelectorAll<HTMLElement>(".select-option")) {
      const active = Number(row.dataset.index) === activeIndex;
      row.classList.toggle("is-focused", active);
      if (active) {
        openControl.trigger.setAttribute("aria-activedescendant", row.id);
        if (scroll) row.scrollIntoView({ block: "nearest" });
      }
    }
    if (activeIndex < 0) openControl.trigger.removeAttribute("aria-activedescendant");
  }

  function render(): void {
    if (!openControl) return;
    const { select } = openControl;
    const options = Array.from(select.options);
    if (!options[activeIndex] || !enabled(options[activeIndex]!)) activeIndex = options.findIndex(enabled);
    const title = root.createElement("div");
    title.className = "select-menu-title";
    title.setAttribute("role", "presentation");
    title.textContent = labelFor(select);
    menu.setAttribute("aria-label", labelFor(select));
    menu.replaceChildren(title);
    options.forEach((option, index) => {
      if (option.hidden) return;
      const row = root.createElement("div");
      row.className = "select-option";
      row.id = `${menu.id}-option-${index}`;
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(option.selected));
      row.setAttribute("aria-disabled", String(!enabled(option)));
      const text = root.createElement("span");
      text.className = "select-option-label";
      text.textContent = optionLabel(option);
      const check = root.getElementById("i-check") ? icon("check", "select-option-check") : root.createElement("span");
      if (check.tagName === "SPAN") {
        check.setAttribute("class", "select-option-check");
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✓";
      }
      row.append(text, check);
      menu.append(row);
    });
    markActive();
    position();
  }

  function sync(): void {
    for (const control of controls) {
      const { select, trigger, label } = control;
      const selected = select.selectedOptions[0];
      const selectedLabel = selected ? optionLabel(selected) : "Choose an option";
      label.textContent = select.value === "all" && select.dataset.placeholder
        ? select.dataset.placeholder
        : select.value !== "all" && select.dataset.labelPrefix ? `${select.dataset.labelPrefix}: ${selectedLabel}` : selectedLabel;
      trigger.disabled = select.matches(":disabled");
      trigger.classList.toggle("is-active", select.classList.contains("is-active"));
      trigger.setAttribute("aria-label", `${select.getAttribute("aria-label") ?? labelFor(select)}: ${selectedLabel}`);
      if (openControl === control) {
        if (trigger.disabled || !trigger.isConnected || select.closest("[inert]")) close();
        else if (control.value !== select.value) activeIndex = select.selectedIndex;
      }
      control.value = select.value;
    }
    render();
  }

  function open(control: SelectControl): void {
    sync();
    if (control.trigger.disabled || !control.trigger.isConnected) return;
    close();
    openControl = control;
    activeIndex = control.select.selectedIndex;
    control.trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    render();
    markActive(true);
  }

  function choose(index: number): void {
    if (!openControl) return;
    const { select, trigger } = openControl;
    const option = select.options[index];
    if (!option || !enabled(option)) return;
    close();
    trigger.focus({ preventScroll: true });
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      select.dispatchEvent(new view!.Event("input", { bubbles: true }));
      select.dispatchEvent(new view!.Event("change", { bubbles: true }));
    }
    sync();
  }

  function move(direction: number): void {
    if (!openControl) return;
    const indexes = Array.from(openControl.select.options).flatMap((option, index) => enabled(option) ? [index] : []);
    if (indexes.length === 0) return;
    const current = indexes.indexOf(activeIndex);
    activeIndex = indexes[Math.max(0, Math.min(indexes.length - 1, current + direction))]!;
    markActive(true);
  }

  for (const select of root.querySelectorAll<HTMLSelectElement>(".select-wrap select:not([multiple])")) {
    const trigger = root.createElement("button");
    trigger.type = "button";
    trigger.className = "select-trigger";
    if (select.id) trigger.id = `${select.id}-trigger`;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", menu.id);
    const label = root.createElement("span");
    label.className = "select-value";
    trigger.append(label, icon("chevron", "select-chevron"));
    const control: SelectControl = { select, trigger, label, value: select.value };
    controls.push(control);
    select.after(trigger);
    select.hidden = true;
    select.parentElement?.classList.add("is-enhanced");
    select.addEventListener("input", sync);
    select.addEventListener("change", sync);
    trigger.addEventListener("click", () => openControl === control ? close() : open(control));
    trigger.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        close();
        return;
      }
      if (event.key === "Escape" && !openControl) return;
      event.stopPropagation();
      if (event.key === "Tab") { close(); return; }
      if (event.key === "Escape") {
        if (openControl) { event.preventDefault(); close(); trigger.focus(); }
        return;
      }
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        const wasOpen = openControl === control;
        if (!wasOpen) open(control);
        if (event.key === "Home") move(-Infinity);
        else if (event.key === "End") move(Infinity);
        else if (wasOpen && (event.key === "Enter" || event.key === " ")) choose(activeIndex);
        else if (wasOpen) move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key.length !== 1) return;
      event.preventDefault();
      if (openControl !== control) open(control);
      const now = Date.now();
      typed = now - typedAt > typeaheadDelay ? event.key.toLocaleLowerCase() : typed + event.key.toLocaleLowerCase();
      typedAt = now;
      const query = Array.from(typed).every((character) => character === typed[0]) ? typed[0]! : typed;
      const options = Array.from(select.options);
      const start = query.length === 1 ? activeIndex + 1 : activeIndex;
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (Math.max(0, start) + offset) % options.length;
        if (enabled(options[index]!) && optionLabel(options[index]!).toLocaleLowerCase().startsWith(query)) {
          activeIndex = index;
          markActive(true);
          break;
        }
      }
    });
  }
  menu.addEventListener("pointerdown", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => {
    const row = event.target instanceof view.Element ? event.target.closest<HTMLElement>(".select-option") : null;
    if (row) choose(Number(row.dataset.index));
  });
  function closeOutside(event: Event): void {
    if (openControl && event.target instanceof view!.Node && !menu.contains(event.target) && !openControl.trigger.contains(event.target)) close();
  }
  root.addEventListener("pointerdown", closeOutside);
  root.addEventListener("click", closeOutside);
  root.addEventListener("focusin", (event) => {
    if (openControl && event.target !== openControl.trigger && !(event.target instanceof view.Node && menu.contains(event.target))) close();
  });
  root.addEventListener("scroll", (event) => {
    if (!(event.target instanceof view.Node && menu.contains(event.target))) close();
  }, true);
  view.addEventListener("resize", close);
  sync();
  const menus = { sync, close };
  enhancedDocuments.set(root, { controls, menus });
  return menus;
}
