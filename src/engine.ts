import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import process from "node:process";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { McpHttpHandler } from "@modelcontextprotocol/server";
import { readLedgerCatalog, type LedgerCatalogCacheStats } from "./catalogCache.js";
import {
  ledgerEngineApiVersion,
  ledgerExitCodeHeader,
  removeDaemonRecord,
  writeDaemonRecord,
  type LedgerDaemonRecord,
} from "./daemon.js";
import { normalizePath } from "./documents.js";
import { LedgerError, machineFailure, machineSuccess, normalizeLedgerError } from "./machine.js";
import { createLedgerMcpHttpHandler, ledgerMcpProtocolVersions, listLedgerMcpTools } from "./mcp.js";
import { buildOperationsContract, findOperation, ledgerOperations } from "./operations/registry.js";
import { buildContext, validateInput } from "./operations/runtime.js";
import type { AnyLedgerOperation } from "./operations/types.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import {
  buildStaticReaderModel,
  writeStaticReader,
  type LedgerRenderProfile,
  type RenderStaticReaderResult,
} from "./render.js";
import { readEvidence } from "./verify.js";
import {
  closeStaticReader,
  formatUrlHost,
  guardRequest,
  securityHeaders,
  serveStaticPath,
  validateExposure,
  watchLedgerSources,
  type LedgerServeMode,
} from "./serve.js";
import type { LedgerWorkspace } from "./types.js";
import { validateDocuments, writeValidationReport } from "./validate.js";
import { realpath, stat } from "node:fs/promises";

export {
  ledgerDaemonFileName,
  ledgerEngineApiVersion,
  ledgerExitCodeHeader,
  readDaemonRecord,
  type LedgerDaemonRecord,
} from "./daemon.js";

export interface LedgerEngineOptions {
  readonly host?: string;
  readonly port?: number;
  readonly mode?: LedgerServeMode;
  readonly accessToken?: string;
  readonly profile?: LedgerRenderProfile;
  readonly version?: string;
  /** Watch source directories and rebuild on change. Defaults to true. */
  readonly watch?: boolean;
  /** Write .ledger/daemon.json so CLI commands can delegate. Defaults to true. */
  readonly daemonFile?: boolean;
  readonly log?: (line: string) => void;
  readonly logError?: (line: string) => void;
}

export type LedgerEngineEventName =
  | "ready"
  | "records-changed"
  | "rebuilt"
  | "rebuild-failed"
  | "heartbeat";

export interface LedgerEngineResult {
  readonly server: Server;
  readonly url: string;
  readonly root: string;
  readonly mode: LedgerServeMode;
  readonly authenticated: boolean;
  readonly profile: LedgerRenderProfile;
  readonly daemonPath?: string;
  readonly watching: number;
  /** Broadcast an event to every connected /events client. */
  readonly broadcast: (event: LedgerEngineEventName, data: unknown) => void;
  readonly close: () => Promise<void>;
}

interface EngineState {
  readonly workspace: LedgerWorkspace;
  readonly version: string;
  readonly profile: LedgerRenderProfile;
  readonly mode: LedgerServeMode;
  readonly token: string | undefined;
  readonly startedAt: number;
  readonly clients: Set<ServerResponse>;
  operationsServed: number;
  readonly log: (line: string) => void;
  readonly logError: (line: string) => void;
  staticRoot: string;
  lastRender?: RenderStaticReaderResult;
  lastCache?: LedgerCatalogCacheStats;
  /** The MCP handler behind `/mcp`, one per engine so confirmations survive between requests. */
  readonly mcp: McpHttpHandler;
  readonly mcpNode: ReturnType<typeof toNodeHandler>;
}

const maxBodyBytes = 1_000_000;
/** Idle API clients hold keep-alive sockets; give in-flight requests a short window, then cut them. */
const engineCloseGraceMs = 250;
const heartbeatMs = 15_000;
const jsonType = "application/json; charset=utf-8";

/**
 * Start the Ledger engine: the static reader plus a JSON API, an event stream,
 * and MCP over Streamable HTTP, all on one hardened loopback server.
 */
export async function startLedgerEngine(
  workspace: LedgerWorkspace,
  options: LedgerEngineOptions = {},
): Promise<LedgerEngineResult> {
  const profile = options.profile ?? "internal";
  const mode = options.mode ?? "local";
  const host = options.host ?? (mode === "network" ? "0.0.0.0" : "127.0.0.1");
  const port = options.port ?? 4173;
  const token = options.accessToken;
  validateExposure(mode, host, port, token);

  const version = options.version ?? "0.0.0";
  const logError = options.logError ?? ((line: string) => console.error(line));
  const mcp = createLedgerMcpHttpHandler({
    cwd: workspace.projectRoot,
    version,
    writeRoot: workspace.projectRoot,
    onerror: (error) => logError(`MCP: ${error.message}`),
  });
  const state: EngineState = {
    workspace,
    version,
    profile,
    mode,
    token,
    startedAt: Date.now(),
    clients: new Set(),
    operationsServed: 0,
    log: options.log ?? ((line) => console.log(line)),
    logError,
    staticRoot: "",
    mcp,
    mcpNode: toNodeHandler(mcp, { onerror: (error) => logError(`MCP: ${error.message}`) }),
  };

  const initial = await renderReader(state);
  if (!initial.ok) {
    throw new LedgerError(
      "render-validation-failed",
      `Cannot serve reader with ${initial.errors} validation error(s).`,
      { errors: initial.errors },
    );
  }
  state.staticRoot = await staticRootFor(workspace, profile);

  const server = createServer(
    {
      maxHeaderSize: 16 * 1024,
      requestTimeout: 30_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
    },
    (request, response) => {
      void handleEngineRequest(state, request, response).catch((error) => {
        state.logError(error instanceof Error ? error.message : String(error));
        if (!response.headersSent) {
          response.writeHead(500, securityHeaders("text/plain; charset=utf-8"));
        }
        response.end("Ledger engine error\n");
      });
    },
  );
  server.maxConnections = 200;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${formatUrlHost(host)}:${actualPort}/`;

  const heartbeat = setInterval(() => {
    for (const client of state.clients) client.write(`: heartbeat ${Date.now()}\n\n`);
  }, heartbeatMs);
  heartbeat.unref();

  const watchers =
    options.watch === false
      ? []
      : watchLedgerSources(
          workspace,
          async () => {
            try {
              const read = await readLedgerCatalog(workspace);
              state.lastCache = read.cache;
              broadcast(state, "records-changed", {
                documents: read.documents.length,
                hits: read.cache.hits,
                misses: read.cache.misses,
                removed: read.cache.removed,
              });
              state.mcp.notify.resourcesChanged();
              const rendered = await renderReader(state);
              if (rendered.ok) {
                broadcast(state, "rebuilt", {
                  profile,
                  documents: rendered.documents,
                  totalBytes: rendered.totalBytes,
                  budgetOk: rendered.budgetOk,
                });
                state.log("Rebuilt Ledger static reader.");
              } else {
                broadcast(state, "rebuild-failed", { errors: rendered.errors });
                state.logError(`Rebuild skipped: ${rendered.errors} validation error(s).`);
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              broadcast(state, "rebuild-failed", { message });
              state.logError(message);
            }
          },
          (directory, error) => state.logError(`Could not watch ${directory}: ${error.message}`),
        );

  let daemonPath: string | undefined;
  if (options.daemonFile !== false) {
    const record: LedgerDaemonRecord = {
      pid: process.pid,
      url,
      host,
      port: actualPort,
      profile,
      version: state.version,
      startedAt: new Date(state.startedAt).toISOString(),
      apiVersion: ledgerEngineApiVersion,
    };
    daemonPath = await writeDaemonRecord(workspace.ledgerRoot, record);
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const watcher of watchers) watcher.close();
    for (const client of state.clients) client.end();
    state.clients.clear();
    await state.mcp.close().catch(() => undefined);
    if (daemonPath) await removeDaemonRecord(workspace.ledgerRoot).catch(() => undefined);
    await closeStaticReader(
      { server, url, root: state.staticRoot, mode, authenticated: Boolean(token), profile },
      engineCloseGraceMs,
    );
  };

  return {
    server,
    url,
    root: normalizePath(path.relative(workspace.projectRoot, state.staticRoot)),
    mode,
    authenticated: Boolean(token),
    profile,
    daemonPath: daemonPath ? normalizePath(path.relative(workspace.projectRoot, daemonPath)) : undefined,
    watching: watchers.length,
    broadcast: (event, data) => broadcast(state, event, data),
    close,
  };
}

/** Operations exposed over the HTTP API: everything that runs inside a workspace and returns. */
export function apiOperations(): readonly AnyLedgerOperation[] {
  return ledgerOperations.filter(
    (operation) => !operation.interactive && operation.workspace !== "none",
  );
}

async function handleEngineRequest(
  state: EngineState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!guardRequest(state.mode, state.token, request, response)) return;
  const url = new URL(request.url ?? "/", "http://ledger.local");
  const method = request.method ?? "GET";

  if (url.pathname === "/mcp") {
    await handleMcp(state, request, response);
    return;
  }
  if (url.pathname === "/.well-known/mcp/server-card.json") {
    if (!allowMethods(request, response, ["GET", "HEAD"])) return;
    sendJson(response, 200, serverCard(state));
    return;
  }
  if (url.pathname === "/events") {
    if (!allowMethods(request, response, ["GET"])) return;
    openEventStream(state, response);
    return;
  }
  if (url.pathname === "/api/v1" || url.pathname === "/api/v1/") {
    if (!allowMethods(request, response, ["GET", "HEAD"])) return;
    sendJson(response, 200, apiDescription(state));
    return;
  }
  if (url.pathname === "/api/v1/health") {
    if (!allowMethods(request, response, ["GET", "HEAD"])) return;
    sendJson(response, 200, await health(state));
    return;
  }
  if (url.pathname === "/api/v1/operations") {
    if (!allowMethods(request, response, ["GET", "HEAD"])) return;
    sendJson(response, 200, { operations: buildOperationsContract(apiOperations()).operations });
    return;
  }
  const operationMatch = /^\/api\/v1\/operations\/([a-z][a-z0-9.-]*)$/.exec(url.pathname);
  if (operationMatch) {
    if (!allowMethods(request, response, ["POST"])) return;
    await runApiOperation(state, operationMatch[1]!, request, response);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, machineFailure("api", new LedgerError("unknown-command", `Unknown API route: ${url.pathname}`)));
    return;
  }

  if (!allowMethods(request, response, ["GET", "HEAD"])) return;
  await serveStaticPath(state.staticRoot, request, response);
  void method;
}

async function runApiOperation(
  state: EngineState,
  name: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const operation = apiOperations().find((candidate) => candidate.name === name);
  if (!operation) {
    sendJson(
      response,
      404,
      machineFailure(name, new LedgerError("unknown-command", `Unknown operation: ${name}`, { operation: name })),
    );
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, machineFailure(operation.name, error));
    return;
  }
  const rawInput = body === undefined ? {} : body;
  if (rawInput === null || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    sendJson(
      response,
      400,
      machineFailure(operation.name, new LedgerError("invalid-argument", "Request body must be a JSON object")),
    );
    return;
  }
  try {
    const input = validateInput(operation, rawInput as Record<string, unknown>);
    const base = await buildContext(operation, state.workspace.projectRoot, state.version);
    const context = { ...base, log: state.log, logError: state.logError };
    const outcome = await operation.run(context, input);
    state.operationsServed += 1;
    sendJson(response, 200, machineSuccess(operation.name, outcome.data), {
      [ledgerExitCodeHeader]: String(outcome.exitCode ?? 0),
    });
  } catch (error) {
    const normalized = normalizeLedgerError(error);
    const status =
      normalized.code === "invalid-argument"
        ? 400
        : normalized.code === "workspace-not-found"
          ? 404
          : normalized.code === "render-validation-failed"
            ? 409
            : 500;
    sendJson(response, status, machineFailure(operation.name, error), {
      [ledgerExitCodeHeader]: normalized.code === "render-validation-failed" ? "1" : "2",
    });
  }
}

async function handleMcp(
  state: EngineState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!allowMethods(request, response, ["GET", "POST", "DELETE"])) return;
  await state.mcpNode(request, response);
}

function openEventStream(state: EngineState, response: ServerResponse): void {
  response.writeHead(200, {
    ...securityHeaders("text/event-stream; charset=utf-8"),
    connection: "keep-alive",
  });
  response.write("retry: 2000\n\n");
  state.clients.add(response);
  response.on("close", () => state.clients.delete(response));
  writeEvent(response, "ready", {
    project: state.workspace.config.project,
    version: state.version,
    profile: state.profile,
    startedAt: new Date(state.startedAt).toISOString(),
  });
}

function broadcast(state: EngineState, event: LedgerEngineEventName, data: unknown): void {
  for (const client of state.clients) writeEvent(client, event, data);
}

function writeEvent(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function health(state: EngineState): Promise<Record<string, unknown>> {
  return {
    ok: true,
    pid: process.pid,
    version: state.version,
    apiVersion: ledgerEngineApiVersion,
    project: state.workspace.config.project,
    projectRoot: state.workspace.projectRoot,
    profile: state.profile,
    uptimeMs: Date.now() - state.startedAt,
    clients: state.clients.size,
    operationsServed: state.operationsServed,
    render: state.lastRender
      ? {
          documents: state.lastRender.documents,
          totalBytes: state.lastRender.totalBytes,
          budgetOk: state.lastRender.budget.ok,
        }
      : undefined,
    cache: state.lastCache,
  };
}

function apiDescription(state: EngineState): Record<string, unknown> {
  return {
    name: "ledger",
    version: state.version,
    apiVersion: ledgerEngineApiVersion,
    project: state.workspace.config.project,
    routes: {
      health: "/api/v1/health",
      operations: "/api/v1/operations",
      operation: "/api/v1/operations/{name}",
      events: "/events",
      mcp: "/mcp",
      serverCard: "/.well-known/mcp/server-card.json",
      reader: "/",
    },
    operations: apiOperations().map((operation) => ({
      name: operation.name,
      title: operation.title,
      description: operation.description,
      mutates: operation.mutates,
    })),
  };
}

function serverCard(state: EngineState): Record<string, unknown> {
  return {
    name: "ledger",
    title: `Ledger (${state.workspace.config.project})`,
    version: state.version,
    description: "Repo-native change memory for humans and coding agents.",
    transport: { type: "streamable-http", url: "/mcp", stateless: true },
    protocolVersions: [...ledgerMcpProtocolVersions],
    tools: listLedgerMcpTools().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      readOnly: !tool.mutates,
      ...(tool.confirms ? { confirms: true, protocolVersions: [ledgerMcpProtocolVersions[0]] } : {}),
    })),
  };
}

async function renderReader(
  state: EngineState,
): Promise<{ readonly ok: true; readonly documents: number; readonly totalBytes: number; readonly budgetOk: boolean } | { readonly ok: false; readonly errors: number }> {
  const read = await readLedgerCatalog(state.workspace);
  state.lastCache = read.cache;
  const validation = validateDocuments(state.workspace, read.documents);
  if (validation.errors.length > 0) {
    await writeValidationReport(state.workspace, validation);
    return { ok: false, errors: validation.errors.length };
  }
  const model = buildStaticReaderModel(state.workspace, read.documents, {
    evidence: await readEvidence(state.workspace),
    validation,
    profile: state.profile,
  });
  const rendered = await writeStaticReader(state.workspace, model);
  state.lastRender = rendered;
  return {
    ok: true,
    documents: rendered.documents,
    totalBytes: rendered.totalBytes,
    budgetOk: rendered.budget.ok,
  };
}

async function staticRootFor(workspace: LedgerWorkspace, profile: LedgerRenderProfile): Promise<string> {
  const output = profile === "public"
    ? `${workspace.config.render.output}/public`
    : workspace.config.render.output;
  const root = await resolveSafeProjectPath(workspace.projectRoot, output, "render output");
  const realRoot = await realpath(root);
  if (!(await stat(realRoot)).isDirectory()) {
    throw new LedgerError("filesystem-error", `Render output is not a directory: ${root}`, { path: root });
  }
  return realRoot;
}

function allowMethods(
  request: IncomingMessage,
  response: ServerResponse,
  methods: readonly string[],
): boolean {
  if (methods.includes(request.method ?? "")) return true;
  response.writeHead(405, { ...securityHeaders("text/plain; charset=utf-8"), allow: methods.join(", ") });
  response.end("Method not allowed\n");
  return false;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    ...securityHeaders(jsonType),
    ...extraHeaders,
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > maxBodyBytes) {
      throw new LedgerError("resource-limit-exceeded", `Request body exceeds ${maxBodyBytes} bytes`, {
        limit: maxBodyBytes,
      });
    }
    chunks.push(buffer);
  }
  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch (error) {
    throw new LedgerError("invalid-argument", "Request body is not valid JSON", undefined, { cause: error });
  }
}
