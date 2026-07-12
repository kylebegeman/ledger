export const staticReaderStyles = `    :root {
      color-scheme: light dark;
      --canvas: light-dark(#f3f3ef, #111311);
      --canvas-glow: light-dark(rgba(59, 130, 246, 0.12), rgba(127, 179, 255, 0.14));
      --surface: light-dark(#ffffff, #1b1e1b);
      --surface-raised: light-dark(rgba(243, 243, 239, 0.88), rgba(17, 19, 17, 0.88));
      --surface-soft: light-dark(#ebece7, #252925);
      --surface-hover: light-dark(rgba(23, 24, 21, 0.05), rgba(242, 243, 239, 0.06));
      --ink: light-dark(#171815, #f2f3ef);
      --ink-soft: light-dark(#40433d, #c9ccc4);
      --muted: light-dark(#74786f, #999e94);
      --faint: light-dark(#a5a99f, #6f756c);
      --line: light-dark(rgba(23, 24, 21, 0.14), rgba(242, 243, 239, 0.16));
      --line-strong: light-dark(rgba(23, 24, 21, 0.24), rgba(242, 243, 239, 0.28));
      --accent: light-dark(#2563eb, #7fb3ff);
      --accent-strong: light-dark(#1c4ed8, #a3c8ff);
      --accent-soft: light-dark(#e3edff, #1b2f55);
      --on-accent: light-dark(#ffffff, #0c1a33);
      --positive: light-dark(#23856d, #6fd3b5);
      --positive-soft: light-dark(#dcf4eb, #173d34);
      --warning: light-dark(#a86616, #efb65f);
      --warning-soft: light-dark(#fff0d4, #49351a);
      --danger: light-dark(#b74b58, #ff9aa5);
      --danger-soft: light-dark(#ffe5e8, #4c2329);
      --decision: light-dark(#a8451c, #f0925e);
      --decision-soft: light-dark(#f9e7dc, #47230f);
      --accent-alt: light-dark(#0f7788, #7fd6e2);
      --accent-alt-soft: light-dark(#e0f3f6, #123c44);
      --code: light-dark(#171a18, #0c0e0d);
      --shadow-float: 0 32px 100px light-dark(rgba(15, 16, 14, 0.22), rgba(0, 0, 0, 0.58));
      --radius-xs: 8px;
      --radius-sm: 12px;
      --radius-md: 16px;
      --radius-lg: 20px;
      --radius-xl: 24px;
      --radius-pill: 999px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --max-width: 1480px;
    }
    html[data-theme="light"] { color-scheme: light; }
    html[data-theme="dark"] { color-scheme: dark; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      background:
        radial-gradient(circle at 52% -12%, var(--canvas-glow), transparent 34rem),
        var(--canvas);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.55;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    [hidden] { display: none !important; }
    button, input, select { font: inherit; }
    button, a, summary, select { -webkit-tap-highlight-color: transparent; }
    a { color: inherit; }
    button { color: inherit; }
    .ui-icon {
      width: 1.15em;
      height: 1.15em;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
    .skip-link {
      position: fixed;
      z-index: 100;
      top: 12px;
      left: 12px;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      background: var(--ink);
      color: var(--canvas);
      transform: translateY(-150%);
      transition: transform 160ms ease;
    }
    .skip-link:focus { transform: translateY(0); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .app-shell { min-height: 100vh; }
    .topbar {
      position: sticky;
      z-index: 30;
      top: 0;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(280px, 560px) minmax(180px, 1fr);
      align-items: center;
      gap: var(--space-6);
      padding: 10px max(20px, calc((100% - var(--max-width)) / 2));
      border-bottom: 1px solid var(--line);
      background: var(--surface-raised);
      backdrop-filter: blur(22px) saturate(1.25);
    }
    .identity {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      width: fit-content;
      text-decoration: none;
      border-radius: var(--radius-sm);
    }
    .logo, .logo-fallback {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 800;
    }
    .logo { background: transparent; }
    .logo svg { display: block; width: 100%; height: 100%; }
    .identity-copy { display: grid; min-width: 0; line-height: 1.15; }
    .identity-copy small {
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .identity-copy strong {
      overflow: hidden;
      font-size: 0.96rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .command-trigger {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 40px;
      padding: 0 10px 0 14px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      text-align: left;
      transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
    }
    .command-trigger:hover { border-color: var(--accent); color: var(--ink); background-color: var(--surface-hover); }
    .command-trigger span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      border: 1px solid var(--line);
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--muted);
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .profile-badge {
      padding: 7px 10px;
      border-radius: var(--radius-pill);
      background: var(--accent-soft);
      color: var(--accent-strong);
      font-size: 0.74rem;
      font-weight: 700;
    }
    .icon-button {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
    }
    .icon-button:hover { background-color: var(--surface-hover); color: var(--ink); transform: rotate(-5deg); }
    #theme-toggle [data-theme-icon] { display: none; }
    html[data-theme="system"] #theme-toggle [data-theme-icon="system"],
    html[data-theme="light"] #theme-toggle [data-theme-icon="light"],
    html[data-theme="dark"] #theme-toggle [data-theme-icon="dark"] { display: block; }
    main {
      width: min(calc(100% - 40px), var(--max-width));
      margin: 0 auto;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: 64px;
      padding: clamp(76px, 10vw, 140px) clamp(4px, 3vw, 42px) clamp(56px, 8vw, 96px);
    }
    .hero-copy { max-width: 820px; }
    .eyebrow {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1, h2, h3 { color: var(--ink); letter-spacing: -0.035em; }
    h1 {
      max-width: 780px;
      margin-bottom: 22px;
      font-size: clamp(2.8rem, 6.2vw, 5.8rem);
      font-weight: 800;
      line-height: 0.98;
    }
    .hero-description {
      max-width: 700px;
      margin-bottom: 0;
      color: var(--ink-soft);
      font-size: clamp(1rem, 1.7vw, 1.25rem);
      line-height: 1.65;
    }
    .metric-strip { display: flex; gap: 30px; padding-bottom: var(--space-2); }
    .metric { min-width: 68px; }
    button.metric {
      padding: var(--space-2) var(--space-3);
      margin: calc(var(--space-2) * -1) calc(var(--space-3) * -1);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      cursor: pointer;
      text-align: left;
      transition: background-color 140ms ease;
    }
    button.metric:hover { background-color: var(--surface-hover); }
    button.metric[aria-pressed="true"] { background-color: var(--accent-soft); }
    button.metric[aria-pressed="true"] strong { color: var(--accent-strong); }
    .metric strong { display: block; font-size: 1.55rem; font-weight: 700; letter-spacing: -0.04em; }
    .metric span { color: var(--muted); font-size: 0.76rem; font-weight: 600; }
    .search-region {
      display: grid;
      gap: var(--space-4);
      margin-bottom: clamp(32px, 5vw, 56px);
    }
    body[data-profile="public"] .search-region { width: min(100%, 920px); margin-inline: auto; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: clamp(30px, 5vw, 74px);
      align-items: start;
      padding-bottom: 100px;
    }
    .workspace-public { grid-template-columns: minmax(0, 920px); justify-content: center; }
    .rail {
      position: sticky;
      top: 78px;
      max-height: calc(100vh - 98px);
      overflow: auto;
      padding: var(--space-2) var(--space-1) 30px;
      scrollbar-width: thin;
      scrollbar-color: var(--faint) transparent;
    }
    .rail .browse-section:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
    .text-button, .search-clear {
      padding: 5px 8px;
      border: 0;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
    }
    .text-button:hover, .search-clear:hover { background: var(--accent-soft); }
    .filter-label {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.025em;
    }
    select {
      min-height: 36px;
      padding: 0 30px 0 14px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background-color: transparent;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23838880' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 14px 14px;
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      appearance: none;
      transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
    }
    select:hover { border-color: var(--muted); background-color: var(--surface-hover); }
    select.is-active { border-color: var(--accent); background-color: var(--accent-soft); color: var(--accent-strong); }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      padding: 0 var(--space-1);
    }
    summary { list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .advanced-filters { display: contents; }
    .advanced-filters > summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .advanced-filters > summary:hover { border-color: var(--muted); background-color: var(--surface-hover); }
    details[open] > summary .ui-icon:last-child { transform: rotate(180deg); }
    .advanced-filters > div {
      flex-basis: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .browse-section {
      margin-top: 30px;
      padding-top: var(--space-5);
      border-top: 1px solid var(--line);
    }
    .browse-section .filter-label { margin: 0 0 10px; }
    .facet-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .facet-list + .facet-list { margin-top: var(--space-2); }
    .facet-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: 100%;
      min-height: 30px;
      padding: 5px 9px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--surface-soft);
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.72rem;
      transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;
    }
    .facet-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .facet-button small { color: var(--muted); }
    .facet-button:hover { transform: translateY(-1px); color: var(--ink); }
    .facet-button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
    .facet-button[aria-pressed="true"] small { color: inherit; opacity: 0.75; }
    .graph-summary {
      margin-top: 30px;
      padding: 18px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--ink-soft);
    }
    .section-heading { display: flex; align-items: flex-start; gap: 10px; }
    .section-heading > span {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      border-radius: var(--radius-xs);
      color: var(--accent);
    }
    .section-heading strong, .section-heading h3, .section-heading h4, .section-heading small { display: block; }
    .section-heading h3, .section-heading h4 { margin: 0; font-size: 0.82rem; font-weight: 700; letter-spacing: 0; }
    .section-heading strong { font-size: 0.82rem; }
    .section-heading small { color: var(--muted); font-size: 0.7rem; font-weight: 500; }
    .graph-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: var(--space-4) 0; }
    .graph-metrics div { min-width: 0; }
    .graph-metrics strong { display: block; font-size: 1.05rem; color: var(--ink); }
    .graph-metrics span { color: var(--muted); font-size: 0.66rem; }
    .graph-link {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--accent-strong);
      font-size: 0.76rem;
      font-weight: 700;
      text-decoration: none;
      transition: color 140ms ease;
    }
    .graph-link .ui-icon:last-child { margin-left: auto; transition: transform 160ms ease; }
    .graph-link:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
    .graph-link:hover .ui-icon:last-child { transform: translateX(3px); }
    .library { min-width: 0; scroll-margin-top: 84px; }
    .search-dock {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 64px;
      padding: 0 14px 0 20px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-lg);
      background: transparent;
      transition: border-color 160ms ease;
    }
    .search-dock:focus-within { border-color: var(--accent); }
    .search-dock > .ui-icon { width: 21px; height: 21px; color: var(--muted); }
    .search-dock input {
      min-width: 0;
      flex: 1;
      height: 52px;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
      font-size: 1rem;
    }
    .search-dock input::placeholder { color: var(--faint); }
    .search-dock input:focus-visible { outline: 0; }
    .library-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: var(--space-4);
      padding: 0 4px 18px;
    }
    .library-toolbar .eyebrow { margin-bottom: var(--space-1); }
    .library-toolbar h2 { margin: 0; font-size: clamp(1.45rem, 2.5vw, 2rem); }
    .view-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .density-toggle {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
    }
    .density-toggle button {
      min-height: 28px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.74rem;
      font-weight: 600;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .density-toggle button:hover { color: var(--ink); }
    .density-toggle button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-strong); }
    .entries {
      display: grid;
      gap: 0;
      view-transition-name: ledger-results;
    }
    .entry {
      position: relative;
      padding: clamp(24px, 3vw, 34px) var(--space-2);
      overflow: clip;
      border-top: 1px solid var(--line);
      background: transparent;
      content-visibility: auto;
      contain-intrinsic-size: 260px;
      animation: entry-in 480ms both;
      transition: background-color 180ms ease;
      view-transition-class: rec;
    }
    .entry:nth-child(2n) { animation-delay: 35ms; }
    .entry:nth-child(3n) { animation-delay: 70ms; }
    .entry:hover { background-color: var(--surface-hover); }
    .entry-heading { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .record-type, .record-id, .status-dot, .score-label, .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 27px;
      padding: 4px 9px;
      border-radius: var(--radius-pill);
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 700;
    }
    .record-type { background: var(--surface-soft); color: var(--ink-soft); }
    .record-type .ui-icon { width: 14px; height: 14px; }
    .record-type[data-kind-tone="decision"] { background: var(--decision-soft); color: var(--decision); }
    .record-type[data-kind-tone="backlog"] { background: var(--warning-soft); color: var(--warning); }
    .record-type[data-kind-tone="release"] { background: var(--positive-soft); color: var(--positive); }
    .record-type[data-kind-tone="product-note"], .record-type[data-kind-tone="feedback"] { background: var(--accent-alt-soft); color: var(--accent-alt); }
    .record-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .status-dot { padding-left: 7px; background: transparent; }
    .status-dot::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
    .status-dot[data-status-tone="landed"]::before, .status-dot[data-status-tone="released"]::before, .status-dot[data-status-tone="accepted"]::before, .status-dot[data-status-tone="shipped"]::before { background: var(--positive); }
    .status-dot[data-status-tone="draft"]::before, .status-dot[data-status-tone="planned"]::before, .status-dot[data-status-tone="proposed"]::before, .status-dot[data-status-tone="in-progress"]::before { background: var(--warning); }
    .status-dot[data-status-tone="blocked"]::before, .status-dot[data-status-tone="rejected"]::before, .status-dot[data-status-tone="superseded"]::before, .status-dot[data-status-tone="deprecated"]::before { background: var(--danger); }
    .record-date { margin-left: auto; color: var(--muted); font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
    .score-label { background: var(--accent-soft); color: var(--accent-strong); }
    .entry h3 {
      max-width: 900px;
      margin: 0;
      font-size: clamp(1.2rem, 2vw, 1.6rem);
      line-height: 1.25;
    }
    .entry-summary { max-width: 820px; margin: 11px 0 0; color: var(--ink-soft); line-height: 1.7; }
    .entry-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 18px; }
    .tag { min-height: 25px; background: var(--surface-soft); font-weight: 600; }
    .tag[data-tone="warning"] { background: var(--warning-soft); color: var(--warning); }
    .tag[data-tone="danger"] { background: var(--danger-soft); color: var(--danger); }
    .entry-details { margin-top: 22px; }
    .entry-details > summary, .agent-packet > summary, .record-list > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      cursor: pointer;
      color: var(--accent-strong);
      font-size: 0.78rem;
      font-weight: 700;
    }
    .entry-details > summary { width: fit-content; justify-content: flex-start; gap: var(--space-2); padding: 6px 2px; border-radius: var(--radius-xs); transition: color 140ms ease; }
    .entry-details > summary:hover { color: var(--accent); }
    .entry-details > summary .ui-icon, .agent-packet > summary .ui-icon, .record-list > summary .ui-icon { transition: transform 160ms ease; }
    .entry-body { display: grid; gap: var(--space-5); padding-top: 22px; animation: reveal 220ms both; }
    .source-reference {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 640px;
      color: var(--ink-soft);
    }
    .source-reference > .ui-icon { width: 20px; height: 20px; color: var(--accent); }
    .source-reference span { display: grid; min-width: 0; }
    .source-reference small { color: var(--muted); font-size: 0.67rem; }
    .context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
    .context-panel, .signal-panel { min-width: 0; }
    .context-panel:nth-child(2) .section-heading > span { color: var(--positive); }
    .context-panel ul, .signal-panel ul, .release-notes {
      display: grid;
      gap: 9px;
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;
    }
    .context-panel li, .signal-panel li { color: var(--ink-soft); font-size: 0.82rem; }
    .context-panel li::before { content: "•"; margin-right: var(--space-2); color: var(--accent); }
    .context-panel:nth-child(2) li::before { color: var(--positive); }
    .signal-panel .section-heading > span { color: var(--warning); }
    .signal-panel .section-heading > small { margin-left: auto; }
    .signal-panel li { display: flex; gap: var(--space-2); }
    .signal-panel li > span { color: var(--warning); font-weight: 800; text-transform: uppercase; }
    .record-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-6); }
    .record-list, .agent-packet {
      min-width: 0;
      padding: var(--space-3) 2px 4px;
      border-top: 1px solid var(--line);
      background: transparent;
    }
    .record-list summary { color: var(--ink-soft); }
    .record-list summary small { color: var(--muted); }
    .record-list ul { display: grid; gap: var(--space-2); margin: 13px 0 0; padding: 0; list-style: none; }
    .record-list li { min-width: 0; }
    code {
      color: var(--ink-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }
    pre {
      max-height: 520px;
      margin: 14px 0 0;
      padding: 18px;
      overflow: auto;
      border-radius: var(--radius-md);
      background: var(--code);
      color: #e9eee8;
      font: 0.78rem/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .release-entry {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      gap: clamp(24px, 5vw, 64px);
      padding: clamp(26px, 4vw, 44px) var(--space-2);
    }
    .release-date { display: grid; align-content: start; gap: 5px; }
    .release-date .version-badge { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; font-weight: 800; }
    .release-date time { color: var(--muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }
    .release-content h3 { font-size: clamp(1.45rem, 3vw, 2.2rem); }
    .release-notes { margin-top: var(--space-6); gap: 14px; }
    .release-notes li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 11px; align-items: start; color: var(--ink-soft); }
    .release-notes li > span:first-child { display: grid; place-items: center; width: 24px; height: 24px; color: var(--positive); }
    .release-notes .ui-icon { width: 15px; height: 15px; }
    .empty {
      display: grid;
      justify-items: center;
      padding: 70px 24px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-lg);
      background: transparent;
      text-align: center;
    }
    .empty-icon { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: var(--space-4); border-radius: var(--radius-md); background: var(--accent-soft); color: var(--accent); }
    .empty-icon .ui-icon { width: 22px; height: 22px; }
    .empty h3 { margin-bottom: 7px; font-size: 1.2rem; }
    .empty p { margin-bottom: 18px; color: var(--muted); }
    .empty button {
      padding: 9px 13px;
      border: 0;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--on-accent);
      cursor: pointer;
      font-weight: 700;
    }
    .pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 22px var(--space-2) 0;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.78rem;
    }
    .pagination-summary { font-variant-numeric: tabular-nums; }
    .pagination-pages { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
    .page-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      min-height: 34px;
      padding: 0 6px;
      border: 0;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .page-button:hover { background-color: var(--surface-hover); color: var(--ink); }
    .page-button[aria-current="page"] { background: var(--accent); color: var(--on-accent); }
    .page-button:disabled { opacity: 0.4; cursor: default; }
    .page-button:disabled:hover { background: transparent; color: var(--ink-soft); }
    .page-gap { padding: 0 2px; color: var(--faint); }
    .page-prev .ui-icon { transform: rotate(90deg); }
    .page-next .ui-icon { transform: rotate(-90deg); }
    .entries.compact .entry { padding: 14px var(--space-2); contain-intrinsic-size: 96px; }
    .entries.compact .entry-heading { margin-bottom: 6px; }
    .entries.compact .entry h3 { font-size: 1.05rem; }
    .entries.compact .entry-summary {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      margin-top: 4px;
      font-size: 0.84rem;
      line-height: 1.5;
    }
    .entries.compact .entry-tags, .entries.compact .entry-details { display: none; }
    footer {
      display: flex;
      justify-content: space-between;
      gap: var(--space-5);
      width: min(calc(100% - 40px), var(--max-width));
      margin: 0 auto;
      padding: 26px 4px 40px;
      color: var(--muted);
      font-size: 0.72rem;
    }
    .command-palette {
      width: min(720px, calc(100% - 28px));
      max-height: min(680px, calc(100dvh - 48px));
      margin: 9vh auto auto;
      padding: 0;
      overflow: visible;
      border: 0;
      border-radius: var(--radius-xl);
      background: transparent;
      color: var(--ink);
    }
    .command-palette::backdrop { background: rgba(12, 14, 12, 0.5); backdrop-filter: blur(12px); animation: backdrop-in 200ms ease both; }
    .command-shell {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--surface);
      box-shadow: var(--shadow-float);
      transform-origin: top center;
      animation: palette-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .command-input-row { display: flex; align-items: center; gap: var(--space-3); min-height: 70px; padding: 0 18px 0 22px; }
    .command-input-row > .ui-icon { width: 22px; height: 22px; color: var(--accent); }
    .command-input-row input { min-width: 0; flex: 1; height: 58px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 1.08rem; }
    .command-input-row input:focus-visible { outline: 0; }
    .command-close {
      padding: 6px 8px;
      border: 0;
      border-radius: var(--radius-xs);
      background: var(--surface-soft);
      color: var(--muted);
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .command-status { padding: 9px 22px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 0.72rem; font-weight: 600; }
    .command-results { display: grid; gap: 5px; max-height: 440px; padding: 10px; overflow: auto; }
    .command-result {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4);
      width: 100%;
      padding: 13px 14px;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
    }
    .command-result:hover, .command-result[aria-selected="true"] { background: var(--accent-soft); }
    .command-result-copy { min-width: 0; }
    .command-result strong, .command-result small { display: block; }
    .command-result strong { overflow: hidden; font-size: 0.86rem; text-overflow: ellipsis; white-space: nowrap; }
    .command-result small { margin-top: 3px; color: var(--muted); font-size: 0.7rem; }
    .command-result-score { align-self: center; color: var(--accent); font-size: 0.68rem; font-weight: 700; }
    .command-empty { padding: 54px 24px; color: var(--muted); text-align: center; }
    .command-footer { display: flex; gap: 18px; padding: 11px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.68rem; }
    .command-footer span { display: inline-flex; align-items: center; gap: 5px; }
    .command-footer kbd { min-width: 20px; height: 20px; padding: 0 4px; font-size: 0.62rem; }
    @keyframes entry-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @keyframes reveal { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
    @keyframes palette-in { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
    @keyframes backdrop-in { from { opacity: 0; } }
    ::view-transition-old(ledger-results) { animation: 130ms ease both fade-out; }
    ::view-transition-new(ledger-results) { animation: 220ms ease both fade-in; }
    ::view-transition-group(*) { animation-duration: 240ms; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
    ::view-transition-new(.rec):only-child { animation: entry-in 240ms ease both; }
    ::view-transition-old(.rec):only-child { animation: fade-out 130ms ease both; }
    @keyframes fade-out { to { opacity: 0; transform: translateY(4px); } }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } }
    @media (max-width: 1040px) {
      .topbar { grid-template-columns: minmax(150px, 0.7fr) minmax(240px, 1.3fr) auto; }
      .profile-badge { display: none; }
      .hero { grid-template-columns: 1fr; gap: 34px; }
      .metric-strip { flex-wrap: wrap; }
      .workspace { grid-template-columns: minmax(0, 1fr) 220px; gap: 34px; }
    }
    @media (max-width: 820px) {
      .topbar { grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--space-2); padding: 8px 14px; }
      .identity-copy small { display: none; }
      .identity-copy strong { font-size: 0.84rem; }
      .command-trigger { width: 42px; min-height: 38px; padding: 0; justify-content: center; }
      .command-trigger span, .command-trigger kbd { display: none; }
      main { width: calc(100% - 28px); }
      .hero { padding: 72px 3px 58px; }
      h1 { font-size: clamp(2.7rem, 13vw, 4.7rem); }
      .workspace { display: block; }
      .rail { position: static; max-height: none; overflow: visible; padding: 34px 4px 0; }
      .context-grid, .record-columns { grid-template-columns: 1fr; }
      .release-entry { grid-template-columns: 1fr; gap: 22px; }
      .release-date { display: flex; justify-content: space-between; }
    }
    @media (max-width: 540px) {
      .hero { padding-top: 60px; }
      .metric-strip { gap: var(--space-5); }
      .metric strong { font-size: 1.3rem; }
      .search-dock { min-height: 58px; padding-left: 16px; }
      .search-dock kbd { display: none; }
      .entry { padding: 20px 6px; }
      .entry-heading { margin-bottom: 13px; }
      .status-dot { width: 100%; padding-left: 0; }
      .record-date { margin-left: 0; }
      .score-label { width: auto; margin-left: 0; }
      footer { display: grid; width: calc(100% - 28px); }
      .command-palette { margin-top: 12px; }
      .command-footer span:last-child { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after, ::backdrop { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    }`;

export const staticReaderRuntime = `    let searchIndexPromise;
    let filterRequest = 0;
    let commandItems = [];
    let commandSelection = 0;
    let searchDebounce;

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
      return Object.entries(searchWeights).reduce((score, pair) => {
        const field = pair[0];
        const weight = pair[1];
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

    function controlValue(key) {
      const control = controls[key];
      return control ? control.value : "all";
    }

    const entries = Array.from(document.querySelectorAll(".entry"));
    const entriesContainer = document.getElementById("entries");
    const resultCount = document.getElementById("result-count");
    const resultNoun = resultCount.dataset.resultNoun || "record";
    const filterStatus = document.getElementById("filter-status");
    const empty = document.getElementById("empty");
    const searchClear = document.getElementById("search-clear");
    const advancedFilters = document.querySelector(".advanced-filters");
    const perPage = document.getElementById("per-page");
    const pagination = document.getElementById("pagination");
    const library = document.getElementById("library");
    const defaultPerPage = "25";
    let currentPage = 1;
    let pendingResultsScroll = false;

    function perPageSize() {
      if (!perPage || perPage.value === "all") return 0;
      const parsed = parseInt(perPage.value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    const fallbackBlobs = new Map(entries.map((entry) => [
      entry,
      (((entry.querySelector("h3") || {}).textContent || "") + " " + (entry.dataset.search || "")).toLowerCase()
    ]));

    function datasetList(entry, key) {
      try {
        const parsed = JSON.parse(entry.dataset[key] || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function matches(entry, matchedScores, searchTokens) {
      if (matchedScores && !matchedScores.has(entry.dataset.id)) return false;
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

    function runTransition(update, candidates) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !document.startViewTransition) {
        update();
        return;
      }
      const nearViewport = window.innerHeight * 2;
      const named = [];
      const usedNames = new Set();
      for (const entry of candidates || []) {
        if (named.length >= 28) break;
        const box = entry.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.bottom < -nearViewport || box.top > nearViewport) continue;
        const name = "rec-" + (entry.dataset.id || "").replace(/[^A-Za-z0-9_-]/g, "-");
        if (usedNames.has(name)) continue;
        usedNames.add(name);
        entry.style.viewTransitionName = name;
        named.push(entry);
      }
      const transition = document.startViewTransition(update);
      const watchdog = setTimeout(() => transition.skipTransition(), 600);
      transition.finished.finally(() => {
        clearTimeout(watchdog);
        for (const entry of named) entry.style.viewTransitionName = "";
      });
    }

    function pluralize(value, noun) {
      if (value === 1) return value + " " + noun;
      return value + " " + noun + (noun.endsWith("ch") ? "es" : "s");
    }

    async function applyFilters(syncUrl = true) {
      const request = ++filterRequest;
      const search = controls.search.value.trim().toLowerCase();
      entriesContainer.setAttribute("aria-busy", "true");
      const matchedScores = await searchMatches(search);
      if (request !== filterRequest) return;
      const searchTokens = search.split(/\\s+/).filter(Boolean);
      const sortedEntries = matchedScores
        ? [...entries].sort((left, right) =>
            (matchedScores.get(right.dataset.id) || 0) -
            (matchedScores.get(left.dataset.id) || 0)
          )
        : entries;
      const visibility = new Map(entries.map((entry) => [entry, matches(entry, matchedScores, searchTokens)]));
      const rankById = matchedScores
        ? new Map([...matchedScores.keys()].map((id, index) => [id, index + 1]))
        : undefined;
      const matchedList = sortedEntries.filter((entry) => visibility.get(entry) === true);
      const total = matchedList.length;
      const per = perPageSize();
      const pageCount = per > 0 ? Math.max(1, Math.ceil(total / per)) : 1;
      if (currentPage > pageCount) currentPage = pageCount;
      if (currentPage < 1) currentPage = 1;
      const start = per > 0 ? (currentPage - 1) * per : 0;
      const pageSet = new Set(per > 0 ? matchedList.slice(start, start + per) : matchedList);
      const candidates = entries.filter((entry) => !entry.hidden || pageSet.has(entry));
      const orderChanged = sortedEntries.some((entry, index) => entriesContainer.children[index] !== entry);
      const visibilityChanged = entries.some((entry) => entry.hidden === pageSet.has(entry));
      const applyUpdate = () => {
        if (orderChanged) for (const entry of sortedEntries) entriesContainer.appendChild(entry);
        for (const entry of entries) {
          const show = pageSet.has(entry);
          entry.hidden = !show;
          const scoreLabel = entry.querySelector("[data-score-label]");
          if (scoreLabel) {
            const rank = rankById ? rankById.get(entry.dataset.id) : undefined;
            scoreLabel.hidden = !rank;
            scoreLabel.textContent = rank ? (rank === 1 ? "Top match" : "#" + rank) : "";
          }
        }
        resultCount.textContent = search && matchedScores
          ? pluralize(total, "ranked match")
          : pluralize(total, resultNoun);
        renderPagination(total, pageCount, per);
        empty.hidden = total !== 0;
        entriesContainer.setAttribute("aria-busy", "false");
      };
      if (orderChanged || visibilityChanged) runTransition(applyUpdate, candidates);
      else applyUpdate();
      searchClear.hidden = controls.search.value.length === 0;
      updateFacetButtons();
      updateFilterPills();
      announceFilterStatus(total, pageCount, search, matchedScores);
      if (advancedFilters) {
        advancedFilters.open = ["warning", "missingRef", "duplicate", "coverage"]
          .some((key) => controlValue(key) !== "all");
      }
      if (syncUrl) writeUrlState();
      if (pendingResultsScroll) {
        pendingResultsScroll = false;
        library.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
    }

    function renderPagination(total, pageCount, per) {
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
      summary.textContent = first + "–" + last + " of " + total;
      const pages = document.createElement("div");
      pages.className = "pagination-pages";
      const chevronUse = '<svg class="ui-icon" aria-hidden="true"><use href="#i-chevron"/></svg>';
      const addPageButton = (page, options) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-button" + (options.className ? " " + options.className : "");
        if (options.html) button.innerHTML = options.html;
        else button.textContent = String(page);
        if (options.ariaLabel) button.setAttribute("aria-label", options.ariaLabel);
        if (!options.nav && page === currentPage) button.setAttribute("aria-current", "page");
        if (options.disabled) button.disabled = true;
        else button.addEventListener("click", () => {
          currentPage = page;
          pendingResultsScroll = true;
          void applyFilters();
        });
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

    function updateFacetButtons() {
      for (const button of document.querySelectorAll("[data-filter-field]")) {
        const field = button.dataset.filterField;
        button.setAttribute("aria-pressed", String(Boolean(field && controls[field] && controls[field].value === button.dataset.filterValue)));
      }
    }

    const filterLabels = {
      kind: "Type",
      status: "Status",
      area: "Area",
      release: "Release",
      tag: "Tag",
      warning: "Warnings",
      missingRef: "References",
      duplicate: "Identifiers",
      coverage: "Coverage"
    };

    function announceFilterStatus(total, pageCount, search, matchedScores) {
      if (!filterStatus) return;
      const noun = search && matchedScores ? "ranked match" : resultNoun;
      let message = pluralize(total, noun);
      if (pageCount > 1) message += ", page " + currentPage + " of " + pageCount;
      const active = Object.keys(filterLabels).filter((key) => controlValue(key) !== "all").length;
      if (active > 0) message += ", " + pluralize(active, "active filter");
      filterStatus.textContent = message;
    }

    function updateFilterPills() {
      for (const key of Object.keys(filterLabels)) {
        const control = controls[key];
        if (control && control.classList) control.classList.toggle("is-active", control.value !== "all");
      }
    }

    function writeUrlState() {
      const url = new URL(window.location.href);
      const values = { q: controls.search.value };
      for (const key of Object.keys(filterLabels)) values[key] = controlValue(key);
      for (const key of Object.keys(values)) {
        const value = values[key];
        if (value && value !== "all") url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (currentPage > 1) url.searchParams.set("page", String(currentPage));
      else url.searchParams.delete("page");
      if (perPage && perPage.value !== defaultPerPage) url.searchParams.set("per", perPage.value);
      else url.searchParams.delete("per");
      history.replaceState(null, "", url);
    }

    function readUrlState() {
      const params = new URL(window.location.href).searchParams;
      controls.search.value = params.get("q") || "";
      for (const key of Object.keys(filterLabels)) {
        const value = params.get(key);
        const control = controls[key];
        if (value && control && Array.from(control.options || []).some((option) => option.value === value)) {
          control.value = value;
        }
      }
      const per = params.get("per");
      if (per && perPage && Array.from(perPage.options).some((option) => option.value === per)) {
        perPage.value = per;
      }
      const page = parseInt(params.get("page") || "1", 10);
      currentPage = Number.isFinite(page) && page > 0 ? page : 1;
    }

    function resetFilters() {
      clearTimeout(searchDebounce);
      controls.search.value = "";
      for (const key of Object.keys(filterLabels)) {
        const control = controls[key];
        if (control) control.value = "all";
      }
      currentPage = 1;
      void applyFilters();
      controls.search.focus();
    }

    for (const [key, control] of Object.entries(controls)) {
      if (!control) continue;
      if (key === "search") {
        control.addEventListener("input", () => {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(() => {
            currentPage = 1;
            void applyFilters();
          }, 140);
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
    for (const button of document.querySelectorAll("[data-filter-field]")) {
      button.addEventListener("click", () => {
        const field = button.dataset.filterField;
        const value = button.dataset.filterValue;
        if (!field || value === undefined || !controls[field]) return;
        controls[field].value = controls[field].value === value ? "all" : value;
        currentPage = 1;
        void applyFilters();
      });
    }
    for (const button of document.querySelectorAll("[data-reset-filters]")) {
      button.addEventListener("click", resetFilters);
    }
    searchClear.addEventListener("click", () => {
      clearTimeout(searchDebounce);
      controls.search.value = "";
      currentPage = 1;
      void applyFilters();
      controls.search.focus();
    });

    const densityButtons = Array.from(document.querySelectorAll("[data-density]"));
    function setDensity(value, persist = true) {
      const density = value === "compact" ? "compact" : "expanded";
      entriesContainer.classList.toggle("compact", density === "compact");
      for (const button of densityButtons) {
        button.setAttribute("aria-pressed", String(button.dataset.density === density));
      }
      if (persist) {
        try { localStorage.setItem("ledger-density", density); } catch {}
      }
    }
    for (const button of densityButtons) {
      button.addEventListener("click", () => setDensity(button.dataset.density));
    }
    try {
      if (localStorage.getItem("ledger-density") === "compact") setDensity("compact", false);
    } catch {}

    const palette = document.getElementById("command-palette");
    const paletteTrigger = document.getElementById("search-trigger");
    const paletteInput = document.getElementById("command-search");
    const paletteResults = document.getElementById("command-results");
    const paletteStatus = document.getElementById("command-status");

    async function openPalette() {
      if (!palette.open) palette.showModal();
      paletteInput.setAttribute("aria-expanded", "true");
      paletteInput.value = controls.search.value;
      commandSelection = 0;
      await renderCommandResults();
      paletteInput.focus();
      paletteInput.select();
    }

    async function renderCommandResults() {
      const index = await loadSearchIndex();
      const query = paletteInput.value.trim().toLowerCase();
      const source = Array.isArray(index) ? index : [];
      commandItems = (query
        ? source
            .map((document) => ({ document, score: scoreSearchDocument(query, document) }))
            .filter((item) => item.score > 0)
            .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
        : source.slice(-8).reverse().map((document) => ({ document, score: 0 })))
        .slice(0, 9);
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
        button.id = "command-result-" + indexValue;
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
        score.textContent = item.score ? (indexValue === 0 ? "Top match" : "#" + (indexValue + 1)) : "Recent";
        button.append(copy, score);
        button.addEventListener("click", () => { void openRecord(item.document.id); });
        paletteResults.appendChild(button);
      });
      paletteStatus.textContent = query
        ? pluralize(commandItems.length, "result") + " for “" + paletteInput.value.trim() + "”"
        : "Recent records";
      paletteInput.setAttribute("aria-activedescendant", "command-result-" + commandSelection);
    }

    function updateCommandSelection(next) {
      if (commandItems.length === 0) return;
      commandSelection = (next + commandItems.length) % commandItems.length;
      const buttons = Array.from(paletteResults.querySelectorAll(".command-result"));
      buttons.forEach((button, indexValue) => button.setAttribute("aria-selected", String(indexValue === commandSelection)));
      paletteInput.setAttribute("aria-activedescendant", "command-result-" + commandSelection);
      buttons[commandSelection]?.scrollIntoView({ block: "nearest" });
    }

    function closePalette() {
      paletteInput.setAttribute("aria-expanded", "false");
      if (palette.open) palette.close();
    }

    async function openRecord(id) {
      closePalette();
      controls.search.value = "";
      for (const key of Object.keys(filterLabels)) {
        const control = controls[key];
        if (control) control.value = "all";
      }
      const entry = entries.find((candidate) => candidate.dataset.id === id);
      const per = perPageSize();
      const index = entry ? entries.indexOf(entry) : -1;
      currentPage = per > 0 && index >= 0 ? Math.floor(index / per) + 1 : 1;
      await applyFilters();
      if (!entry) return;
      if (entriesContainer.classList.contains("compact")) setDensity("expanded");
      const details = entry.querySelector(".entry-details");
      if (details) details.open = true;
      entry.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      entry.focus({ preventScroll: true });
    }

    paletteTrigger.addEventListener("click", () => { void openPalette(); });
    document.getElementById("command-close").addEventListener("click", closePalette);
    palette.addEventListener("click", (event) => { if (event.target === palette) closePalette(); });
    palette.addEventListener("close", () => paletteInput.setAttribute("aria-expanded", "false"));
    paletteInput.addEventListener("input", () => { commandSelection = 0; void renderCommandResults(); });
    paletteInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); updateCommandSelection(commandSelection + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); updateCommandSelection(commandSelection - 1); }
      if (event.key === "Enter" && commandItems[commandSelection]) {
        event.preventDefault();
        void openRecord(commandItems[commandSelection].document.id);
      }
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void openPalette();
      } else if (event.key === "/" && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void openPalette();
      }
    });

    const themeToggle = document.getElementById("theme-toggle");
    const themeOrder = ["system", "light", "dark"];
    function themeSetting() {
      const value = document.documentElement.dataset.theme;
      return value === "light" || value === "dark" ? value : "system";
    }
    function resolvedTheme() {
      const setting = themeSetting();
      if (setting !== "system") return setting;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function updateThemeLabel() {
      const setting = themeSetting();
      const next = themeOrder[(themeOrder.indexOf(setting) + 1) % themeOrder.length];
      const label = "Theme: " + setting + (setting === "system" ? " (" + resolvedTheme() + ")" : "") + ". Switch to " + next + ".";
      themeToggle.setAttribute("aria-label", label);
      themeToggle.title = label;
    }
    themeToggle.addEventListener("click", () => {
      const next = themeOrder[(themeOrder.indexOf(themeSetting()) + 1) % themeOrder.length];
      document.documentElement.dataset.theme = next;
      try {
        if (next === "system") localStorage.removeItem("ledger-theme");
        else localStorage.setItem("ledger-theme", next);
      } catch {}
      updateThemeLabel();
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateThemeLabel);

    window.addEventListener("popstate", () => {
      readUrlState();
      void applyFilters(false);
    });
    readUrlState();
    updateThemeLabel();
    void applyFilters(false);`;
