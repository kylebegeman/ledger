import path from "node:path";
import process from "node:process";
import { createLedgerClient } from "../client.js";
import { probeEngine, readDaemonRecord } from "../daemon.js";
import type { LedgerMachineResult } from "../machine.js";
import type { LedgerOperationName } from "./registry.js";
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

  try {
    const client = createLedgerClient({ url: record.url, timeoutMs: options.timeoutMs ?? defaultOperationTimeoutMs });
    const result = await client.run(operation.name as LedgerOperationName, input as never);
    return { envelope: result.envelope, exitCode: result.exitCode, url: record.url };
  } catch {
    return undefined;
  }
}
