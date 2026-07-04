export const staticReaderStyles = `    :root {
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
    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo {
      width: 56px;
      height: 56px;
      flex: 0 0 auto;
    }
    .logo svg {
      display: block;
      width: 100%;
      height: 100%;
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
    .facet-group {
      border-top: 1px solid var(--line);
      margin-top: 16px;
      padding-top: 14px;
    }
    .facet-list {
      display: grid;
      gap: 6px;
    }
    .facet-button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      padding: 6px 8px;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .facet-button:hover { border-color: var(--accent); }
    .facet-button small { color: var(--muted); }
    .graph-summary {
      display: grid;
      gap: 10px;
    }
    .graph-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .mini-stat {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fbfcfe;
      padding: 7px;
      min-width: 0;
    }
    .mini-stat strong {
      display: block;
      font-size: 1rem;
      overflow-wrap: anywhere;
    }
    .mini-stat span {
      display: block;
      color: var(--muted);
      font-size: .72rem;
    }
    .sidecar-link {
      color: var(--accent);
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .graph-list {
      display: grid;
      gap: 5px;
      font-size: .85rem;
    }
    .graph-list > strong {
      color: var(--muted);
      font-size: .8rem;
    }
    .graph-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .graph-row span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .graph-row small { color: var(--muted); }
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
    .score-pill {
      border-color: #155e75;
      color: #155e75;
      font-weight: 650;
    }
    .summary {
      max-width: 760px;
      color: var(--text);
    }
    .context-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .context {
      border-left: 3px solid var(--accent);
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 6px;
    }
    .context strong {
      display: block;
      margin-bottom: 6px;
      font-size: .85rem;
      color: var(--muted);
    }
    .context ul { margin: 0; padding-left: 18px; }
    .paths, .source { margin-top: 12px; }
    .relationships { margin-top: 12px; }
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
      .context-grid { grid-template-columns: 1fr; }
      .brand { align-items: flex-start; }
    }`;

export const staticReaderRuntime = `    let searchIndexPromise;
    function loadSearchIndex() {
      if (!searchIndexPromise) {
        searchIndexPromise = fetch("search-index.json")
          .then((response) => response.ok ? response.json() : [])
          .catch(() => []);
      }
      return searchIndexPromise;
    }

    const searchWeights = {
      id: 16,
      title: 14,
      path: 10,
      symbols: 9,
      files: 8,
      docs: 6,
      metadata: 5,
      context: 4,
      summary: 3,
      terms: 1
    };

    function fuzzyScore(query, terms) {
      if (!query) return 1;
      if (!terms) return 0;
      const normalizedQuery = query.toLowerCase();
      const normalizedTerms = terms.toLowerCase();
      if (normalizedTerms.includes(normalizedQuery)) return 100 + normalizedQuery.length;
      let score = 0;
      let position = 0;
      for (const character of normalizedQuery) {
        const found = normalizedTerms.indexOf(character, position);
        if (found === -1) return 0;
        score += Math.max(1, 12 - (found - position));
        position = found + 1;
      }
      return score;
    }

    function scoreSearchDocument(query, document) {
      if (!document.fields) return fuzzyScore(query, document.terms);
      return Object.entries(searchWeights).reduce((score, [field, weight]) => {
        const value = field === "terms" ? document.terms : document.fields[field];
        return score + fuzzyScore(query, value) * weight;
      }, 0);
    }

    async function searchMatches(query) {
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

    const controls = {
      search: document.getElementById("search"),
      kind: document.getElementById("kind"),
      warning: document.getElementById("warning"),
      missingRef: document.getElementById("missingRef"),
      duplicate: document.getElementById("duplicate"),
      coverage: document.getElementById("coverage"),
      status: document.getElementById("status"),
      area: document.getElementById("area"),
      release: document.getElementById("release"),
      tag: document.getElementById("tag")
    };
    const entries = Array.from(document.querySelectorAll(".entry"));
    const entriesContainer = document.getElementById("entries");
    const resultCount = document.getElementById("result-count");
    const empty = document.getElementById("empty");

    function datasetList(entry, key) {
      try {
        const parsed = JSON.parse(entry.dataset[key] || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function matches(entry, matchedScores, search) {
      const kind = controls.kind.value;
      const status = controls.status.value;
      const area = controls.area.value;
      const release = controls.release.value;
      const warning = controls.warning.value;
      const missingRef = controls.missingRef.value;
      const duplicate = controls.duplicate.value;
      const coverage = controls.coverage.value;
      const tag = controls.tag.value;
      if (matchedScores && !matchedScores.has(entry.dataset.id)) return false;
      if (!matchedScores && search && !entry.dataset.search.includes(search)) return false;
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

    async function applyFilters() {
      const search = controls.search.value.trim().toLowerCase();
      const matchedScores = await searchMatches(search);
      let visible = 0;
      const sortedEntries = matchedScores
        ? [...entries].sort((left, right) =>
            (matchedScores.get(right.dataset.id) || 0) -
            (matchedScores.get(left.dataset.id) || 0)
          )
        : entries;
      for (const entry of sortedEntries) entriesContainer.appendChild(entry);
      for (const entry of entries) {
        const show = matches(entry, matchedScores, search);
        entry.hidden = !show;
        const scoreLabel = entry.querySelector("[data-score-label]");
        if (scoreLabel) {
          const score = matchedScores ? matchedScores.get(entry.dataset.id) : undefined;
          scoreLabel.hidden = !score;
          scoreLabel.textContent = score ? "score " + Math.round(score) : "";
        }
        if (show) visible += 1;
      }
      resultCount.textContent = search && matchedScores
        ? visible + " ranked match(es)"
        : visible + " document(s)";
      empty.hidden = visible !== 0;
    }

    for (const control of Object.values(controls)) {
      control.addEventListener("input", () => { void applyFilters(); });
    }
    for (const button of document.querySelectorAll("[data-filter-field]")) {
      button.addEventListener("click", () => {
        const field = button.dataset.filterField;
        const value = button.dataset.filterValue;
        if (!field || value === undefined || !controls[field]) return;
        controls[field].value = value;
        void applyFilters();
      });
    }`;
