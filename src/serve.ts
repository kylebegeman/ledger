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
import type { LedgerRenderProfile } from "./render.js";
import type { LedgerWorkspace } from "./types.js";

export type LedgerServeMode = "local" | "network";

export interface LedgerServeOptions {
  readonly host?: string;
  readonly port?: number;
  readonly mode?: LedgerServeMode;
  readonly accessToken?: string;
  readonly profile?: LedgerRenderProfile;
}

export interface LedgerServeResult {
  readonly server: Server;
  readonly url: string;
  readonly root: string;
  readonly mode: LedgerServeMode;
  readonly authenticated: boolean;
  readonly profile: LedgerRenderProfile;
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
  const profile = options.profile ?? "internal";
  const output = profile === "public"
    ? `${workspace.config.render.output}/public`
    : workspace.config.render.output;
  const root = await resolveSafeProjectPath(
    workspace.projectRoot,
    output,
    "render output",
  );
  const realRoot = await realpath(root);
  if (!(await stat(realRoot)).isDirectory()) {
    throw new LedgerError("filesystem-error", `Render output is not a directory: ${root}`, {
      path: root,
    });
  }
  const mode = options.mode ?? "local";
  const host = options.host ?? (mode === "network" ? "0.0.0.0" : "127.0.0.1");
  const port = options.port ?? 4173;
  const token = options.accessToken;
  validateExposure(mode, host, port, token);

  const server = createServer(
    {
      maxHeaderSize: 16 * 1024,
      requestTimeout: 10_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
    },
    (request, response) => {
      void handleRequest(realRoot, mode, token, request, response).catch(() => {
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
    profile,
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
  if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
    response.writeHead(400, securityHeaders("text/plain; charset=utf-8"));
    response.end("Invalid request target\n");
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
  if (!isPathInside(root, candidate)) return undefined;
  try {
    const realCandidate = await realpath(candidate);
    if (!isPathInside(root, realCandidate) || !(await stat(realCandidate)).isFile()) return undefined;
    return realCandidate;
  } catch {
    return undefined;
  }
}

function validateExposure(
  mode: LedgerServeMode,
  host: string,
  port: number,
  token: string | undefined,
): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new LedgerError("invalid-argument", `Invalid server port: ${port}`, { port });
  }
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
    isIpv4Loopback(normalized) ||
    (normalized.startsWith("::ffff:") && isIpv4Loopback(normalized.slice("::ffff:".length)))
  );
}

function isIpv4Loopback(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!header) return false;
  let supplied: string | undefined;
  const bearer = /^Bearer[ \t]+(.+)$/i.exec(header);
  const basic = /^Basic[ \t]+(.+)$/i.exec(header);
  if (bearer) {
    supplied = bearer[1];
  } else if (basic) {
    try {
      const decoded = Buffer.from(basic[1] ?? "", "base64").toString("utf8");
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
