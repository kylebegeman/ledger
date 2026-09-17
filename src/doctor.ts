import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inspectLedgerCatalogCache, readLedgerCatalog } from "./catalogCache.js";
import { probeEngine, readDaemonRecord, removeStaleDaemonRecord } from "./daemon.js";
import { auditDocs } from "./docs.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { isCoverageRequired } from "./coverage.js";
import { inspectGit, listTrackedFiles } from "./git.js";
import { inspectWorkspaceWriteState, recoverInterruptedTransactions } from "./fileTransaction.js";
import { hookHosts, hostHookFile, ledgerHookCommandPrefix, type LedgerHookHost } from "./hooks.js";
import { buildIndexes, writeIndexes } from "./indexer.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import { measureLedgerPerformance, type LedgerPerformanceResult } from "./performance.js";
import { buildStaticReaderModel, checkRenderBudgets, writeStaticReader } from "./render.js";
import { detectStaleKnowledge } from "./stale.js";
import { summarizeSymbolLanguages, symbolExtractorStatus, typeScriptFallbackAdvice } from "./symbols.js";
import { evidenceFreshness, readEvidence, splitShellWords } from "./verify.js";
import type {
  LedgerDocsAudit,
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export type LedgerDoctorCheckLevel = "pass" | "warn" | "fail";

export interface LedgerDoctorCheck {
  readonly name: string;
  readonly level: LedgerDoctorCheckLevel;
  readonly message: string;
}

export interface LedgerDoctorResult {
  readonly ok: boolean;
  readonly checks: readonly LedgerDoctorCheck[];
  readonly docsAudit: LedgerDocsAudit;
  readonly performance: LedgerPerformanceResult;
  /** Repairs `doctor --fix` attempted before these checks ran. */
  readonly fixes?: readonly LedgerDoctorFix[];
}

export interface LedgerDoctorFix {
  readonly check: string;
  readonly ok: boolean;
  readonly message: string;
}

export interface RunDoctorOptions {
  /** The running Ledger's version, compared with the version the installed hooks run. */
  readonly version?: string;
}

/** How long `doctor` waits for the hook command to print its version. */
const hookCommandTimeoutMs = 20_000;

export async function runDoctor(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  validation: LedgerValidationResult,
  options: RunDoctorOptions = {},
): Promise<LedgerDoctorResult> {
  const docsAudit = await auditDocs(workspace, documents);
  const stale = await detectStaleKnowledge(workspace, documents, validation);
  const performance = await measureLedgerPerformance(workspace);
  const checks: LedgerDoctorCheck[] = [
    {
      name: "workspace",
      level: "pass",
      message: `loaded ${normalizePath(workspace.configPath)}`,
    },
    await gitCheck(workspace),
    await writeStateCheck(workspace),
    {
      name: "validation",
      level: validation.errors.length > 0 ? "fail" : validation.warnings.length > 0 ? "warn" : "pass",
      message: `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`,
    },
    {
      name: "docs",
      level: docsAudit.missingReferences.length > 0
        ? "fail"
        : docsAudit.unreferencedDocs.length > 0 || docsAudit.unknownDocs.length > 0
          ? "warn"
          : "pass",
      message: `${docsAudit.missingReferences.length} missing reference(s), ${docsAudit.unreferencedDocs.length} unreferenced durable doc(s), ${docsAudit.unknownDocs.length} unknown doc(s)`,
    },
    await indexFreshnessCheck(workspace, documents),
    await cacheCheck(workspace),
    await engineCheck(workspace),
    await renderOutputCheck(workspace),
    await renderBudgetCheck(workspace),
    performanceCheck(performance),
    await symbolsCheck(workspace),
    await hooksCheck(workspace, options.version),
    await verificationCheck(workspace, documents),
    {
      name: "stale-knowledge",
      level: stale.issues.length > 0 ? "warn" : "pass",
      message: `${stale.issues.length} stale signal(s)`,
    },
  ];

  return {
    ok: checks.every((check) => check.level !== "fail"),
    checks,
    docsAudit,
    performance,
  };
}

async function verificationCheck(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): Promise<LedgerDoctorCheck> {
  const evidence = await readEvidence(workspace);
  const counts = { fresh: 0, stale: 0, failed: 0, none: 0 };
  for (const document of documents) {
    if (document.kind !== "change") continue;
    const id = normalizeDocument(document).id;
    counts[evidenceFreshness(evidence.entries[id], workspace.config.verification.maxAgeDays)] += 1;
  }
  const message = `${counts.fresh} fresh, ${counts.stale} stale, ${counts.failed} failed, ${counts.none} without evidence`;
  if (counts.failed > 0 || counts.stale > 0) {
    return { name: "verification", level: "warn", message: `${message}; rerun ledger verify --run` };
  }
  return { name: "verification", level: "pass", message };
}

async function symbolsCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const covered = (await listTrackedFiles(workspace.projectRoot)).filter((file) =>
    isCoverageRequired(workspace, file),
  );
  const languages = summarizeSymbolLanguages(covered);
  if (covered.length > 0 && !languages.extractable) {
    const named = languages.otherLanguages.length > 0
      ? languages.otherLanguages.join(", ")
      : "other-language";
    return {
      name: "symbols",
      level: "pass",
      message: `no TypeScript or JavaScript under coverage; symbol extraction covers TypeScript, JavaScript, and Markdown, so ${named} anchors are not extracted or checked`,
    };
  }
  const statuses = await symbolExtractorStatus();
  const typescript = statuses.find((status) => status.name === "typescript");
  if (typescript?.available) {
    const parser = typescript.version ? `typescript ${typescript.version}` : "typescript";
    return { name: "symbols", level: "pass", message: `${parser} parser available for anchors` };
  }
  return {
    name: "symbols",
    level: "warn",
    message: `regex fallback for code anchors: ${typeScriptFallbackAdvice(typescript?.reason)}`,
  };
}

async function engineCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const record = await readDaemonRecord(workspace.ledgerRoot);
  if (!record) {
    return { name: "engine", level: "pass", message: "no engine running; start one with ledger serve --api" };
  }
  const health = await probeEngine(record);
  if (!health) {
    return {
      name: "engine",
      level: "warn",
      message: `stale daemon record for pid ${record.pid} at ${record.url}; delete .ledger/daemon.json or restart ledger serve --api`,
    };
  }
  return {
    name: "engine",
    level: "pass",
    message: `running at ${record.url} (pid ${health.pid}, ${health.operationsServed} operation(s) served)`,
  };
}

async function cacheCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const cache = await inspectLedgerCatalogCache(workspace);
  if (cache.backend === "none") {
    return { name: "cache", level: "warn", message: `catalog cache ${cache.note ?? "unavailable"}` };
  }
  if (!cache.exists) {
    return { name: "cache", level: "pass", message: `${cache.backend} backend, not written yet` };
  }
  if (!cache.current) {
    return {
      name: "cache",
      level: "warn",
      message: `${cache.backend} backend at ${cache.cachePath} is stale and will be rebuilt`,
    };
  }
  return {
    name: "cache",
    level: "pass",
    message: `${cache.backend} backend, ${cache.entries} record(s), ${cache.bytes} bytes at ${cache.cachePath}`,
  };
}

async function writeStateCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const state = await inspectWorkspaceWriteState(workspace);
  if (state.pendingTransactions.length > 0) {
    return {
      name: "write-state",
      level: "fail",
      message: `${state.pendingTransactions.length} interrupted transaction(s) require recovery`,
    };
  }
  if (state.lock) {
    return {
      name: "write-state",
      level: "warn",
      message: `${state.lock.stale ? "stale" : "active"} lock for ${state.lock.operation ?? "unknown operation"}`,
    };
  }
  return {
    name: "write-state",
    level: "pass",
    message: "no lock or interrupted transaction",
  };
}

export function formatDoctorResult(result: LedgerDoctorResult): string {
  const lines: string[] = [];
  if (result.fixes) {
    lines.push(result.fixes.length === 0 ? "Ledger doctor --fix: nothing to repair." : "Ledger doctor --fix:");
    for (const fix of result.fixes) lines.push(`- ${fix.ok ? "fixed" : "not fixed"}: ${fix.check} (${fix.message})`);
    lines.push("");
  }
  lines.push(`Ledger doctor: ${result.ok ? "passed" : "failed"}.`);
  for (const check of result.checks) {
    lines.push(`- ${check.level}: ${check.name} (${check.message})`);
  }
  return lines.join("\n");
}

/**
 * Repair the derived and runtime state the checks flagged: interrupted writes
 * and stale locks, a stale engine record, a stale catalog cache, missing or
 * stale indexes, and a missing reader. Source records are never edited, so a
 * fix is always safe to rerun.
 */
export async function repairDerivedState(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  validation: LedgerValidationResult,
  checks: readonly LedgerDoctorCheck[],
): Promise<readonly LedgerDoctorFix[]> {
  const fixes: LedgerDoctorFix[] = [];
  const flagged = (name: string) => checks.find((check) => check.name === name && check.level !== "pass");
  const attempt = async (check: string, action: () => Promise<string>): Promise<void> => {
    try {
      fixes.push({ check, ok: true, message: await action() });
    } catch (error) {
      fixes.push({ check, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  };
  const writeState = flagged("write-state");
  if (writeState) {
    const state = await inspectWorkspaceWriteState(workspace);
    if (state.pendingTransactions.length > 0 || state.lock?.stale) {
      await attempt("write-state", async () => {
        await recoverInterruptedTransactions(workspace);
        return state.pendingTransactions.length > 0
          ? `recovered ${state.pendingTransactions.length} interrupted transaction(s)`
          : "removed a stale lock";
      });
    } else {
      fixes.push({ check: "write-state", ok: false, message: "another process holds the write lock; wait for it to finish" });
    }
  }
  if (flagged("engine")) {
    if (await removeStaleDaemonRecord(workspace.ledgerRoot)) {
      fixes.push({ check: "engine", ok: true, message: "removed the stale engine record" });
    } else {
      fixes.push({ check: "engine", ok: false, message: "the engine answered again, so its record stays" });
    }
  }
  const cache = flagged("cache");
  if (cache && /stale/.test(cache.message)) {
    await attempt("cache", async () => {
      const read = await readLedgerCatalog(workspace);
      return `rebuilt the catalog cache with ${read.documents.length} record(s)`;
    });
  }
  const blocked = validation.errors.length > 0
    ? `${validation.errors.length} validation error(s) must be fixed first`
    : undefined;
  if (flagged("indexes")) {
    if (blocked) fixes.push({ check: "indexes", ok: false, message: blocked });
    else {
      await attempt("indexes", async () => {
        await writeIndexes(workspace, buildIndexes(workspace, documents));
        return `regenerated indexes under ${normalizePath(workspace.config.indexes.output)}`;
      });
    }
  }
  if (flagged("render")) {
    if (blocked) fixes.push({ check: "render", ok: false, message: blocked });
    else {
      await attempt("render", async () => {
        const model = buildStaticReaderModel(workspace, documents, { evidence: await readEvidence(workspace), validation });
        const rendered = await writeStaticReader(workspace, model);
        return `rendered ${normalizePath(rendered.outputPath)}`;
      });
    }
  }
  return fixes;
}

interface InstalledHooks {
  readonly host: LedgerHookHost;
  readonly path: string;
  readonly prefixes: readonly string[];
}

/**
 * Hooks that cannot run fail silently in every host, so capture stops without
 * a sign. Check that each installed hook file runs `agents.command` and that
 * the command prints this Ledger's version.
 */
async function hooksCheck(workspace: LedgerWorkspace, version: string | undefined): Promise<LedgerDoctorCheck> {
  const installed: InstalledHooks[] = [];
  for (const host of hookHosts) {
    const file = hostHookFile(host);
    const prefixes = await installedHookPrefixes(workspace, file.path);
    if (prefixes.length > 0) installed.push({ host, path: file.path, prefixes });
  }
  if (installed.length === 0) return { name: "hooks", level: "pass", message: "no host hooks installed" };
  const command = workspace.config.agents.command;
  const hosts = installed.map((entry) => entry.host).join(", ");
  const drifted = installed.filter((entry) => entry.prefixes.some((prefix) => prefix !== command));
  if (drifted.length > 0) {
    const shown = drifted.map((entry) => `${entry.path} runs \`${entry.prefixes.find((prefix) => prefix !== command)}\``);
    return {
      name: "hooks",
      level: "warn",
      message: `${shown.join("; ")}, but agents.command is \`${command}\`; rerun ledger hooks install for ${drifted.map((entry) => entry.host).join(", ")}`,
    };
  }
  const argv = splitShellWords(command);
  if (!argv || argv.length === 0) {
    return { name: "hooks", level: "warn", message: `agents.command \`${command}\` cannot be split into a command` };
  }
  const run = await runCommand(argv, workspace.projectRoot);
  if (!run.ok) {
    return {
      name: "hooks",
      level: "warn",
      message: `${hosts} hooks cannot run: \`${command} version\` ${run.reason}; the hosts skip them without a message, so rebuild or reinstall Ledger`,
    };
  }
  const reported = /^ledger\s+(\S+)\s*$/m.exec(run.stdout)?.[1];
  if (!reported) {
    return {
      name: "hooks",
      level: "warn",
      message: `\`${command} version\` did not print a Ledger version; another program may own the name, so set --command on ledger hooks install`,
    };
  }
  if (version && reported !== version) {
    return {
      name: "hooks",
      level: "warn",
      message: `${hosts} hooks run Ledger ${reported} through \`${command}\`, but this is Ledger ${version}`,
    };
  }
  return { name: "hooks", level: "pass", message: `${hosts} hooks run Ledger ${reported} through \`${command}\`` };
}

async function installedHookPrefixes(workspace: LedgerWorkspace, relativePath: string): Promise<readonly string[]> {
  let raw: string;
  try {
    raw = await readFile(await resolveSafeProjectPath(workspace.projectRoot, relativePath, "hook file"), "utf8");
  } catch (error) {
    if (isCode(error, "ENOENT")) return [];
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const prefixes = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "command") {
          const prefix = ledgerHookCommandPrefix(child);
          if (prefix) prefixes.add(prefix);
        } else {
          visit(child);
        }
      }
    }
  };
  visit(parsed);
  return [...prefixes];
}

function runCommand(
  argv: readonly string[],
  cwd: string,
): Promise<{ readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly reason: string }> {
  return new Promise((resolve) => {
    execFile(
      argv[0]!,
      [...argv.slice(1), "version"],
      { cwd, timeout: hookCommandTimeoutMs, maxBuffer: 64 * 1024, env: { ...process.env, LEDGER_NO_DAEMON: "1" } },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout: String(stdout) });
          return;
        }
        const detail = String(stderr).trim().split(/\r?\n/)[0] || error.message.split(/\r?\n/)[0];
        const code = (error as { readonly code?: unknown }).code;
        const reason = (error as { readonly killed?: boolean }).killed
          ? `timed out after ${hookCommandTimeoutMs / 1000}s`
          : code === "ENOENT"
            ? `failed because ${argv[0]} was not found`
            : `failed: ${detail}`;
        resolve({ ok: false, reason });
      },
    );
  });
}

async function gitCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const git = await inspectGit(workspace.projectRoot);
  if (git.available && git.insideWorkTree) {
    return {
      name: "git",
      level: "pass",
      message: `work tree ${git.root ?? workspace.projectRoot}`,
    };
  }
  return {
    name: "git",
    level: "warn",
    message: git.error ?? "not inside a Git work tree",
  };
}

async function indexFreshnessCheck(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): Promise<LedgerDoctorCheck> {
  const manifestPath = path.join(workspace.projectRoot, workspace.config.indexes.output, "manifest.json");
  const manifestModifiedAt = await modifiedAt(manifestPath);
  if (!manifestModifiedAt) {
    return {
      name: "indexes",
      level: "warn",
      message: "manifest.json has not been generated",
    };
  }

  const newestSource = Math.max(
    0,
    ...(await Promise.all(documents.map((document) => modifiedAt(document.absolutePath)))).filter(
      (value): value is number => typeof value === "number",
    ),
  );
  if (newestSource > manifestModifiedAt) {
    return {
      name: "indexes",
      level: "warn",
      message: "generated indexes are older than Ledger source records",
    };
  }
  return {
    name: "indexes",
    level: "pass",
    message: "generated indexes are current",
  };
}

async function renderOutputCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const indexPath = path.join(workspace.projectRoot, workspace.config.render.output, "index.html");
  try {
    await access(indexPath);
    return {
      name: "render",
      level: "pass",
      message: `${normalizePath(path.relative(workspace.projectRoot, indexPath))} exists`,
    };
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    return {
      name: "render",
      level: "warn",
      message: "static reader has not been generated",
    };
  }
}

async function renderBudgetCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const budget = await checkRenderBudgets(workspace);
  const failingArtifacts = budget.artifacts.filter((artifact) => !artifact.ok);
  const messages = [
    `${budget.totalBytes}/${budget.maxTotalBytes} bytes`,
    ...failingArtifacts.map((artifact) =>
      `${artifact.kind} ${artifact.bytes}/${artifact.maxBytes} bytes`,
    ),
  ];
  if (budget.writeMs > budget.maxWriteMs) {
    messages.push(`write ${budget.writeMs}/${budget.maxWriteMs}ms`);
  }
  return {
    name: "render-budget",
    level: budget.ok ? "pass" : budget.totalBytes === 0 ? "warn" : "fail",
    message: messages.join(", "),
  };
}

function performanceCheck(result: LedgerPerformanceResult): LedgerDoctorCheck {
  const failingSteps = result.steps.filter((step) => !step.ok);
  const messages = [
    `${result.totalMs}/${result.maxTotalMs}ms total`,
    ...failingSteps.map((step) => `${step.name} ${step.durationMs}/${step.maxMs}ms`),
  ];
  return {
    name: "performance",
    level: result.ok ? "pass" : "warn",
    message: messages.join(", "),
  };
}

async function modifiedAt(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
