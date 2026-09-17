#!/usr/bin/env node
// Regenerates the README's terminal cards and capture loop diagram from real Ledger output.
//
//   npm run build
//   node scripts/readme-assets.mjs            # writes assets/readme/*.svg
//   node scripts/readme-assets.mjs --keep     # also keeps the demo repositories and prints their paths
//   npm run readme:check                      # regenerates and fails when a card differs from the commit
//
// The script builds two throwaway repositories with this checkout's dist/cli.js, a small TypeScript
// billing service and a Go service, drives the hooks and commands the README shows, and renders the
// captured output. Lines the cards leave out are replaced by a marked annotation, never edited.
// LEDGER_README_VERSION sets the version shown in pinned npx commands (default: package.json).
// LEDGER_README_NOW sets the instant the demo's Ledger processes start from, through
// scripts/readme-clock.mjs, so session names and dates in the cards do not depend on the day.
// The reader screenshots (hero, receipt, palette, changelog) are captured separately; see CONTRIBUTING.md.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const outDir = path.join(root, "assets", "readme");
const version = process.env.LEDGER_README_VERSION ?? JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const keep = process.argv.includes("--keep");
const demoNow = process.env.LEDGER_README_NOW ?? "2026-09-17T12:00:00Z";
const clock = pathToFileURL(path.join(root, "scripts", "readme-clock.mjs")).href;
if (!existsSync(cli)) {
  console.error("dist/cli.js is missing; run npm run build first.");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Demo repositories

function run(command, args, cwd, input) {
  const env = { ...process.env, LEDGER_NO_DAEMON: "1", LEDGER_README_NOW: demoNow };
  const result = spawnSync(command, args, { cwd, input, encoding: "utf8", env });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = run("git", ["-c", "user.name=Demo", "-c", "user.email=demo@example.com", ...args], cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function ledger(cwd, args, { input, allowFailure = false, stdoutOnly = false } = {}) {
  const result = run(process.execPath, ["--import", clock, cli, ...args], cwd, input);
  if (result.status !== 0 && !allowFailure) throw new Error(`ledger ${args.join(" ")} failed: ${result.stdout}${result.stderr}`);
  return stdoutOnly ? result.stdout : `${result.stdout}${result.stderr}`;
}

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function transcript(command, output) {
  return [`$ ${command}`, ...output.replace(/\n+$/, "").split("\n")];
}

function buildBillingDemo(base) {
  const app = path.join(base, "acme-billing");
  const file = (relative, content) => write(path.join(app, relative), content);
  mkdirSync(app, { recursive: true });
  git(app, "init", "-q", "-b", "main");
  file("package.json", '{ "name": "acme-billing", "private": true, "type": "module", "scripts": { "test": "vitest run" }, "devDependencies": { "vitest": "^3.2.0" } }\n');
  file("src/billing/webhooks.ts", "export const maxAttempts = 5;\nexport function retryDelayMs(attempt: number): number {\n  return Math.min(2 ** attempt * 1000, 60_000);\n}\n");
  file("src/billing/invoice.ts", "export interface Invoice { readonly id: string; readonly totalCents: number }\nexport function formatTotal(invoice: Invoice): string {\n  return `$${(invoice.totalCents / 100).toFixed(2)}`;\n}\n");
  file("test/webhooks.test.ts", 'import { expect, it } from "vitest";\nimport { maxAttempts, retryDelayMs } from "../src/billing/webhooks.js";\nit("caps retries", () => { expect(maxAttempts).toBe(5); expect(retryDelayMs(10)).toBe(60_000); });\n');
  file("docs/billing.md", "# Billing\n\nInvoices, payments, and webhook delivery.\n");
  ledger(app, ["init", "--with-docs"]);
  file(".ledger/decisions/D001-store-money-as-integer-cents.md", `---
id: "D001"
kind: "decision"
title: "Store money as integer cents"
date: "2026-08-02"
updated: "2026-08-02"
status: "accepted"
areas:
  - "billing"
---

# D001: Store Money As Integer Cents

## Context

Floating point totals drifted by a cent on large invoices.

## Decision

Every amount is an integer number of cents. Formatting happens at the edge.

## Consequences

Arithmetic stays exact; every API boundary converts explicitly.

## Revisit Criteria

A currency without two decimal places.
`);
  file(".ledger/entries/0001-retry-failed-invoice-webhooks-with-backoff.md", `---
id: "0001"
kind: "change"
title: "Retry failed invoice webhooks with backoff"
date: "2026-08-14"
updated: "2026-08-14"
status: "landed"
areas:
  - "billing"
files:
  - "src/billing/webhooks.ts"
  - "test/webhooks.test.ts"
symbols:
  - "maxAttempts"
  - "retryDelayMs"
docs:
  - "docs/billing.md"
docsImpact:
  status: "updated"
  reason: "The billing doc explains webhook retries."
  docs:
    - "docs/billing.md"
decisions:
  - "D001"
---

# 0001: Retry Failed Invoice Webhooks With Backoff

## Summary

Failed invoice webhooks retry with exponential backoff, capped at one minute,
and stop after five attempts.

## Why

Customers missed invoice events when their endpoint restarted during a deploy.

## Changed Files

### src/billing/webhooks.ts

- What changed: \`maxAttempts\` and \`retryDelayMs\` schedule the retries.
- Anchor: \`retryDelayMs\`
- On conflict: Keep the one minute cap; the queue visibility timeout assumes it.

### test/webhooks.test.ts

- What changed: pins the attempt limit and the cap.
- Anchor: \`caps retries\`
- On conflict: Update the test only with a receipt that changes the limit.

## Behavior And UX Impact

A receiving endpoint that is down for under four minutes still gets every event.

## Invariants

- Retries stop after \`maxAttempts\` (5).
- A retry never waits longer than 60 seconds.

## Verification

- \`npm test\`

## Notes

The queue visibility timeout is 90 seconds.
`);
  git(app, "add", "-A");
  git(app, "commit", "-qm", "Retry invoice webhooks with a receipt");

  const capture = {};
  const hook = (event, name, sessionId, extra = {}) =>
    ledger(app, ["hook", event, "--host", "claude-code"], {
      input: JSON.stringify({ session_id: sessionId, cwd: app, hook_event_name: name, ...extra }),
      stdoutOnly: true,
    });

  // A session starts, edits a file, ends its turn, and receives two more prompts.
  hook("session-start", "SessionStart", "demo-session-1", { source: "startup" });
  appendFileSync(path.join(app, "src/billing/webhooks.ts"), "export function jitteredDelayMs(attempt: number, random = Math.random): number {\n  return Math.round(retryDelayMs(attempt) * (0.8 + random() * 0.4));\n}\n");
  hook("post-tool-use", "PostToolUse", "demo-session-1", { tool_name: "Edit", tool_input: { file_path: path.join(app, "src/billing/webhooks.ts") } });
  capture.stop = JSON.parse(hook("stop", "Stop", "demo-session-1", { stop_hook_active: false }));
  capture.prompt = JSON.parse(hook("user-prompt-submit", "UserPromptSubmit", "demo-session-1", { prompt: "Add a test for the jitter" }));
  capture.promptAgain = JSON.parse(hook("user-prompt-submit", "UserPromptSubmit", "demo-session-1", { prompt: "Thanks" }));

  const entries = path.join(app, ".ledger/entries");
  const draftName = readdirSync(entries).find((name) => !name.startsWith("0001-"));
  if (!draftName) throw new Error("the Stop hook did not draft a receipt");
  const draftPath = path.join(entries, draftName);
  capture.readyFail = transcript("ledger ready", ledger(app, ["ready"], { allowFailure: true }));

  // The agent finishes the draft.
  const raw = readFileSync(draftPath, "utf8");
  let front = raw.split("\n---\n", 1)[0];
  front = front.replace(/title: "[^"]*"/, 'title: "Add jitter to webhook retries"');
  front = front.replace(/docsImpact:\n  status: "none"\n  reason: "[^"]*"/, 'docsImpact:\n  status: "not-needed"\n  reason: "Retry timing is internal; the billing doc already describes retries."');
  front = `${front}\n`.replace(/symbols:\n(?: {2}- .*\n)*/, 'symbols:\n  - "jitteredDelayMs"\n').replace(/\n+$/, "");
  writeFileSync(draftPath, `${front}\n---\n
# Add Jitter To Webhook Retries

## Summary

\`jitteredDelayMs\` spreads each retry across 80 to 120 percent of the backoff
delay so failed deliveries do not retry in lockstep.

## Why

After an outage every queued webhook retried at the same instant and the
receiving endpoint failed again.

## Changed Files

### src/billing/webhooks.ts

- What changed: \`jitteredDelayMs\` wraps \`retryDelayMs\` with bounded jitter.
- Anchor: \`jitteredDelayMs\`
- On conflict: Keep jitter within 20 percent so the one minute cap from 0001 holds.

## Behavior And UX Impact

Retries after an outage arrive spread out instead of all at once.

## Invariants

- Jitter stays within 20 percent of \`retryDelayMs\`.
- \`maxAttempts\` is unchanged (5).

## Verification

- \`npm test\`

## Notes

Follows 0001.
`);
  capture.readyPass = transcript("ledger ready", ledger(app, ["ready"]));
  writeFileSync(draftPath, readFileSync(draftPath, "utf8").replace('status: "draft"', 'status: "landed"'));
  capture.packet = transcript("ledger packet src/billing/webhooks.ts --budget 700", ledger(app, ["packet", "src/billing/webhooks.ts", "--budget", "700"]));
  git(app, "add", "-A");
  git(app, "commit", "-qm", "Add jitter to webhook retries");

  // A pull request that changes source without a receipt.
  const baseRevision = git(app, "rev-parse", "HEAD").trim();
  git(app, "checkout", "-q", "-b", "change-rounding");
  const invoice = path.join(app, "src/billing/invoice.ts");
  writeFileSync(invoice, readFileSync(invoice, "utf8").replace("toFixed(2)", 'toFixed(2).replace(".00", "")'));
  git(app, "commit", "-qam", "Trim whole-dollar totals");
  capture.ci = transcript(
    "ledger ci --github --base main --head change-rounding",
    ledger(app, ["ci", "--github", "--base", baseRevision, "--head", "HEAD"], { allowFailure: true }),
  );
  git(app, "checkout", "-q", "main");

  // A later session that starts while a file with receipts already has uncommitted changes.
  appendFileSync(path.join(app, "src/billing/webhooks.ts"), "export const jitterRatio = 0.2;\n");
  capture.sessionStart = JSON.parse(hook("session-start", "SessionStart", "demo-session-2", { source: "startup" }));
  git(app, "checkout", "-q", "--", "src/billing/webhooks.ts");
  return { path: app, capture };
}

function buildGoDemo(base) {
  const app = path.join(base, "orders-service");
  const file = (relative, content) => write(path.join(app, relative), content);
  mkdirSync(app, { recursive: true });
  git(app, "init", "-q", "-b", "main");
  file("go.mod", "module example.com/orders\n\ngo 1.25\n");
  file("Makefile", ".PHONY: check test release-sign\ncheck: test\n\tgo vet ./...\ntest:\n\tgo test ./...\nrelease-sign:\n\tcosign sign\n");
  file("cmd/orders/main.go", "package main\n\nfunc main() {}\n");
  file("internal/store/db/orders.sql.go", "package db\n");
  file("internal/store/sqlc.yaml", 'version: "2"\nsql:\n  - engine: sqlite\n    queries: queries\n    schema: migrations\n    gen:\n      go:\n        package: db\n        out: db\n');
  file("build/Containerfile", "FROM golang:1.25\n");
  file(".github/workflows/check.yml", "name: check\non: [push]\njobs: {}\n");
  file("docs/README.md", "# Orders service\n");
  file("docs/architecture/overview.md", "# Architecture\n");
  file("docs/llm/START_HERE.md", "# Start here\n\nRead docs/architecture/overview.md first.\n");
  git(app, "add", "-A");
  git(app, "commit", "-qm", "Orders service");
  const adopt = transcript(`npx --yes @kylebegeman/ledger@${version} adopt`, ledger(app, ["adopt"]));
  const config = readFileSync(path.join(app, ".ledger/config.yaml"), "utf8").split("\n");
  return { path: app, capture: { adopt, config } };
}

// ---------------------------------------------------------------------------------------------
// Terminal cards

const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const COLORS = {
  bg: "#0f1311", bar: "#171c19", border: "#2a322d", text: "#dfe5df", bright: "#f6f8f5", muted: "#86918a",
  accent: "#34d399", heading: "#6ee7b7", pass: "#8bd88f", red: "#ff9aa5", amber: "#efb65f", code: "#93c5fd",
  ident: "#c4b5fd", title: "#a3ada6",
};
const FONT_SIZE = 13.5;
const CHAR_WIDTH = 8.13; // approximate advance of the monospace stack at 13.5px
const LINE_HEIGHT = 21;
const CARD_WIDTH = 900; // the README renders cards at 880px, so the SVG scales down slightly
const PAD_X = 22;
const PAD_TOP = 18;
const PAD_BOTTOM = 20;
const BAR_HEIGHT = 38;
const WORD_START = String.raw`(?<![\w/.-])`; // keywords inside paths and slugs stay plain
const WORD_END = String.raw`(?![\w/-])(?!\.\w)`;

function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function rules(mode) {
  const shell = mode !== "markdown";
  return [
    [/^\$ /g, "accent"],
    [/(?<=^\$ ).*/g, "bright"],
    shell ? [/^# .*/g, "muted"] : [/^#{1,3} .*/g, "heading"],
    [/^Ledger [A-Za-z -]+:/g, "bright"],
    [/(?<=^ {4}- )"[^"]*"$/g, "text"], // quoted YAML list values stay plain
    [/`[^`]+`/g, "code"],
    ...(shell
      ? [
          [new RegExp(String.raw`::error\b[^:]*::|${WORD_START}(?:fail(?:ed)?|not ready)${WORD_END}`, "g"), "red"],
          [new RegExp(String.raw`::warning\b[^:]*::|${WORD_START}warn${WORD_END}`, "g"), "amber"],
        ]
      : []),
    [new RegExp(String.raw`${WORD_START}\.ledger/[\w./-]*\w`, "g"), "code"],
    [/(?<![\w`"])ledger (?:ready|new|packet|ci|adopt|explain)\b/g, "code"],
    ...(shell ? [[new RegExp(String.raw`${WORD_START}(?:pass(?:ed)?|ready|ok|covered|created)${WORD_END}`, "g"), "pass"]] : []),
    [/(?<=- )(?:Invariant|On conflict):/g, "muted"],
    [/^\s*- /g, "muted"],
    [new RegExp(String.raw`${WORD_START}(?:[0-9]{4}|[SDB][0-9]{3,4})${WORD_END}`, "g"), "ident"],
  ];
}

/** One style per character; earlier rules win where matches overlap. */
function styleLine(line, compiled) {
  const spans = [];
  for (const [pattern, style] of compiled) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (end === start || spans.some(([s, e]) => end > s && start < e)) continue;
      spans.push([start, end, style]);
    }
  }
  const styles = new Array(line.length).fill("text");
  for (const [start, end, style] of spans) styles.fill(style, start, end);
  return styles;
}

/** Break a styled line into rows, preferring spaces outside colored spans. */
function wrap(line, styles, limit, indent) {
  const rows = [];
  let start = 0;
  let prefix = "";
  for (;;) {
    const available = limit - prefix.length;
    if (line.length - start <= available) {
      rows.push([prefix, line.slice(start), styles.slice(start)]);
      return rows;
    }
    const spaces = [];
    const plain = [];
    for (let i = start + available; i > start; i -= 1) {
      if (line[i] !== " ") continue;
      spaces.push(i);
      if (styles[i] === "text" || styles[i - 1] !== styles[i] || styles[i + 1] !== styles[i]) plain.push(i);
    }
    const cut = plain.length && plain[0] - start >= available * 0.6 ? plain[0] : spaces.length ? spaces[0] : start + available;
    rows.push([prefix, line.slice(start, cut), styles.slice(start, cut)]);
    start = cut;
    while (start < line.length && line[start] === " ") start += 1;
    prefix = indent;
  }
}

function runs(prefix, text, styles) {
  const out = prefix ? [[prefix, "text"]] : [];
  for (let i = 0; i < text.length; i += 1) {
    const last = out.at(-1);
    if (last && last[1] === styles[i]) last[0] += text[i];
    else out.push([text[i], styles[i]]);
  }
  return out;
}

function tspan(text, style) {
  if (style === "note") return `<tspan fill="${COLORS.muted}" font-style="italic">${escapeXml(text)}</tspan>`;
  const weight = style === "bright" || style === "heading" ? ' font-weight="600"' : "";
  return `<tspan fill="${COLORS[style]}"${weight}>${escapeXml(text)}</tspan>`;
}

/**
 * Render a card. Lines starting with "$ " are commands; "~ " marks an annotation added for the
 * README (leading spaces before "~" are kept); in markdown mode "#" lines are headings.
 */
function renderCard({ title, alt, lines, mode = "shell" }) {
  const width = CARD_WIDTH;
  const compiled = rules(mode);
  const limit = Math.floor((width - 2 * PAD_X) / CHAR_WIDTH);
  const rows = [];
  for (const raw of lines) {
    const note = /^(\s*)~ (.*)$/.exec(raw);
    if (note) {
      const text = note[1] + note[2];
      for (const row of wrap(text, new Array(text.length).fill("note"), limit, note[1])) rows.push(runs(...row));
    } else if (raw) {
      const bullet = /^(\s*- )/.exec(raw);
      const indent = bullet ? " ".repeat(bullet[1].length) : mode === "markdown" ? "" : "    ";
      for (const row of wrap(raw, styleLine(raw, compiled), limit, indent)) rows.push(runs(...row));
    } else {
      rows.push([]);
    }
  }
  const height = BAR_HEIGHT + PAD_TOP + rows.length * LINE_HEIGHT + PAD_BOTTOM;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(alt)}">`,
    `  <rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="12" fill="${COLORS.bg}" stroke="${COLORS.border}" stroke-width="1.5"/>`,
    `  <path d="M 0.75 ${BAR_HEIGHT} L 0.75 12.75 Q 0.75 0.75 12.75 0.75 L ${width - 12.75} 0.75 Q ${width - 0.75} 0.75 ${width - 0.75} 12.75 L ${width - 0.75} ${BAR_HEIGHT} Z" fill="${COLORS.bar}"/>`,
    `  <line x1="0.75" y1="${BAR_HEIGHT}" x2="${width - 0.75}" y2="${BAR_HEIGHT}" stroke="${COLORS.border}" stroke-width="1"/>`,
    ...["#ff5f57", "#febc2e", "#28c840"].map((color, index) => `  <circle cx="${22 + index * 20}" cy="${BAR_HEIGHT / 2}" r="6" fill="${color}"/>`),
    `  <text x="${width / 2}" y="${BAR_HEIGHT / 2 + 4.5}" text-anchor="middle" font-family="${SANS}" font-size="13" fill="${COLORS.title}">${escapeXml(title)}</text>`,
  ];
  rows.forEach((row, index) => {
    if (!row.length) return;
    const y = BAR_HEIGHT + PAD_TOP + (index + 1) * LINE_HEIGHT - 6;
    out.push(`  <text x="${PAD_X}" y="${y}" font-family="${MONO}" font-size="${FONT_SIZE}" xml:space="preserve">${row.map(([text, style]) => tspan(text, style)).join("")}</text>`);
  });
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

/** Collapse blank runs and drop the blank line after a ### heading. */
function compact(block) {
  const out = [];
  for (const line of block) {
    if (line === "" && (!out.length || out.at(-1) === "" || out.at(-1).startsWith("### "))) continue;
    out.push(line);
  }
  while (out.at(-1) === "") out.pop();
  return out;
}

function cardSpecs(billing, go) {
  const { capture } = billing;
  const specs = {};
  if (Object.keys(capture.promptAgain).length !== 0) throw new Error("the draft notice repeated on a second prompt");

  specs["agent-session-start"] = {
    title: "acme-billing · Claude Code session start",
    alt: "Ledger context added when an agent session starts: the session record, the commands to use, and the invariants and conflict rules of every receipt for the file already in play",
    mode: "markdown",
    lines: [
      "~ Added to the agent's context. src/billing/webhooks.ts already has uncommitted changes.",
      "",
      ...capture.sessionStart.hookSpecificOutput.additionalContext.split("\n"),
    ],
  };

  specs["agent-draft-notice"] = {
    title: "acme-billing · after the agent's turn ends",
    alt: "The Stop hook tells you which receipt it drafted, and the next prompt tells the agent once to finish that draft",
    mode: "markdown",
    lines: [
      "~ Stop hook, shown to you",
      capture.stop.systemMessage,
      "",
      "~ Your next prompt, added to the agent's context once",
      capture.prompt.hookSpecificOutput.additionalContext,
    ],
  };

  const head = capture.readyFail.slice(0, 3);
  const issues = capture.readyFail.slice(3);
  let shownIssues = issues;
  if (issues.length > 7) {
    const omitted = issues.slice(3, -4);
    const placeholders = omitted.every((line) => /^ {2}- (?:todo|template-placeholder):\d+:/.test(line));
    const label = placeholders ? "TODO markers and template placeholders" : "issues";
    shownIssues = [...issues.slice(0, 3), `    ~ ${omitted.length} more ${label}`, ...issues.slice(-4)];
  }
  specs.ready = {
    title: "acme-billing · ledger ready",
    alt: "ledger ready listing what a freshly drafted receipt is missing, then passing after the agent finishes it",
    lines: [
      ...head,
      ...shownIssues,
      "",
      "~ The agent writes the title, summary, why, invariants, verification, and docs impact",
      "",
      ...capture.readyPass,
    ],
  };

  const sections = [];
  for (const line of capture.packet) {
    if (line.startsWith("## ") || !sections.length) sections.push([]);
    sections.at(-1).push(line);
  }
  const [header, first, ...rest] = sections;
  const packetLines = [...compact(header), "", ...compact(first)];
  for (const section of rest) {
    if (section[0] === "## Related Records") {
      packetLines.push("", ...compact(section));
    } else {
      const note = section[0].startsWith("## S") ? "The session that last touched this file" : "Entry, matched files, conflict rules, invariants, and verification, as above";
      packetLines.push("", section[0], `~ ${note}`);
    }
  }
  specs.packet = {
    title: "acme-billing · ledger packet",
    alt: "ledger packet returning the receipts, conflict rules, invariants, verification, and related decision for a file within a token budget",
    mode: "markdown",
    lines: packetLines,
  };

  const { config } = go.capture;
  const start = config.indexOf("verification:");
  let end = start + 2;
  while (config[end]?.startsWith("    - ")) end += 1;
  const allow = config.slice(start, end);
  if (!allow.includes('    - "make check"') || allow.some((line) => line.includes("release"))) {
    throw new Error(`unexpected verification allowlist:\n${allow.join("\n")}`);
  }
  specs.adopt = {
    title: "orders-service (Go) · ledger adopt",
    alt: "ledger adopt in a Go repository inferring coverage roots, toolchains, and a verification allowlist without the release target",
    lines: [...go.capture.adopt, "", "~ .ledger/config.yaml, the proposed allowlist. The Makefile's release-sign target is left out.", ...allow],
  };

  specs.ci = {
    title: "acme-billing · pull request check",
    alt: "ledger ci --github annotating a pull request that changed a source file without a receipt",
    lines: capture.ci,
  };
  return specs;
}

// ---------------------------------------------------------------------------------------------
// Capture loop diagram

const LOOP_STEPS = [
  ["Session starts", ["The start hook gives the agent", "the receipts for the files in", "play, or the recent changes."], "SessionStart"],
  ["Agent edits", ["Each edited path is recorded", "on a session record, so nothing", "relies on the agent's memory."], "PostToolUse"],
  ["Turn ends", ["A draft receipt is written", "from the Git diff and the", "touched files."], "Stop"],
  ["Agent finishes it", ["The next prompt names the", "draft; the agent writes why,", "invariants, and verification."], "ledger ready"],
  ["Pull request", ["CI requires a receipt for", "changed source and checks", "docs impact per file."], "ledger ci"],
  ["Next change", ["Whoever touches those files", "reads the receipts first, in", "a packet or the reader."], "ledger packet"],
];
const LOOP = {
  panel: "#0f1311", panelBorder: "#2a322d", card: "#171c19", border: "#2f3832", title: "#f2f5f2", body: "#b0b8b2",
  chipBg: "#0f3b2e", chipText: "#6ee7b7", numberBg: "#34d399", numberText: "#03271c", arrow: "#56605a", loop: "#34d399", caption: "#949d96",
};

function renderLoop() {
  const [W, H, CARD_W, CARD_H] = [1040, 452, 300, 170];
  const cols = [40, 370, 700];
  const rows = [40, 262];
  const positions = [[cols[0], rows[0]], [cols[1], rows[0]], [cols[2], rows[0]], [cols[2], rows[1]], [cols[1], rows[1]], [cols[0], rows[1]]];
  const arrow = (x1, y1, x2, y2) => `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LOOP.arrow}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#head)"/>`;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The Ledger capture loop: session start, edits, draft receipt, the agent finishes it, pull request checks, and the next change reads the receipts.">`,
    "  <defs>",
    `    <marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${LOOP.arrow}"/></marker>`,
    `    <marker id="loophead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${LOOP.loop}"/></marker>`,
    "  </defs>",
    `  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="16" fill="${LOOP.panel}" stroke="${LOOP.panelBorder}" stroke-width="1.5"/>`,
  ];
  LOOP_STEPS.forEach(([title, body, chip], index) => {
    const [x, y] = positions[index];
    out.push(`  <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="16" fill="${LOOP.card}" stroke="${LOOP.border}" stroke-width="1.5"/>`);
    out.push(`  <circle cx="${x + 34}" cy="${y + 36}" r="15" fill="${LOOP.numberBg}"/>`);
    out.push(`  <text x="${x + 34}" y="${y + 41.5}" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="700" fill="${LOOP.numberText}">${index + 1}</text>`);
    out.push(`  <text x="${x + 60}" y="${y + 42}" font-family="${SANS}" font-size="18" font-weight="700" fill="${LOOP.title}">${escapeXml(title)}</text>`);
    body.forEach((line, lineIndex) => {
      out.push(`  <text x="${x + 22}" y="${y + 78 + lineIndex * 22}" font-family="${SANS}" font-size="14.5" fill="${LOOP.body}">${escapeXml(line)}</text>`);
    });
    out.push(`  <rect x="${x + 22}" y="${y + CARD_H - 38}" width="${Math.round(16 + chip.length * 8.2)}" height="24" rx="12" fill="${LOOP.chipBg}"/>`);
    out.push(`  <text x="${x + 30}" y="${y + CARD_H - 21.5}" font-family="${MONO}" font-size="12.5" font-weight="600" fill="${LOOP.chipText}">${escapeXml(chip)}</text>`);
  });
  // Row one flows right, the corner drops down, row two flows left.
  const mid1 = rows[0] + CARD_H / 2;
  const mid2 = rows[1] + CARD_H / 2;
  out.push(arrow(cols[0] + CARD_W + 6, mid1, cols[1] - 8, mid1));
  out.push(arrow(cols[1] + CARD_W + 6, mid1, cols[2] - 8, mid1));
  out.push(arrow(cols[2] + CARD_W / 2, rows[0] + CARD_H + 6, cols[2] + CARD_W / 2, rows[1] - 8));
  out.push(arrow(cols[2] - 6, mid2, cols[1] + CARD_W + 8, mid2));
  out.push(arrow(cols[1] - 6, mid2, cols[0] + CARD_W + 8, mid2));
  // The loop closes from the next change back to the next session start.
  const lx = cols[0] + CARD_W / 2;
  out.push(`  <path d="M ${lx} ${rows[1] - 6} L ${lx} ${rows[0] + CARD_H + 8}" fill="none" stroke="${LOOP.loop}" stroke-width="2.5" stroke-dasharray="6 6" stroke-linecap="round" marker-end="url(#loophead)"/>`);
  out.push(`  <text x="${lx + 14}" y="${(rows[0] + CARD_H + rows[1]) / 2 + 5}" font-family="${SANS}" font-size="13.5" font-style="italic" fill="${LOOP.caption}">and the next session starts with it</text>`);
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------

const base = realpathSync(mkdtempSync(path.join(tmpdir(), "ledger-readme-")));
try {
  const billing = buildBillingDemo(base);
  const go = buildGoDemo(base);
  mkdirSync(outDir, { recursive: true });
  for (const [name, spec] of Object.entries(cardSpecs(billing, go))) {
    writeFileSync(path.join(outDir, `${name}.svg`), renderCard(spec));
    console.log(`wrote assets/readme/${name}.svg`);
  }
  writeFileSync(path.join(outDir, "loop.svg"), renderLoop());
  console.log("wrote assets/readme/loop.svg");
} finally {
  if (keep) console.log(`demo repositories kept in ${base}`);
  else rmSync(base, { recursive: true, force: true });
}
