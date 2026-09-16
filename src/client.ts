import path from "node:path";
import process from "node:process";
import {
  engineAuthHeaders,
  ledgerExitCodeHeader,
  probeEngine,
  readDaemonRecord,
  type LedgerEngineHealth,
} from "./daemon.js";
import { LedgerError, type LedgerMachineResult } from "./machine.js";
import type {
  LedgerOperationInput,
  LedgerOperationName,
  LedgerOperationOutput,
  LedgerOperationsContract,
} from "./operations/registry.js";

export interface LedgerClientOptions {
  /** Engine base URL, for example `http://127.0.0.1:4173/`. */
  readonly url: string;
  /** Bearer token; defaults to `LEDGER_SERVE_TOKEN`. */
  readonly token?: string;
  /** Request timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Fetch implementation, for tests. */
  readonly fetch?: typeof fetch;
}

export interface LedgerClientResult<O> {
  readonly envelope: LedgerMachineResult<O>;
  /** Process exit code the operation would have produced, from the `ledger-exit-code` header. */
  readonly exitCode: number;
  readonly status: number;
}

/**
 * Typed client for the engine's JSON API. Operation names, inputs, and outputs
 * come from the operation registry, the same source the contract manifest and
 * the CLI are generated from, so a call that does not typecheck cannot be sent.
 */
export interface LedgerClient {
  readonly url: string;
  run<K extends LedgerOperationName>(
    name: K,
    input: LedgerOperationInput<K>,
  ): Promise<LedgerClientResult<LedgerOperationOutput<K>>>;
  health(): Promise<LedgerEngineHealth>;
  operations(): Promise<LedgerOperationsContract["operations"]>;
}

const defaultTimeoutMs = 120_000;

export function createLedgerClient(options: LedgerClientOptions): LedgerClient {
  const base = options.url.endsWith("/") ? options.url : `${options.url}/`;
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const headers = () => ({ ...engineAuthHeaders(options.token ?? process.env.LEDGER_SERVE_TOKEN) });

  async function request(pathname: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImplementation(`${base}${pathname}`, { ...init, signal: controller.signal });
    } catch (error) {
      throw new LedgerError("operational-error", `Ledger engine request failed: ${pathname}`, { url: base, pathname }, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    url: base,
    async run(name, input) {
      const response = await request(`api/v1/operations/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers() },
        body: JSON.stringify(input),
      });
      const envelope = await parseEnvelope(response, name);
      const header = response.headers.get(ledgerExitCodeHeader);
      const exitCode = header && /^\d+$/.test(header) ? Number.parseInt(header, 10) : envelope.ok ? 0 : 2;
      return { envelope: envelope as LedgerMachineResult<never>, exitCode, status: response.status };
    },
    async health() {
      const response = await request("api/v1/health", { method: "GET", headers: headers() });
      const body = await parseJsonBody(response, "health");
      if (!isRecord(body) || typeof body.ok !== "boolean" || typeof body.pid !== "number") {
        throw new LedgerError("operational-error", "Ledger engine returned an unexpected health response", {
          url: base,
          status: response.status,
        });
      }
      return body as unknown as LedgerEngineHealth;
    },
    async operations() {
      const response = await request("api/v1/operations", { method: "GET", headers: headers() });
      const body = await parseJsonBody(response, "operations");
      if (!isRecord(body) || !Array.isArray(body.operations)) {
        throw new LedgerError("operational-error", "Ledger engine returned an unexpected operations response", {
          url: base,
          status: response.status,
        });
      }
      return body.operations as LedgerOperationsContract["operations"];
    },
  };
}

async function parseJsonBody(response: Response, name: string): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new LedgerError("operational-error", `Ledger engine returned a non-JSON response for ${name}`, {
      status: response.status,
    }, { cause: error });
  }
}

async function parseEnvelope(response: Response, name: string): Promise<LedgerMachineResult<unknown>> {
  const body = await parseJsonBody(response, name);
  if (!isRecord(body) || body.schemaVersion !== 1 || typeof body.ok !== "boolean" || typeof body.command !== "string") {
    throw new LedgerError("operational-error", `Ledger engine returned an invalid envelope for ${name}`, {
      status: response.status,
    });
  }
  return body as unknown as LedgerMachineResult<unknown>;
}

export interface ConnectLedgerClientOptions extends Omit<LedgerClientOptions, "url"> {}

/**
 * Connect to the engine serving the workspace that contains `projectRoot`,
 * using its daemon record and health probe. Returns undefined when no live
 * engine serves that project.
 */
export async function connectLedgerClient(
  projectRoot: string,
  options: ConnectLedgerClientOptions = {},
): Promise<LedgerClient | undefined> {
  const record = await readDaemonRecord(path.join(projectRoot, ".ledger"));
  if (!record) return undefined;
  const health = await probeEngine(record);
  if (!health) return undefined;
  if (path.resolve(health.projectRoot) !== path.resolve(projectRoot)) return undefined;
  return createLedgerClient({ ...options, url: record.url });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
