import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { normalizePath } from "./documents.js";
import { isPathInside, resolveSafeProjectPath } from "./projectPaths.js";
import { LedgerError } from "./machine.js";
import type { LedgerWorkspace } from "./types.js";

export type LedgerServeMode = "local" | "network";

export interface LedgerServeOptions {
  readonly host?: string;
  readonly port?: number;
  readonly mode?: LedgerServeMode;
  readonly accessToken?: string;
}

export interface LedgerServeResult {
  readonly server: Server;
  readonly url: string;
  readonly root: string;
  readonly mode: LedgerServeMode;
  readonly authenticated: boolean;
}

const contentSecurityPolicy = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export async function serveStaticReader(
  workspace: LedgerWorkspace,
  options: LedgerServeOptions = {},
): Promise<LedgerServeResult> {
  const root = await resolveSafeProjectPath(
    workspace.projectRoot,
    workspace.config.render.output,
    "render output",
  );
  const mode = options.mode ?? "local";
  const host = options.host ?? (mode === "network" ? "0.0.0.0" : "127.0.0.1");
  const port = options.port ?? 4173;
  const token = options.accessToken;
  validateExposure(mode, host, token);

  const server = createServer(
    {
      maxHeaderSize: 16 * 1024,
      requestTimeout: 10_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
    },
    (request, response) => {
      void handleRequest(root, mode, token, request, response).catch(() => {
        if (!response.headersSent) {
          response.writeHead(500, securityHeaders("text/plain; charset=utf-8"));
        }
        response.end("Could not serve Ledger reader\n");
      });
    },
  );
  server.maxConnections = 100;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${formatUrlHost(host)}:${actualPort}/`,
    root: normalizePath(path.relative(workspace.projectRoot, root)),
    mode,
    authenticated: Boolean(token),
  };
}

export async function closeStaticReader(
  served: LedgerServeResult,
  graceMs = 5_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      served.server.closeAllConnections?.();
    }, graceMs);
    served.server.close((error) => finish(error));
    served.server.closeIdleConnections?.();
  });
}

async function handleRequest(
  root: string,
  mode: LedgerServeMode,
  token: string | undefined,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      ...securityHeaders("text/plain; charset=utf-8"),
      allow: "GET, HEAD",
    });
    response.end("Method not allowed\n");
    return;
  }
  if (mode === "local" && !isAllowedLocalHost(request.headers.host)) {
    response.writeHead(421, securityHeaders("text/plain; charset=utf-8"));
    response.end("Misdirected request\n");
    return;
  }
  if (token && !isAuthorized(request.headers.authorization, token)) {
    response.writeHead(401, {
      ...securityHeaders("text/plain; charset=utf-8"),
      "www-authenticate": 'Basic realm="Ledger", charset="UTF-8"',
    });
    response.end("Authentication required\n");
    return;
  }
  if ((request.url?.length ?? 0) > 2_048) {
    response.writeHead(414, securityHeaders("text/plain; charset=utf-8"));
    response.end("URI too long\n");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://ledger.local");
  const filePath = await resolveRequestPath(root, requestUrl.pathname);
  if (!filePath) {
    response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
    response.end("Not found\n");
    return;
  }
  const fileStats = await stat(filePath);
  response.writeHead(200, {
    ...securityHeaders(contentType(filePath)),
    "content-length": fileStats.size,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

async function resolveRequestPath(root: string, pathname: string): Promise<string | undefined> {
  const decoded = safeDecodeURIComponent(pathname);
  if (!decoded) return undefined;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (!isPathInside(normalizedRoot, candidate)) return undefined;
  try {
    const [realRoot, realCandidate, stats] = await Promise.all([
      realpath(normalizedRoot),
      realpath(candidate),
      stat(candidate),
    ]);
    if (!isPathInside(realRoot, realCandidate) || !stats.isFile()) return undefined;
    return realCandidate;
  } catch {
    return undefined;
  }
}

function validateExposure(mode: LedgerServeMode, host: string, token: string | undefined): void {
  if (mode === "local" && !isLoopbackHost(host)) {
    throw new LedgerError(
      "invalid-argument",
      `Refusing non-loopback host ${host} without network exposure mode`,
      { host, mode },
    );
  }
  if (mode === "network" && (!token || token.length < 24)) {
    throw new LedgerError(
      "invalid-argument",
      "Network exposure requires an access token of at least 24 characters",
      { mode },
    );
  }
}

function isAllowedLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    return isLoopbackHost(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!header) return false;
  let supplied: string | undefined;
  if (header.startsWith("Bearer ")) {
    supplied = header.slice("Bearer ".length);
  } else if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator >= 0 && decoded.slice(0, separator) === "ledger") {
        supplied = decoded.slice(separator + 1);
      }
    } catch {
      return false;
    }
  }
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function securityHeaders(contentTypeValue: string): Record<string, string> {
  return {
    "content-type": contentTypeValue,
    "cache-control": "no-store",
    "content-security-policy": contentSecurityPolicy,
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function formatUrlHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
