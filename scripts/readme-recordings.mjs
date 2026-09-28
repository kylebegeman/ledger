#!/usr/bin/env node
// Records a 24-second tour of this repository's actual reader, then writes a
// full-quality MP4 and a compact, looping GIF for the README.
//
//   npm run build
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/readme-recordings.mjs
//
// FFmpeg must be available on PATH. Playwright stays an unsaved development
// tool; neither it nor FFmpeg becomes a package dependency. --keep retains the
// lossless source frames and inspection images in the printed temporary directory.
// --output-dir <path> writes the two finished recordings somewhere else.
// The script visits the real UI through its controls and captures Chromium's
// lossless screencast after the page is ready. Frame timestamps preserve natural
// motion and reading pauses, with no startup frames or lossy intermediate video.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const outputIndex = args.indexOf("--output-dir");
if (args.some((arg, index) => arg !== "--keep" && arg !== "--output-dir" && !(outputIndex >= 0 && index === outputIndex + 1)) || (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")))) {
  console.error("Usage: node scripts/readme-recordings.mjs [--keep] [--output-dir <path>]");
  process.exit(2);
}
const outDir = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : path.join(root, "assets", "readme");
const viewport = { width: 1200, height: 800 };
const duration = 24;
const gifBudget = 8_000_000;
const work = mkdtempSync(path.join(tmpdir(), "ledger-reader-tour-"));
const mp4 = path.join(work, "reader-tour.mp4");
const gif = path.join(work, "reader-tour.gif");
let server;
let browser;
let context;

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}:\n${result.stderr || result.stdout}`);
  return `${result.stdout}${result.stderr}`;
}

try {
  readFileSync(cli);
  run("ffmpeg", ["-version"]);
  run("ffprobe", ["-version"]);
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Playwright is missing. Run npm install --no-save playwright && npx playwright install chromium.");
  }
  mkdirSync(outDir, { recursive: true });
  const url = await serve();
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForSelector("#activity-chart svg");
  await page.evaluate(() => document.fonts.ready);
  // Warm the lazy detail chunk before recording so network timing never leaves
  // a loading interlude in the tour. The receipt itself still opens by click.
  await page.evaluate(async () => {
    const entry = document.getElementById("record-0133");
    if (!entry) throw new Error("The tour requires repository receipt 0133.");
    if (entry.dataset.detail) {
      const response = await fetch(entry.dataset.detail);
      if (!response.ok) throw new Error(`Receipt chunk returned ${response.status}`);
      await response.json();
    }
  });
  await page.waitForTimeout(350);
  const recorder = await context.newCDPSession(page);
  const frames = [];
  let firstTimestamp;
  let firstFrameReady;
  const firstFrame = new Promise((resolve) => { firstFrameReady = resolve; });
  recorder.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    void recorder.send("Page.screencastFrameAck", { sessionId }).catch((error) => errors.push(error.message));
    if (errors.length) return;
    try {
      if (metadata.timestamp === undefined) throw new Error("Chromium returned a frame without its timestamp.");
      firstTimestamp ??= metadata.timestamp;
      const file = `source-${String(frames.length).padStart(5, "0")}.png`;
      writeFileSync(path.join(work, file), Buffer.from(data, "base64"));
      frames.push({ file, time: metadata.timestamp - firstTimestamp });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    // Let a failed first frame reach the same awaited error and cleanup path.
    firstFrameReady();
  });
  await recorder.send("Page.startScreencast", { format: "png", maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
  await Promise.race([firstFrame, page.waitForTimeout(5000).then(() => { throw new Error("Chromium did not start the screencast."); })]);
  const started = performance.now();

  async function at(seconds, action) {
    const wait = seconds * 1000 - (performance.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    else if (wait < -700) throw new Error(`Tour fell ${Math.round(-wait)} ms behind at ${seconds}s; rerun on an idle machine.`);
    if (errors.length) throw new Error(`Reader errors during recording:\n${errors.join("\n")}`);
    if (action) await action();
  }

  async function click(selector) {
    const target = page.locator(selector);
    const box = await target.boundingBox();
    if (!box) throw new Error(`Tour control is not visible: ${selector}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await target.click();
  }

  console.log("Recording overview, filters, receipt evidence, Timeline, and light theme...");
  await at(2, () => page.evaluate(() => window.scrollTo({ top: 450, behavior: "smooth" })));
  await at(4, () => click('[data-view-tab="records"]'));
  await at(5, () => click("#area-trigger"));
  await at(5.7, () => page.keyboard.type("hooks", { delay: 70 }));
  await at(6.8, () => page.keyboard.press("Enter"));
  await page.waitForFunction(() => document.querySelector("#area")?.value === "hooks");
  await at(7.4, async () => {
    await click("#search");
    await page.locator("#search").pressSequentially("drafted receipts", { delay: 60 });
  });
  await at(9, () => click('#record-0133 .entry-link'));
  await page.waitForSelector("#record-panel.open .context-grid");
  await at(11, () => page.locator("#record-panel-body").evaluate((element) => element.scrollTo({ top: 360, behavior: "smooth" })));
  await at(13.5, () => page.locator("#record-panel-body").evaluate((element) => element.scrollTo({ top: 780, behavior: "smooth" })));
  await at(15.7, () => click("#record-panel-close"));
  await at(16.2, () => click("[data-reset-filters]:visible"));
  await at(16.7, () => click('[data-view-tab="timeline"]'));
  await at(19, () => click("#theme-toggle"));
  await at(21, () => click('[data-view-tab="overview"]'));
  await at(23, () => click("#theme-toggle"));
  await at(duration + 0.3);
  await recorder.send("Page.stopScreencast");
  await recorder.detach();
  if (errors.length) throw new Error(`Reader errors during recording:\n${errors.join("\n")}`);
  await context.close();
  context = undefined;
  await browser.close();
  browser = undefined;
  const recorded = frames.filter((frame) => frame.time < duration);
  if (recorded.length < 30) throw new Error(`Only ${recorded.length} source frames arrived; refusing to publish an incomplete tour.`);
  const source = path.join(work, "source.ffconcat");
  const concat = ["ffconcat version 1.0"];
  recorded.forEach((frame, index) => {
    const nextTime = recorded[index + 1]?.time ?? duration;
    concat.push(`file ${frame.file}`, `duration ${Math.max(0.001, nextTime - frame.time).toFixed(6)}`);
  });
  concat.push(`file ${recorded.at(-1).file}`);
  writeFileSync(source, `${concat.join("\n")}\n`);
  const sourceArgs = ["-f", "concat", "-safe", "0", "-i", source];
  console.log(`Encoding ${recorded.length} lossless browser frames with their captured timing.`);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...sourceArgs, "-t", String(duration), "-vf", "fps=25,setsar=1", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);

  let gifColors = 256;
  for (const colors of [256, 192, 128]) {
    gifColors = colors;
    // Two passes avoid buffering an entire decoded video while palettegen waits
    // for its final frame. Both passes read the lossless browser recording.
    const palette = path.join(work, "palette.png");
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...sourceArgs, "-vf", `fps=12,palettegen=max_colors=${colors}:reserve_transparent=1:stats_mode=diff`, "-frames:v", "1", palette]);
    const filter = "[0:v]fps=12,setsar=1[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle[out]";
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...sourceArgs, "-i", palette, "-filter_complex", filter, "-map", "[out]", "-t", String(duration), "-an", "-loop", "0", gif]);
    if (statSync(gif).size <= gifBudget) break;
  }
  if (statSync(gif).size > gifBudget) throw new Error(`GIF exceeds the ${gifBudget / 1_000_000} MB budget; inspect ${gif} before using it.`);
  for (const file of [mp4, gif]) {
    const info = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", file]));
    if (Math.abs(Number(info.format.duration) - duration) > 0.05 || info.streams[0]?.width !== viewport.width || info.streams[0]?.height !== viewport.height) {
      throw new Error(`${path.basename(file)} has unexpected dimensions or duration.`);
    }
  }
  // Inspection frames are temporary, not extra repository artifacts.
  for (const second of [0, 3, 6, 8.5, 10, 12.5, 15, 18, 20, 22, 23.8]) {
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(second), "-i", mp4, "-frames:v", "1", path.join(work, `frame-${String(second).replace(".", "-")}.png`)]);
  }
  for (const file of [mp4, gif]) {
    const destination = path.join(outDir, path.basename(file));
    copyFileSync(file, destination);
    console.log(`wrote ${path.relative(root, destination)} (${(statSync(file).size / 1_000_000).toFixed(2)} MB, ${viewport.width}×${viewport.height}, ${duration}s)`);
  }
  console.log(`MP4: 25 fps H.264, CRF 18; GIF: 12 fps, ${gifColors}-color global palette, infinite loop.`);
  if (keep) console.log(`Original recording and inspection frames kept in ${work}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("Build first with npm run build; FFmpeg and an unsaved Playwright installation are required.");
  process.exitCode = 1;
} finally {
  for (const close of [() => context?.close(), () => browser?.close(), () => {
    if (server && server.exitCode === null) server.kill();
  }, () => {
    if (!keep) rmSync(work, { recursive: true, force: true });
  }]) {
    try { await close(); }
    catch (error) { console.error("Recording cleanup failed:", error); process.exitCode = 1; }
  }
}

async function serve() {
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  server = spawn(process.execPath, [cli, "serve", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, LEDGER_NO_DAEMON: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`ledger serve exited with ${server.exitCode}`);
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // The server has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`ledger serve did not answer at ${url}`);
}
