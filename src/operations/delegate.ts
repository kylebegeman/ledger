import path from "node:path";
import process from "node:process";
import {
  engineAuthHeaders,
  ledgerExitCodeHeader,
  probeEngine,
  readDaemonRecord,
} from "../daemon.js";
import type { LedgerMachineResult } from "../machine.js";
import { findProjectRoot } from "../workspace.js";
import type { AnyLedgerOperation } from "./types.js";

export interface LedgerDelegatedOutcome {
  readonly envelope: LedgerMachineResult<unknown>;
  readonly exitCode: number;
  readonly url: string;
}

export interface DelegateOptions {
  /** Skip delegation entirely. */
  readonly local?: boolean;
  /** Request timeout for the delegated operation. */
  readonly timeoutMs?: number;
}

/** Environment variable that disables delegation for every command. */
export const noDaemonEnvironmentVariable = "LEDGER_NO_DAEMON";

const defaultOperationTimeoutMs = 120_000;

/** Whether an operation may run inside a running engine instead of this process. */
export function isDelegatable(operation: AnyLedgerOperation): boolean {
  return operation.workspace === "required" && !operation.interactive;
}

/**
 * Run an operation through a live engine for the workspace containing `cwd`.
 * Returns undefined when no engine is running, the record is stale, delegation
 * is disabled, or the request fails before the engine answers; the caller then
 * runs the operation locally.
 */
export async function delegateOperation(
  operation: AnyLedgerOperation,
  input: Record<string, unknown>,
  cwd: string,
  options: DelegateOptions = {},
): Promise<LedgerDelegatedOutcome | undefined> {
  if (options.local || process.env[noDaemonEnvironmentVariable] || !isDelegatable(operation)) {
    return undefined;
  }
  let projectRoot: string;
  try {
    projectRoot = await findProjectRoot(cwd);
  } catch {
    return undefined;
  }
  const record = await readDaemonRecord(path.join(projectRoot, ".ledger"));
  if (!record) return undefined;
  const health = await probeEngine(record);
  if (!health) return undefined;
  if (path.resolve(health.projectRoot) !== path.resolve(projectRoot)) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultOperationTimeoutMs);
  try {
    const response = await fetch(`${record.url}api/v1/operations/${operation.name}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...engineAuthHeaders() },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const envelope = (await response.json()) as LedgerMachineResult<unknown>;
    if (typeof envelope !== "object" || envelope === null || !("schemaVersion" in envelope)) {
      return undefined;
    }
    const header = response.headers.get(ledgerExitCodeHeader);
    const exitCode = header && /^\d+$/.test(header) ? Number.parseInt(header, 10) : envelope.ok ? 0 : 2;
    return { envelope, exitCode, url: record.url };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
