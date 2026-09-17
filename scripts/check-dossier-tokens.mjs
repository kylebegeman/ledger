#!/usr/bin/env node
// Checks that the reader's design tokens still match Dossier's (decision D003: copied, never imported).
//
//   node scripts/check-dossier-tokens.mjs                        # Dossier checkout at ../dossier
//   node scripts/check-dossier-tokens.mjs --dossier <path>       # or DOSSIER_DIR=<path>
//
// Reads core/internal/render/assets/tokens.css from a Dossier checkout: its :root block holds the
// light values and its :root[data-theme="dark"] block the dark ones. Ledger's src/reader/styles.css
// writes each color as light-dark(light, dark). Every Dossier token must have the same light and dark
// values in Ledger, except the accent Ledger keeps (receipt 0137); tokens only Ledger defines are
// ignored. It also reports whether tokens.css changed since the Dossier commit the stylesheet names.
// Exits 0 when the tokens match, 1 when they differ, and 2 when Dossier cannot be read.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = path.join(root, "src", "reader", "styles.css");
const tokensPath = "core/internal/render/assets/tokens.css";

/** Tokens Ledger sets on purpose, and why. */
const ledgerOverrides = new Map([
  ["--accent", "Ledger keeps the emerald accent from its mark (receipt 0137)"],
  ["--accent-ink", "text on Ledger's accent"],
  ["--accent-soft", "tint of Ledger's accent"],
]);

const flag = process.argv.indexOf("--dossier");
const dossier = path.resolve(flag >= 0 ? process.argv[flag + 1] ?? "" : process.env.DOSSIER_DIR ?? path.join(root, "..", "dossier"));

let dossierCss;
try {
  dossierCss = readFileSync(path.join(dossier, tokensPath), "utf8");
} catch (error) {
  console.error(`Cannot read ${tokensPath} in ${dossier}: ${error.message}. Pass --dossier <path> or set DOSSIER_DIR.`);
  process.exit(2);
}
const ledgerCss = readFileSync(stylesheet, "utf8");

const dossierLight = properties(block(dossierCss, ":root {"));
const dossierDark = properties(block(dossierCss, ':root[data-theme="dark"] {'));
const ledger = new Map(
  [...properties(block(ledgerCss, ":root {"))].map(([name, value]) => [name, splitLightDark(value)]),
);

const problems = [];
let matched = 0;
for (const [name, light] of dossierLight) {
  if (ledgerOverrides.has(name)) continue;
  const dark = dossierDark.get(name) ?? light;
  const ours = ledger.get(name);
  if (!ours) {
    problems.push(`${name} is missing; Dossier uses ${describe(light, dark)}`);
  } else if (normalize(ours.light) !== normalize(light) || normalize(ours.dark) !== normalize(dark)) {
    problems.push(`${name} is ${describe(ours.light, ours.dark)}; Dossier uses ${describe(light, dark)}`);
  } else {
    matched += 1;
  }
}
for (const name of dossierDark.keys()) {
  if (!dossierLight.has(name) && !ledgerOverrides.has(name)) problems.push(`${name} is dark-only in Dossier; review it by hand`);
}

const named = /Dossier ([0-9a-f]{7,40})/.exec(ledgerCss)?.[1];
const head = git(["rev-parse", "--short", "HEAD"]);
let history = "";
if (named) {
  const changed = spawnSync("git", ["-C", dossier, "diff", "--quiet", named, "HEAD", "--", tokensPath]);
  history =
    changed.status === 0
      ? `tokens.css is unchanged since ${named}`
      : changed.status === 1
        ? `tokens.css changed since ${named}; after reviewing, name ${head ?? "the new commit"} in the stylesheet header`
        : `cannot compare with ${named} in this checkout`;
}

if (problems.length > 0) {
  console.log(`Dossier tokens differ (${problems.length}):`);
  for (const problem of problems) console.log(`- ${problem}`);
  if (history) console.log(history);
  process.exit(1);
}
console.log(
  `Dossier tokens match: ${matched} tokens, with Ledger's ${[...ledgerOverrides.keys()].join(", ")} kept on purpose. ` +
    `Dossier is at ${head ?? "an unknown commit"}${history ? `; ${history}` : ""}.`,
);

/** The declarations inside the first rule that starts with `opener`. */
function block(css, opener) {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`no ${opener.trim()} block`);
  let depth = 0;
  for (let index = start + opener.length - 1; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}" && --depth === 0) return css.slice(start + opener.length, index);
  }
  throw new Error(`unclosed ${opener.trim()} block`);
}

function properties(body) {
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

/** `light-dark(a, b)` as its two values, splitting at the comma outside any parentheses. */
function splitLightDark(value) {
  const match = /^light-dark\((.*)\)$/s.exec(value.trim());
  if (!match) return { light: value, dark: value };
  let depth = 0;
  for (let index = 0; index < match[1].length; index += 1) {
    const character = match[1][index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      return { light: match[1].slice(0, index).trim(), dark: match[1].slice(index + 1).trim() };
    }
  }
  return { light: value, dark: value };
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function describe(light, dark) {
  return normalize(light) === normalize(dark) ? light : `${light} (light) and ${dark} (dark)`;
}

function git(args) {
  const result = spawnSync("git", ["-C", dossier, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
