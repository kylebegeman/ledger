import path from "node:path";
import { parse as parseYaml } from "yaml";
import { readUtf8FileLimited } from "./boundedFile.js";
import { defaultConfig } from "./config.js";
import { listTrackedFiles } from "./git.js";

/** What adopt infers from a repository's tracked tree. Every list is sorted and deduplicated. */
export interface ToolchainDetection {
  /** git.requireEntryFor: top-level source directories plus the root Makefile and primary manifest. */
  readonly coverageRoots: readonly string[];
  /** git.ignore: Ledger derived state, dependency and build output, and generated code. */
  readonly ignore: readonly string[];
  /** verification.allow: commands proposed for the detected toolchains plus the Ledger checks. */
  readonly verificationAllow: readonly string[];
  /** Detected toolchain names such as make, go, node, cargo, python, swift, templ, sqlc. */
  readonly toolchains: readonly string[];
  /** Tracked file extensions, lowercased. */
  readonly codeExtensions: readonly string[];
}

export interface ToolchainDetectionOptions {
  /** The Ledger command the proposed checks run through. Defaults to agents.command's default. */
  readonly command?: string;
}

/** Root manifests in priority order; the first tracked one becomes a coverage root. */
export const primaryManifests = [
  "go.mod",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "Package.swift",
] as const;

const sqlcManifestPattern = /(^|\/)sqlc\.(yaml|yml|json)$/;
const maxSqlcManifests = 32;
const maxManifestBytes = 256 * 1024;
const maxMakeTargets = 40;
const deniedCommandWords = ["release", "publish", "deploy", "push", "sign", "upload", "clean", "install"];
const buildOutputDirectories = ["dist", "build", "out", "target", "coverage", ".next"];
const ledgerDerivedIgnores = [".ledger/indexes/**", ".ledger/reports/**", ".ledger/dist/**", ".ledger/cache/**"];
const routingFiles = ["docs/llm/manifest.json", "docs/llm/START_HERE.md"];
const sqlcFixedOutputFiles = ["db.go", "models.go", "querier.go", "copyfrom.go", "batch.go"];
const ledgerChecks = ["ci", "doctor", "validate", "ready", "stale", "coverage"];

/**
 * Infer coverage roots, generated-code ignores, and a verification allowlist from tracked
 * paths and the content of root manifests and sqlc configs. Pure and order-independent.
 */
export function detectToolchain(
  files: readonly string[],
  manifests: ReadonlyMap<string, string>,
  options: ToolchainDetectionOptions = {},
): ToolchainDetection {
  const command = options.command ?? defaultConfig.agents.command;
  if (files.length === 0) {
    return {
      coverageRoots: [...defaultConfig.git.requireEntryFor],
      ignore: [...defaultConfig.git.ignore],
      verificationAllow: [...defaultConfig.verification.allow],
      toolchains: [],
      codeExtensions: [],
    };
  }

  const tracked = new Set(files);
  const topDirectories = new Set<string>();
  for (const file of files) {
    const slash = file.indexOf("/");
    if (slash > 0) topDirectories.add(file.slice(0, slash));
  }
  const toolchains = new Set<string>();

  const coverageRoots: string[] = [];
  for (const directory of topDirectories) {
    if (directory === ".ledger") continue;
    if (directory.startsWith(".") && directory !== ".github") continue;
    coverageRoots.push(`${directory}/**`);
  }
  if (tracked.has("Makefile")) coverageRoots.push("Makefile");
  const primary = primaryManifests.find((manifest) => tracked.has(manifest));
  if (primary) coverageRoots.push(primary);

  const ignore: string[] = [...ledgerDerivedIgnores];
  ignore.push(...recursive("node_modules"), ...recursive("generated"));
  for (const directory of buildOutputDirectories) {
    if (!topDirectories.has(directory)) ignore.push(`${directory}/**`);
  }
  if (files.some((file) => file.endsWith(".templ") || file.endsWith("_templ.go"))) {
    toolchains.add("templ");
    ignore.push("*_templ.go", "**/*_templ.go");
  }
  const sqlcIgnores = sqlcOutputIgnores(files, manifests);
  const hasSqlGo = files.some((file) => file.endsWith(".sql.go"));
  if (sqlcIgnores.length > 0) ignore.push(...sqlcIgnores);
  else if (hasSqlGo) ignore.push("*.sql.go", "**/*.sql.go");
  if (sqlcIgnores.length > 0 || hasSqlGo || files.some((file) => sqlcManifestPattern.test(file))) {
    toolchains.add("sqlc");
  }
  if (files.some((file) => file.split("/").includes(".product"))) {
    ignore.push(...recursive(".product"));
  }
  if (tracked.has("go.mod") && !topDirectories.has("vendor")) ignore.push("vendor/**");
  for (const routingFile of routingFiles) {
    if (!tracked.has(routingFile)) ignore.push(routingFile);
  }

  const verificationAllow: string[] = [];
  if (tracked.has("Makefile")) {
    toolchains.add("make");
    const targets = parseMakeTargets(manifests.get("Makefile") ?? "").slice(0, maxMakeTargets);
    verificationAllow.push(...targets.map((target) => `make ${target}`));
  }
  if (tracked.has("go.mod")) {
    toolchains.add("go");
    verificationAllow.push("go test **", "go vet **", "go build **");
  }
  if (tracked.has("package.json")) {
    toolchains.add("node");
    verificationAllow.push(...nodeCommands(manifests.get("package.json")));
  }
  if (tracked.has("Cargo.toml")) {
    toolchains.add("cargo");
    verificationAllow.push("cargo test **", "cargo check **", "cargo clippy **");
  }
  if (tracked.has("pyproject.toml")) {
    toolchains.add("python");
    verificationAllow.push("pytest **", "python -m pytest **");
  }
  if (tracked.has("Package.swift")) {
    toolchains.add("swift");
    verificationAllow.push("swift test **", "swift build **");
  }
  verificationAllow.push(...ledgerChecks.map((check) => `${command} ${check} **`));

  const codeExtensions = files
    .map((file) => path.posix.extname(file).toLowerCase())
    .filter((extension) => extension.length > 1);

  return {
    coverageRoots: sortUnique(coverageRoots),
    ignore: sortUnique(ignore),
    verificationAllow: sortUnique(verificationAllow),
    toolchains: sortUnique([...toolchains]),
    codeExtensions: sortUnique(codeExtensions),
  };
}

/** List tracked files under cwd, read the manifests detection needs, and detect the toolchain. */
export async function inspectToolchain(
  cwd: string,
  options: ToolchainDetectionOptions = {},
): Promise<ToolchainDetection> {
  const files = await listTrackedFiles(cwd);
  const tracked = new Set(files);
  const candidates = [
    ...["Makefile", "package.json"].filter((file) => tracked.has(file)),
    ...files.filter((file) => sqlcManifestPattern.test(file)).slice(0, maxSqlcManifests),
  ];
  const manifests = new Map<string, string>();
  for (const file of candidates) {
    try {
      manifests.set(file, await readUtf8FileLimited(path.join(cwd, file), maxManifestBytes, "toolchain manifest"));
    } catch {
      // An unreadable manifest contributes nothing; detection falls back to path-based rules.
    }
  }
  return detectToolchain(files, manifests, options);
}

/**
 * Explicit make targets from a Makefile, sorted. Skips special targets such as .PHONY, pattern
 * rules, double-colon rules, variable assignments, and targets named after release, publish,
 * deploy, push, sign, upload, clean, or install.
 */
export function parseMakeTargets(makefile: string): readonly string[] {
  const targets = new Set<string>();
  for (const line of makefile.split(/\r?\n/)) {
    if (line.length === 0 || /^\s/.test(line) || line.startsWith("#")) continue;
    const match = /^([^:#=]+?)\s*(::?)(.*)$/.exec(line);
    if (!match) continue;
    const [, names = "", separator, rest = ""] = match;
    if (separator === "::" || rest.startsWith("=")) continue;
    for (const name of names.trim().split(/\s+/)) {
      if (!/^[A-Za-z0-9][\w./-]*$/.test(name)) continue;
      if (isDeniedCommandName(name)) continue;
      targets.add(name);
    }
  }
  return sortUnique([...targets]);
}

function nodeCommands(raw: string | undefined): readonly string[] {
  const commands = ["npm test **", "npm ci"];
  const manifest = parseJsonObject(raw);
  if (!manifest) return commands;
  const scripts = asRecord(manifest.scripts);
  for (const script of Object.keys(scripts ?? {})) {
    if (!/^[\w.:-]+$/.test(script) || isDeniedCommandName(script)) continue;
    commands.push(`npm run ${script}`);
  }
  const dependencies = {
    ...asRecord(manifest.dependencies),
    ...asRecord(manifest.devDependencies),
  };
  if ("vitest" in dependencies) commands.push("npx vitest **");
  if ("typescript" in dependencies) commands.push("npx tsc **");
  return commands;
}

function sqlcOutputIgnores(
  files: readonly string[],
  manifests: ReadonlyMap<string, string>,
): readonly string[] {
  const ignores: string[] = [];
  const sqlcManifests = files.filter((file) => sqlcManifestPattern.test(file)).sort().slice(0, maxSqlcManifests);
  for (const manifestPath of sqlcManifests) {
    const raw = manifests.get(manifestPath);
    if (raw === undefined) continue;
    let parsed: unknown;
    try {
      parsed = parseYaml(raw, { maxAliasCount: 16 });
    } catch {
      continue;
    }
    const entries = asRecord(parsed)?.sql;
    if (!Array.isArray(entries)) continue;
    const manifestDirectory = path.posix.dirname(manifestPath);
    for (const entry of entries) {
      const out = asRecord(asRecord(asRecord(entry)?.gen)?.go)?.out;
      if (typeof out !== "string") continue;
      const joined = path.posix.normalize(
        manifestDirectory === "." ? out : `${manifestDirectory}/${out}`,
      ).replace(/\/+$/, "");
      if (joined === manifestDirectory) {
        // Output lands beside the manifest and the hand-written queries, so ignore only the
        // files sqlc generates there.
        ignores.push(...sqlcGeneratedFiles(manifestDirectory));
        continue;
      }
      if (!isSafeRelativeDirectory(joined)) continue;
      ignores.push(`${joined}/**`);
      if (manifestDirectory === ".") ignores.push(`**/${joined}/**`);
    }
  }
  return ignores;
}

/** Files sqlc writes into its output directory, as ignore globs relative to the project root. */
function sqlcGeneratedFiles(directory: string): readonly string[] {
  const names = ["*.sql.go", ...sqlcFixedOutputFiles];
  if (directory === ".") return names;
  if (!isSafeRelativeDirectory(directory)) return [];
  return names.map((name) => `${directory}/${name}`);
}

function isSafeRelativeDirectory(value: string): boolean {
  return value.length > 0 &&
    value !== "." &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    !/[*\u0000-\u001f]/.test(value);
}

function isDeniedCommandName(name: string): boolean {
  const lower = name.toLowerCase();
  return deniedCommandWords.some((word) => lower.includes(word));
}

function recursive(directory: string): readonly string[] {
  return [`${directory}/**`, `**/${directory}/**`];
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
