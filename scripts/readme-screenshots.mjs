#!/usr/bin/env node
// Captures the README's four reader screenshots from real renders:
//
//   npm run build
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/readme-screenshots.mjs              # writes assets/readme/{hero,palette,changelog,receipt}.png
//   node scripts/readme-screenshots.mjs hero palette  # only the named images
//
// Playwright is not a dependency; --no-save keeps it out of package.json and the lockfile.
// The script serves this repository's internal reader and public changelog, builds the billing
// demo with scripts/readme-assets.mjs --demos-only for the receipt, and captures each view in a
// fresh dark browser context at a device scale factor of 2 with reduced motion. Each image is then
// framed with rounded corners and a 1px inner border in the reader's dark line color, keeping every
// captured pixel. It stops only the servers it started and deletes the demo it built.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const outDir = path.join(root, "assets", "readme");
const demoNow = process.env.LEDGER_README_NOW ?? "2026-09-17T12:00:00Z";
const clock = pathToFileURL(path.join(root, "scripts", "readme-clock.mjs")).href;
/** The reader's dark `--line` token. */
const frameLine = "#3d363f";

/**
 * Each image: its viewport in CSS pixels, its corner radius in CSS pixels, and how to reach and
 * crop the view. `internal`, `public`, and `demo` name where the page comes from.
 */
const shots = {
  hero: { source: "internal", viewport: { width: 1440, height: 900 }, radius: 18, capture: captureHero },
  palette: { source: "internal", viewport: { width: 1440, height: 900 }, radius: 16, capture: capturePalette },
  changelog: { source: "public", viewport: { width: 1180, height: 820 }, radius: 16, capture: captureChangelog },
  receipt: { source: "demo", viewport: { width: 1440, height: 1600 }, radius: 12, capture: captureReceipt },
};

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !(name in shots));
if (unknown.length > 0) {
  console.error(`Unknown screenshot: ${unknown.join(", ")}. Choose from ${Object.keys(shots).join(", ")}.`);
  process.exit(2);
}
const names = requested.length > 0 ? requested : Object.keys(shots);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
  process.exit(1);
}
try {
  readFileSync(cli);
} catch {
  console.error("dist/cli.js is missing; run npm run build first.");
  process.exit(1);
}

const servers = [];
let demoBase;
let browser;
try {
  const sources = new Set(names.map((name) => shots[name].source));
  const urls = {};
  if (sources.has("internal")) urls.internal = await serve([]);
  if (sources.has("public")) urls.public = await serve(["--profile", "public"]);
  if (sources.has("demo")) urls.demo = buildDemoReader();

  browser = await chromium.launch();
  for (const name of names) {
    const shot = shots[name];
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const captured = await shot.capture(page, urls[shot.source]);
    await context.close();
    const framed = await frame(captured, shot.radius);
    writeFileSync(path.join(outDir, `${name}.png`), framed);
    const { width, height } = pngSize(framed);
    console.log(`wrote assets/readme/${name}.png (${width} by ${height})`);
  }
} finally {
  await browser?.close();
  for (const server of servers) server.kill();
  if (demoBase) rmSync(demoBase, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// Views

/** A change record open beside the library, scrolled so the library starts under the top bar. */
async function captureHero(page, base) {
  await page.goto(new URL("?kind=change&record=0133", base).href);
  await page.waitForSelector("#record-panel.open #record-panel-body .context-grid");
  await page.evaluate(() => document.getElementById("library")?.scrollIntoView({ block: "start", behavior: "instant" }));
  await settle(page);
  return page.screenshot();
}

/** The command palette searching for drafted receipts, cropped to the dialog with a 44px margin. */
async function capturePalette(page, base) {
  await page.goto(base);
  await page.waitForSelector("#entries");
  await page.keyboard.press("/");
  await page.keyboard.type("draft receipt");
  await page.waitForSelector(".command-result[data-id]");
  await settle(page);
  const box = await page.locator(".command-shell").boundingBox();
  const margin = 44;
  return page.screenshot({
    clip: wholeClip({ x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin }),
  });
}

/** The public changelog, scrolled so its heading sits just under the top bar. */
async function captureChangelog(page, base) {
  await page.goto(base);
  await page.waitForSelector("#entries .release-entry");
  await page.evaluate(() => {
    const library = document.getElementById("library");
    const topbar = document.querySelector(".topbar");
    if (!library || !topbar) return;
    window.scrollTo({ top: library.getBoundingClientRect().top + window.scrollY - topbar.offsetHeight - 8, behavior: "instant" });
  });
  await settle(page);
  return page.screenshot();
}

/** The demo's first receipt with Files and Relationships open, cropped to the panel's content. */
async function captureReceipt(page, base) {
  await page.goto(`${base}?record=0001`);
  await page.waitForSelector("#record-panel.open .record-columns details");
  await page.evaluate(() => {
    for (const summary of document.querySelectorAll("#record-panel-body .record-list > summary")) {
      if (/^(Files|Relationships)\b/.test(summary.textContent.trim())) summary.parentElement.open = true;
    }
  });
  await settle(page);
  const panel = await page.locator("#record-panel").boundingBox();
  const packet = await page.locator("#record-panel-body .agent-packet").boundingBox();
  return page.screenshot({
    clip: wholeClip({ x: panel.x, y: panel.y, width: panel.width, height: packet.y + packet.height + 28 - panel.y }),
  });
}

/** A clip on whole CSS pixels, so a 2x capture has even dimensions and frames without resampling. */
function wholeClip({ x, y, width, height }) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  return { x: left, y: top, width: Math.ceil(x + width) - left, height: Math.ceil(y + height) - top };
}

/** Waits for layout, fonts, and any transition to finish. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------------------------
// Sources

/** Starts `ledger serve` for this repository on a free port and waits until it answers. */
async function serve(args) {
  const port = await freePort();
  const server = spawn(process.execPath, [cli, "serve", "--port", String(port), ...args], {
    cwd: root,
    env: { ...process.env, LEDGER_NO_DAEMON: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  servers.push(server);
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`ledger serve ${args.join(" ")} exited with ${server.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return url;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`ledger serve ${args.join(" ")} did not answer at ${url}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Builds the billing demo and renders its reader, which works from a file: URL. */
function buildDemoReader() {
  const built = spawnSync(process.execPath, [path.join(root, "scripts", "readme-assets.mjs"), "--demos-only"], {
    cwd: root,
    encoding: "utf8",
  });
  const match = /demo repositories kept in (.+)$/m.exec(built.stdout);
  if (built.status !== 0 || !match) throw new Error(`building the demo failed: ${built.stdout}${built.stderr}`);
  demoBase = match[1].trim();
  const app = path.join(demoBase, "acme-billing");
  const rendered = spawnSync(process.execPath, ["--import", clock, cli, "render"], {
    cwd: app,
    encoding: "utf8",
    env: { ...process.env, LEDGER_NO_DAEMON: "1", LEDGER_README_NOW: demoNow },
  });
  if (rendered.status !== 0) throw new Error(`rendering the demo failed: ${rendered.stdout}${rendered.stderr}`);
  return pathToFileURL(path.join(app, ".ledger", "dist", "index.html")).href;
}

// ---------------------------------------------------------------------------------------------
// Framing

/**
 * Rounds the corners and draws a 1px inner border, at the capture's device scale so every
 * captured pixel is kept and the corners outside the radius are transparent.
 */
async function frame(png, radius) {
  const { width, height } = pngSize(png);
  const context = await browser.newContext({ viewport: { width: width / 2, height: height / 2 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(`<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  #frame { position: relative; width: ${width / 2}px; height: ${height / 2}px; overflow: hidden; border-radius: ${radius}px; }
  #frame img { display: block; width: 100%; height: 100%; }
  #frame::after { content: ""; position: absolute; inset: 0; border-radius: ${radius}px; box-shadow: inset 0 0 0 1px ${frameLine}; }
</style>
<div id="frame"><img alt="" src="data:image/png;base64,${png.toString("base64")}"></div>`);
  await page.waitForFunction(() => document.querySelector("#frame img")?.complete);
  const framed = await page.locator("#frame").screenshot({ omitBackground: true });
  await context.close();
  return framed;
}

function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
