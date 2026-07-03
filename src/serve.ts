import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { normalizePath } from "./documents.js";
import type { LedgerWorkspace } from "./types.js";

export interface LedgerServeOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface LedgerServeResult {
  readonly server: Server;
  readonly url: string;
  readonly root: string;
}

export async function serveStaticReader(
  workspace: LedgerWorkspace,
  options: LedgerServeOptions = {},
): Promise<LedgerServeResult> {
  const root = path.join(workspace.projectRoot, workspace.config.render.output);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${host}`);
    const filePath = await resolveRequestPath(root, requestUrl.pathname);
    if (!filePath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  });

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
    url: `http://${host}:${actualPort}/`,
    root: normalizePath(path.relative(workspace.projectRoot, root)),
  };
}

async function resolveRequestPath(root: string, pathname: string): Promise<string | undefined> {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${path.sep}`)) {
    return undefined;
  }
  try {
    await access(candidate);
    return candidate;
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
