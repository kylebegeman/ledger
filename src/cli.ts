#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { ledgerOperations } from "./operations/registry.js";
import { runLedgerCli } from "./operations/runtime.js";

export interface RunOptions {
  readonly cwd?: string;
}

const fallbackVersion = "0.1.0";

/**
 * Run the Ledger CLI. Every command is an operation from the registry; this
 * entrypoint only resolves the package version and hands argv to the runtime.
 */
export async function run(
  argv = process.argv.slice(2),
  options: RunOptions = {},
): Promise<number> {
  return runLedgerCli(ledgerOperations, argv, {
    cwd: options.cwd,
    version: packageVersion(),
  });
}

export function packageVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { readonly version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

if (isDirectCliInvocation()) {
  process.exitCode = await run();
}

function isDirectCliInvocation(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invokedPath);
  } catch {
    return import.meta.url === `file://${invokedPath}`;
  }
}
