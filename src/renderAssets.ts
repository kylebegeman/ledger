export const staticReaderStyles = `    :root {
      color-scheme: light;
      --canvas: #f3f3ef;
      --canvas-glow: rgba(108, 92, 231, 0.13);
      --surface: #ffffff;
      --surface-raised: rgba(255, 255, 255, 0.9);
      --surface-soft: #ebece7;
      --surface-hover: #f7f7f4;
      --ink: #171815;
      --ink-soft: #40433d;
      --muted: #74786f;
      --faint: #a5a99f;
      --accent: #5e5ce6;
      --accent-strong: #4743d2;
      --accent-soft: #e9e8ff;
      --positive: #23856d;
      --positive-soft: #dcf4eb;
      --warning: #a86616;
      --warning-soft: #fff0d4;
      --danger: #b74b58;
      --danger-soft: #ffe5e8;
      --code: #171a18;
      --shadow-sm: 0 1px 2px rgba(22, 24, 20, 0.04), 0 8px 24px rgba(22, 24, 20, 0.05);
      --shadow-md: 0 18px 55px rgba(25, 27, 23, 0.11);
      --shadow-float: 0 28px 90px rgba(15, 16, 14, 0.22);
      --radius-sm: 12px;
      --radius-md: 20px;
      --radius-lg: 28px;
      --max-width: 1480px;
    }
    html[data-theme="dark"] {
      color-scheme: dark;
      --canvas: #111311;
      --canvas-glow: rgba(126, 121, 255, 0.16);
      --surface: #1b1e1b;
      --surface-raised: rgba(27, 30, 27, 0.9);
      --surface-soft: #252925;
      --surface-hover: #222622;
      --ink: #f2f3ef;
      --ink-soft: #c9ccc4;
      --muted: #999e94;
      --faint: #6f756c;
      --accent: #9b98ff;
      --accent-strong: #b7b5ff;
      --accent-soft: #2f2d58;
      --positive: #6fd3b5;
      --positive-soft: #173d34;
      --warning: #efb65f;
      --warning-soft: #49351a;
      --danger: #ff9aa5;
      --danger-soft: #4c2329;
      --code: #0c0e0d;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.22), 0 12px 30px rgba(0, 0, 0, 0.18);
      --shadow-md: 0 22px 65px rgba(0, 0, 0, 0.34);
      --shadow-float: 0 32px 100px rgba(0, 0, 0, 0.58);
    }
    @media (prefers-color-scheme: dark) {
      html[data-theme="system"] {
        color-scheme: dark;
        --canvas: #111311;
        --canvas-glow: rgba(126, 121, 255, 0.16);
        --surface: #1b1e1b;
        --surface-raised: rgba(27, 30, 27, 0.9);
        --surface-soft: #252925;
        --surface-hover: #222622;
        --ink: #f2f3ef;
        --ink-soft: #c9ccc4;
        --muted: #999e94;
        --faint: #6f756c;
        --accent: #9b98ff;
        --accent-strong: #b7b5ff;
        --accent-soft: #2f2d58;
        --positive: #6fd3b5;
        --positive-soft: #173d34;
        --warning: #efb65f;
        --warning-soft: #49351a;
        --danger: #ff9aa5;
        --danger-soft: #4c2329;
        --code: #0c0e0d;
        --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.22), 0 12px 30px rgba(0, 0, 0, 0.18);
        --shadow-md: 0 22px 65px rgba(0, 0, 0, 0.34);
        --shadow-float: 0 32px 100px rgba(0, 0, 0, 0.58);
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      background:
        radial-gradient(circle at 52% -12%, var(--canvas-glow), transparent 34rem),
        var(--canvas);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.55;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
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
      border-radius: 10px;
      background: var(--ink);
      color: var(--canvas);
      transform: translateY(-150%);
      transition: transform 160ms ease;
    }
    .skip-link:focus { transform: translateY(0); }
    :focus-visible {
      outline: 0;
      box-shadow: 0 0 0 3px var(--canvas), 0 0 0 6px var(--accent);
    }
    .app-shell { min-height: 100vh; }
    .topbar {
      position: sticky;
      z-index: 30;
      top: 0;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(280px, 560px) minmax(180px, 1fr);
      align-items: center;
      gap: 24px;
      width: min(calc(100% - 32px), var(--max-width));
      margin: 16px auto 0;
      padding: 12px 14px;
      border-radius: 20px;
      background: var(--surface-raised);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(22px) saturate(1.25);
    }
    .identity {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      width: fit-content;
      text-decoration: none;
      border-radius: 12px;
    }
    .logo, .logo-fallback {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 800;
    }
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
      min-height: 42px;
      padding: 0 10px 0 14px;
      border: 0;
      border-radius: 13px;
      background: var(--surface-soft);
      color: var(--muted);
      cursor: pointer;
      text-align: left;
      transition: color 160ms ease, background 160ms ease, transform 160ms ease;
    }
    .command-trigger:hover { background: var(--surface-hover); color: var(--ink); transform: translateY(-1px); }
    .command-trigger span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      border-radius: 7px;
      background: var(--surface);
      box-shadow: 0 2px 7px rgba(20, 22, 18, 0.08);
      color: var(--muted);
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    .profile-badge {
      padding: 7px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent-strong);
      font-size: 0.74rem;
      font-weight: 750;
    }
    .icon-button, .sidebar-close {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: background 160ms ease, color 160ms ease, transform 160ms ease;
    }
    .icon-button:hover, .sidebar-close:hover { background: var(--surface-soft); color: var(--ink); transform: rotate(-5deg); }
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
      font-weight: 760;
      line-height: 0.98;
    }
    .hero-description {
      max-width: 700px;
      margin-bottom: 0;
      color: var(--ink-soft);
      font-size: clamp(1rem, 1.7vw, 1.25rem);
      line-height: 1.65;
    }
    .metric-strip { display: flex; gap: 30px; padding-bottom: 8px; }
    .metric { min-width: 68px; }
    .metric strong { display: block; font-size: 1.55rem; font-weight: 740; letter-spacing: -0.04em; }
    .metric span { color: var(--muted); font-size: 0.76rem; font-weight: 650; }
    .workspace {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
      gap: clamp(30px, 5vw, 74px);
      align-items: start;
      padding-bottom: 100px;
    }
    .workspace-public { grid-template-columns: minmax(0, 920px); justify-content: center; }
    .sidebar {
      position: sticky;
      top: 96px;
      max-height: calc(100vh - 118px);
      overflow: auto;
      padding: 8px 4px 30px;
      scrollbar-width: thin;
      scrollbar-color: var(--faint) transparent;
    }
    .sidebar-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 22px;
    }
    .sidebar-header .eyebrow { margin-bottom: 3px; }
    .sidebar-header h2 { margin: 0; font-size: 1.3rem; }
    .sidebar-actions { display: flex; align-items: center; gap: 4px; }
    .text-button, .search-clear {
      padding: 5px 8px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 750;
      cursor: pointer;
    }
    .text-button:hover, .search-clear:hover { background: var(--accent-soft); }
    .sidebar-close { display: none; }
    .filter-stack { display: grid; gap: 12px; }
    .filter-control { display: grid; gap: 6px; }
    .filter-control > span, .filter-label {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 760;
      letter-spacing: 0.025em;
    }
    select {
      width: 100%;
      min-height: 42px;
      padding: 0 34px 0 12px;
      border: 0;
      border-radius: 11px;
      background: var(--surface-soft);
      color: var(--ink);
      cursor: pointer;
      appearance: auto;
    }
    select:hover { background: var(--surface-hover); }
    .advanced-filters { margin-top: 8px; }
    summary { list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .advanced-filters > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 42px;
      padding: 0 12px;
      border-radius: 11px;
      background: var(--surface-soft);
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 720;
    }
    details[open] > summary .ui-icon:last-child { transform: rotate(180deg); }
    .advanced-filters > div { display: grid; gap: 12px; padding-top: 12px; }
    .browse-section, .graph-summary {
      margin-top: 30px;
      padding: 18px;
      border-radius: 18px;
      background: var(--surface);
      box-shadow: var(--shadow-sm);
    }
    .browse-section .filter-label { margin: 0 0 10px; }
    .facet-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .facet-list + .facet-list { margin-top: 8px; }
    .facet-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: 100%;
      min-height: 30px;
      padding: 5px 9px;
      border: 0;
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--ink-soft);
      cursor: pointer;
      font-size: 0.72rem;
      transition: background 140ms ease, color 140ms ease, transform 140ms ease;
    }
    .facet-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .facet-button small { color: var(--muted); }
    .facet-button:hover { transform: translateY(-1px); color: var(--ink); }
    .facet-button[aria-pressed="true"] { background: var(--accent); color: white; }
    .facet-button[aria-pressed="true"] small { color: rgba(255, 255, 255, 0.75); }
    .graph-summary { background: var(--accent-soft); color: var(--accent-strong); }
    .section-heading { display: flex; align-items: flex-start; gap: 10px; }
    .section-heading > span {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      border-radius: 9px;
      background: var(--surface-raised);
      color: var(--accent);
    }
    .section-heading strong, .section-heading small { display: block; }
    .section-heading strong { font-size: 0.82rem; }
    .section-heading small { color: var(--muted); font-size: 0.7rem; font-weight: 550; }
    .graph-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; }
    .graph-metrics div { min-width: 0; }
    .graph-metrics strong { display: block; font-size: 1.05rem; }
    .graph-metrics span { color: var(--muted); font-size: 0.66rem; }
    .graph-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent-strong);
      font-size: 0.76rem;
      font-weight: 760;
      text-decoration: none;
    }
    .graph-link .ui-icon:last-child { margin-left: auto; }
    .library { min-width: 0; }
    .search-dock {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 0 14px 0 20px;
      border-radius: 19px;
      background: var(--surface);
      box-shadow: var(--shadow-md);
      transition: box-shadow 160ms ease, transform 160ms ease;
    }
    .search-dock:focus-within { box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-md); transform: translateY(-1px); }
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
    .search-dock input:focus-visible { box-shadow: none; }
    .library-toolbar {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      min-height: 110px;
      padding: 34px 4px 20px;
    }
    .library-toolbar .eyebrow { margin-bottom: 4px; }
    .library-toolbar h2 { margin: 0; font-size: clamp(1.45rem, 2.5vw, 2rem); }
    .filter-toggle {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 13px;
      border: 0;
      border-radius: 11px;
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      font-weight: 720;
    }
    .active-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: -6px 4px 18px; }
    .active-filters:empty { display: none; }
    .active-filter {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 9px;
      border: 0;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent-strong);
      cursor: pointer;
      font-size: 0.72rem;
      font-weight: 720;
    }
    .active-filter::after { content: "×"; font-size: 1rem; font-weight: 500; line-height: 0.8; }
    .entries {
      display: grid;
      gap: 14px;
      view-transition-name: ledger-results;
    }
    .entry {
      position: relative;
      padding: clamp(20px, 3vw, 30px);
      overflow: clip;
      border-radius: var(--radius-md);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      content-visibility: auto;
      contain-intrinsic-size: 260px;
      animation: entry-in 480ms both;
      transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    .entry:nth-child(2n) { animation-delay: 35ms; }
    .entry:nth-child(3n) { animation-delay: 70ms; }
    .entry:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .entry[hidden] { display: none; }
    .entry:focus-visible { box-shadow: 0 0 0 3px var(--accent), var(--shadow-md); }
    .entry-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .record-type, .record-id, .status-dot, .score-label, .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 27px;
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 740;
    }
    .record-type { background: var(--accent-soft); color: var(--accent-strong); }
    .record-type .ui-icon { width: 14px; height: 14px; }
    .record-type[data-kind-tone="decision"] { background: #e5f1ff; color: #2c66a1; }
    .record-type[data-kind-tone="backlog"] { background: var(--warning-soft); color: var(--warning); }
    .record-type[data-kind-tone="release"] { background: var(--positive-soft); color: var(--positive); }
    .record-type[data-kind-tone="product-note"], .record-type[data-kind-tone="feedback"] { background: #f5e5ff; color: #8649a8; }
    html[data-theme="dark"] .record-type[data-kind-tone="decision"] { background: #1f354c; color: #8dc3ff; }
    html[data-theme="dark"] .record-type[data-kind-tone="product-note"], html[data-theme="dark"] .record-type[data-kind-tone="feedback"] { background: #40294d; color: #dda6f7; }
    .record-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .status-dot { padding-left: 7px; background: transparent; }
    .status-dot i { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
    .status-dot[data-status-tone="landed"] i, .status-dot[data-status-tone="released"] i, .status-dot[data-status-tone="accepted"] i, .status-dot[data-status-tone="shipped"] i { background: var(--positive); }
    .status-dot[data-status-tone="draft"] i, .status-dot[data-status-tone="planned"] i, .status-dot[data-status-tone="proposed"] i { background: var(--warning); }
    .score-label { margin-left: auto; background: var(--accent-soft); color: var(--accent-strong); }
    .entry h3 {
      max-width: 900px;
      margin: 0;
      font-size: clamp(1.2rem, 2vw, 1.6rem);
      line-height: 1.25;
    }
    .entry-summary { max-width: 820px; margin: 11px 0 0; color: var(--ink-soft); line-height: 1.7; }
    .entry-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 18px; }
    .tag { min-height: 25px; background: var(--surface-soft); font-weight: 650; }
    .tag[data-tone="warning"] { background: var(--warning-soft); color: var(--warning); }
    .entry-details { margin-top: 22px; }
    .entry-details > summary, .agent-packet > summary, .record-list > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      color: var(--accent-strong);
      font-size: 0.78rem;
      font-weight: 780;
    }
    .entry-details > summary { width: fit-content; padding: 7px 11px; border-radius: 9px; background: var(--accent-soft); }
    .entry-details > summary:hover { filter: brightness(0.98); }
    .entry-details > summary .ui-icon, .agent-packet > summary .ui-icon, .record-list > summary .ui-icon { transition: transform 160ms ease; }
    .entry-body { display: grid; gap: 18px; padding-top: 22px; animation: reveal 220ms both; }
    .source-reference {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 640px;
      padding: 13px 15px;
      border-radius: 13px;
      background: var(--surface-soft);
      color: var(--ink-soft);
    }
    .source-reference > .ui-icon { width: 20px; height: 20px; color: var(--accent); }
    .source-reference span { display: grid; min-width: 0; }
    .source-reference small { color: var(--muted); font-size: 0.67rem; }
    .context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .context-panel, .signal-panel {
      padding: 18px;
      border-radius: 16px;
      background: var(--surface-soft);
    }
    .context-panel:first-child { background: var(--accent-soft); }
    .context-panel:nth-child(2) { background: var(--positive-soft); }
    .context-panel:nth-child(2) .section-heading > span { color: var(--positive); }
    .context-panel ul, .signal-panel ul, .release-notes {
      display: grid;
      gap: 9px;
      margin: 14px 0 0;
      padding: 0;
      list-style: none;
    }
    .context-panel li, .signal-panel li { color: var(--ink-soft); font-size: 0.82rem; }
    .context-panel li::before { content: "•"; margin-right: 8px; color: var(--accent); }
    .signal-panel { background: var(--warning-soft); }
    .signal-panel .section-heading > span { color: var(--warning); }
    .signal-panel .section-heading > small { margin-left: auto; }
    .signal-panel li { display: flex; gap: 8px; }
    .signal-panel li > span { color: var(--warning); font-weight: 800; text-transform: uppercase; }
    .record-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .record-list, .agent-packet {
      min-width: 0;
      padding: 14px 15px;
      border-radius: 14px;
      background: var(--surface-soft);
    }
    .record-list summary { color: var(--ink-soft); }
    .record-list summary small { color: var(--muted); }
    .record-list ul { display: grid; gap: 8px; margin: 13px 0 0; padding: 0; list-style: none; }
    .record-list li { min-width: 0; }
    code {
      color: var(--ink-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.75rem;
      overflow-wrap: anywhere;
    }
    .agent-packet { background: var(--surface-soft); }
    pre {
      max-height: 520px;
      margin: 14px 0 0;
      padding: 18px;
      overflow: auto;
      border-radius: 14px;
      background: var(--code);
      color: #e9eee8;
      font: 0.78rem/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .release-feed { gap: 18px; }
    .release-entry {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      gap: clamp(24px, 5vw, 64px);
      padding: clamp(26px, 4vw, 44px);
    }
    .release-date { display: grid; align-content: start; gap: 5px; }
    .release-date span { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; font-weight: 800; }
    .release-date time { color: var(--muted); font-size: 0.78rem; }
    .release-content h3 { font-size: clamp(1.45rem, 3vw, 2.2rem); }
    .release-notes { margin-top: 24px; gap: 14px; }
    .release-notes li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 11px; align-items: start; color: var(--ink-soft); }
    .release-notes li > span:first-child { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px; background: var(--positive-soft); color: var(--positive); }
    .release-notes .ui-icon { width: 14px; height: 14px; }
    .empty {
      display: grid;
      justify-items: center;
      padding: 70px 24px;
      border-radius: var(--radius-md);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }
    .empty[hidden] { display: none; }
    .empty-icon { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 16px; border-radius: 18px; background: var(--accent-soft); color: var(--accent); }
    .empty-icon .ui-icon { width: 22px; height: 22px; }
    .empty h3 { margin-bottom: 7px; font-size: 1.2rem; }
    .empty p { margin-bottom: 18px; color: var(--muted); }
    .empty button {
      padding: 9px 13px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: white;
      cursor: pointer;
      font-weight: 750;
    }
    footer {
      display: flex;
      justify-content: space-between;
      gap: 20px;
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
      border-radius: 24px;
      background: transparent;
      color: var(--ink);
    }
    .command-palette::backdrop { background: rgba(12, 14, 12, 0.5); backdrop-filter: blur(12px); }
    .command-shell {
      overflow: hidden;
      border-radius: 24px;
      background: var(--surface);
      box-shadow: var(--shadow-float);
      transform-origin: top center;
      animation: palette-in 180ms both;
    }
    .command-input-row { display: flex; align-items: center; gap: 12px; min-height: 70px; padding: 0 18px 0 22px; }
    .command-input-row > .ui-icon { width: 22px; height: 22px; color: var(--accent); }
    .command-input-row input { min-width: 0; flex: 1; height: 58px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 1.08rem; }
    .command-input-row input:focus-visible { box-shadow: none; }
    .command-close {
      padding: 6px 8px;
      border: 0;
      border-radius: 8px;
      background: var(--surface-soft);
      color: var(--muted);
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 750;
    }
    .command-status { padding: 9px 22px; background: var(--surface-soft); color: var(--muted); font-size: 0.72rem; font-weight: 650; }
    .command-results { display: grid; gap: 5px; max-height: 440px; padding: 10px; overflow: auto; }
    .command-result {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      width: 100%;
      padding: 13px 14px;
      border: 0;
      border-radius: 13px;
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
    .command-result-score { align-self: center; color: var(--accent); font-size: 0.68rem; font-weight: 760; }
    .command-empty { padding: 54px 24px; color: var(--muted); text-align: center; }
    .command-footer { display: flex; gap: 18px; padding: 11px 18px; background: var(--surface-soft); color: var(--muted); font-size: 0.68rem; }
    .command-footer span { display: inline-flex; align-items: center; gap: 5px; }
    .command-footer kbd { min-width: 20px; height: 20px; padding: 0 4px; font-size: 0.62rem; }
    .filter-scrim { display: none; }
    @keyframes entry-in { from { opacity: 0; transform: translateY(12px) scale(0.995); } to { opacity: 1; transform: none; } }
    @keyframes reveal { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
    @keyframes palette-in { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
    ::view-transition-old(ledger-results) { animation: 130ms ease both fade-out; }
    ::view-transition-new(ledger-results) { animation: 220ms ease both fade-in; }
    @keyframes fade-out { to { opacity: 0; transform: translateY(4px); } }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } }
    @media (max-width: 1040px) {
      .topbar { grid-template-columns: minmax(150px, 0.7fr) minmax(240px, 1.3fr) auto; }
      .profile-badge { display: none; }
      .hero { grid-template-columns: 1fr; gap: 34px; }
      .metric-strip { flex-wrap: wrap; }
      .workspace { grid-template-columns: 220px minmax(0, 1fr); gap: 34px; }
    }
    @media (max-width: 820px) {
      .topbar { grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; width: calc(100% - 20px); margin-top: 10px; }
      .identity-copy small { display: none; }
      .identity-copy strong { font-size: 0.84rem; }
      .command-trigger { width: 42px; min-height: 38px; padding: 0; justify-content: center; }
      .command-trigger span, .command-trigger kbd { display: none; }
      main { width: calc(100% - 28px); }
      .hero { padding: 72px 3px 58px; }
      h1 { font-size: clamp(2.7rem, 13vw, 4.7rem); }
      .workspace { display: block; }
      .filter-toggle { display: inline-flex; }
      .sidebar {
        position: fixed;
        z-index: 60;
        inset: auto 10px 10px;
        max-height: min(78dvh, 720px);
        padding: 22px;
        overflow: auto;
        border-radius: 24px;
        background: var(--surface);
        box-shadow: var(--shadow-float);
        transform: translateY(calc(100% + 30px));
        visibility: hidden;
        transition: transform 220ms ease, visibility 220ms;
      }
      body.sidebar-open { overflow: hidden; }
      body.sidebar-open .sidebar { transform: translateY(0); visibility: visible; }
      .sidebar-close { display: grid; }
      .filter-scrim {
        position: fixed;
        z-index: 55;
        inset: 0;
        display: block;
        padding: 0;
        border: 0;
        background: rgba(10, 12, 10, 0.48);
        opacity: 0;
        pointer-events: none;
        backdrop-filter: blur(8px);
        transition: opacity 180ms ease;
      }
      body.sidebar-open .filter-scrim { opacity: 1; pointer-events: auto; }
      .browse-section, .graph-summary { box-shadow: none; background: var(--surface-soft); }
      .library-toolbar { min-height: 100px; }
      .context-grid, .record-columns { grid-template-columns: 1fr; }
      .release-entry { grid-template-columns: 1fr; gap: 22px; }
      .release-date { display: flex; justify-content: space-between; }
    }
    @media (max-width: 540px) {
      .hero { padding-top: 60px; }
      .metric-strip { gap: 20px; }
      .metric strong { font-size: 1.3rem; }
      .search-dock { min-height: 58px; padding-left: 16px; }
      .search-dock kbd { display: none; }
      .entry { padding: 20px; border-radius: 18px; }
      .entry-heading { margin-bottom: 13px; }
      .status-dot { width: 100%; padding-left: 0; }
      .score-label { width: auto; margin-left: 0; }
      footer { display: grid; width: calc(100% - 28px); }
      .command-palette { margin-top: 12px; }
      .command-footer span:last-child { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    }`;

export const staticReaderRuntime = `    let searchIndexPromise;
    let filterRequest = 0;
    let commandItems = [];
    let commandSelection = 0;

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
    const entries = Array.from(document.querySelectorAll(".entry"));
    const entriesContainer = document.getElementById("entries");
    const resultCount = document.getElementById("result-count");
    const resultNoun = resultCount.dataset.resultNoun || "record";
    const empty = document.getElementById("empty");
    const activeFilters = document.getElementById("active-filters");
    const searchClear = document.getElementById("search-clear");
    const advancedFilters = document.querySelector(".advanced-filters");

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

    function runTransition(update) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion && document.startViewTransition) {
        document.startViewTransition(update);
      } else {
        update();
      }
    }

    function pluralize(value, noun) {
      return value + " " + noun + (value === 1 ? "" : "s");
    }

    async function applyFilters(syncUrl = true) {
      const request = ++filterRequest;
      const search = controls.search.value.trim().toLowerCase();
      const matchedScores = await searchMatches(search);
      if (request !== filterRequest) return;
      const sortedEntries = matchedScores
        ? [...entries].sort((left, right) =>
            (matchedScores.get(right.dataset.id) || 0) -
            (matchedScores.get(left.dataset.id) || 0)
          )
        : entries;
      let visible = 0;
      runTransition(() => {
        for (const entry of sortedEntries) entriesContainer.appendChild(entry);
        for (const entry of entries) {
          const show = matches(entry, matchedScores, search);
          entry.hidden = !show;
          const scoreLabel = entry.querySelector("[data-score-label]");
          if (scoreLabel) {
            const score = matchedScores ? matchedScores.get(entry.dataset.id) : undefined;
            scoreLabel.hidden = !score;
            scoreLabel.textContent = score ? "Relevance " + Math.round(score) : "";
          }
          if (show) visible += 1;
        }
        resultCount.textContent = search && matchedScores
          ? pluralize(visible, "ranked match")
          : pluralize(visible, resultNoun);
        empty.hidden = visible !== 0;
      });
      searchClear.hidden = controls.search.value.length === 0;
      updateFacetButtons();
      renderActiveFilters();
      if (advancedFilters) {
        advancedFilters.open = [controls.warning, controls.missingRef, controls.duplicate, controls.coverage]
          .some((control) => control.value !== "all");
      }
      if (syncUrl) writeUrlState();
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

    function renderActiveFilters() {
      activeFilters.replaceChildren();
      for (const key of Object.keys(filterLabels)) {
        const control = controls[key];
        if (!control || control.value === "all") continue;
        const option = control.options ? control.options[control.selectedIndex] : undefined;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "active-filter";
        chip.textContent = filterLabels[key] + ": " + (option ? option.textContent : control.value);
        chip.addEventListener("click", () => {
          control.value = "all";
          void applyFilters();
        });
        activeFilters.appendChild(chip);
      }
    }

    function writeUrlState() {
      const url = new URL(window.location.href);
      const values = { q: controls.search.value };
      for (const key of Object.keys(filterLabels)) values[key] = controls[key].value;
      for (const key of Object.keys(values)) {
        const value = values[key];
        if (value && value !== "all") url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
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
    }

    function resetFilters() {
      controls.search.value = "";
      for (const key of Object.keys(filterLabels)) controls[key].value = "all";
      closeSidebar();
      void applyFilters();
      controls.search.focus();
    }

    for (const control of Object.values(controls)) {
      control.addEventListener("input", () => { void applyFilters(); });
    }
    for (const button of document.querySelectorAll("[data-filter-field]")) {
      button.addEventListener("click", () => {
        const field = button.dataset.filterField;
        const value = button.dataset.filterValue;
        if (!field || value === undefined || !controls[field]) return;
        controls[field].value = controls[field].value === value ? "all" : value;
        void applyFilters();
      });
    }
    for (const button of document.querySelectorAll("[data-reset-filters]")) {
      button.addEventListener("click", resetFilters);
    }
    searchClear.addEventListener("click", () => {
      controls.search.value = "";
      void applyFilters();
      controls.search.focus();
    });

    const palette = document.getElementById("command-palette");
    const paletteTrigger = document.getElementById("search-trigger");
    const paletteInput = document.getElementById("command-search");
    const paletteResults = document.getElementById("command-results");
    const paletteStatus = document.getElementById("command-status");

    async function openPalette() {
      if (!palette.open) palette.showModal();
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
        score.textContent = item.score ? Math.round(item.score) + "%" : "Recent";
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

    async function openRecord(id) {
      palette.close();
      controls.search.value = "";
      for (const key of Object.keys(filterLabels)) controls[key].value = "all";
      await applyFilters();
      const entry = entries.find((candidate) => candidate.dataset.id === id);
      if (!entry) return;
      const details = entry.querySelector(".entry-details");
      if (details) details.open = true;
      entry.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      entry.focus({ preventScroll: true });
    }

    paletteTrigger.addEventListener("click", () => { void openPalette(); });
    document.getElementById("command-close").addEventListener("click", () => palette.close());
    palette.addEventListener("click", (event) => { if (event.target === palette) palette.close(); });
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
    function currentTheme() {
      const selected = document.documentElement.dataset.theme || "system";
      if (selected !== "system") return selected;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function updateThemeLabel() {
      const next = currentTheme() === "dark" ? "light" : "dark";
      themeToggle.setAttribute("aria-label", "Switch to " + next + " theme");
      themeToggle.title = "Switch to " + next + " theme";
    }
    themeToggle.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("ledger-theme", next); } catch {}
      updateThemeLabel();
    });

    const filterToggle = document.getElementById("filter-toggle");
    const filterClose = document.getElementById("filter-close");
    const filterScrim = document.getElementById("filter-scrim");
    function openSidebar() {
      document.body.classList.add("sidebar-open");
      filterToggle?.setAttribute("aria-expanded", "true");
      filterClose?.focus();
    }
    function closeSidebar() {
      document.body.classList.remove("sidebar-open");
      filterToggle?.setAttribute("aria-expanded", "false");
    }
    filterToggle?.addEventListener("click", openSidebar);
    filterClose?.addEventListener("click", closeSidebar);
    filterScrim?.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) closeSidebar();
    });

    window.addEventListener("popstate", () => {
      readUrlState();
      void applyFilters(false);
    });
    readUrlState();
    updateThemeLabel();
    void applyFilters(false);`;
