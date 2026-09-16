import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { LedgerRenderProfile } from "./render.js";

export const ledgerEngineApiVersion = 1 as const;
export const ledgerDaemonFileName = "daemon.json";

/** Response header that carries the operation's process exit code. */
export const ledgerExitCodeHeader = "ledger-exit-code";

/** How long a CLI command waits for a running engine to answer a health probe. */
export const engineProbeTimeoutMs = 400;

export interface LedgerDaemonRecord {
  readonly pid: number;
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly profile: LedgerRenderProfile;
  readonly version: string;
  readonly startedAt: string;
  readonly apiVersion: typeof ledgerEngineApiVersion;
}

export interface LedgerEngineHealth {
  readonly ok: boolean;
  readonly pid: number;
  readonly version: string;
  readonly apiVersion: number;
  readonly project: string;
  readonly projectRoot: string;
  readonly profile: string;
  readonly uptimeMs: number;
  readonly clients: number;
  readonly operationsServed: number;
  readonly render?: { readonly documents: number; readonly totalBytes: number; readonly budgetOk: boolean };
  readonly cache?: unknown;
}

/** Read the daemon record for a workspace when an engine appears to be running. */
export async function readDaemonRecord(
  ledgerRoot: string,
): Promise<LedgerDaemonRecord | undefined> {
  try {
    const raw = await readFile(path.join(ledgerRoot, ledgerDaemonFileName), "utf8");
    const parsed = JSON.parse(raw) as Partial<LedgerDaemonRecord>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.url !== "string" ||
      typeof parsed.port !== "number" ||
      parsed.apiVersion !== ledgerEngineApiVersion
    ) {
      return undefined;
    }
    return parsed as LedgerDaemonRecord;
  } catch {
    return undefined;
  }
}

export async function writeDaemonRecord(ledgerRoot: string, record: LedgerDaemonRecord): Promise<string> {
  const target = path.join(ledgerRoot, ledgerDaemonFileName);
  await mkdir(ledgerRoot, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

/** Remove the daemon record when it belongs to this process. */
export async function removeDaemonRecord(ledgerRoot: string): Promise<void> {
  const current = await readDaemonRecord(ledgerRoot);
  if (current && current.pid !== process.pid) return;
  await rm(path.join(ledgerRoot, ledgerDaemonFileName), { force: true });
}

/** Authorization header for an engine, taken from the environment in network mode. */
export function engineAuthHeaders(token = process.env.LEDGER_SERVE_TOKEN): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Probe a recorded engine. Returns its health when it answers within the
 * timeout and its pid matches the record; otherwise undefined.
 */
export async function probeEngine(
  record: LedgerDaemonRecord,
  timeoutMs = engineProbeTimeoutMs,
): Promise<LedgerEngineHealth | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${record.url}api/v1/health`, {
      headers: engineAuthHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const health = (await response.json()) as LedgerEngineHealth;
    if (!health.ok || health.pid !== record.pid || health.apiVersion !== ledgerEngineApiVersion) {
      return undefined;
    }
    return health;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
