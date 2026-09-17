import process from "node:process";
import { z } from "zod";
import { startLedgerEngine } from "../../engine.js";
import { LedgerError } from "../../machine.js";
import { buildStaticReaderModel, writeStaticReader, type LedgerRenderProfile } from "../../render.js";
import { closeStaticReader, serveStaticReader, watchLedgerSources } from "../../serve.js";
import { validateDocuments, writeValidationReport } from "../../validate.js";
import { readLedgerDocuments } from "../../documents.js";
import { looseRecord, requireWorkspace } from "../shared.js";
import { defineOperation } from "../types.js";
import { readEvidence } from "../../verify.js";
import { renderProfileSchema } from "./records.js";

export interface ServeInput extends Record<string, unknown> {
  readonly host?: string;
  readonly port: number;
  readonly profile: LedgerRenderProfile;
  readonly watch?: boolean;
  readonly expose?: boolean;
  readonly api?: boolean;
}

export interface ServeOutput {
  readonly root: string;
  readonly url: string;
  readonly mode: "local" | "network";
  readonly profile: LedgerRenderProfile;
  readonly api: boolean;
  readonly watchedDirectories: number;
}

export const serveOperation = defineOperation<ServeInput, ServeOutput>({
  name: "serve",
  title: "Serve the static reader",
  description: "Render and serve the static reader on loopback, optionally with the engine API.",
  workspace: "required",
  mutates: true,
  interactive: true,
  input: z.strictObject({
    host: z.string().min(1).max(255).optional().describe("Bind host."),
    port: z.number().int().positive().max(65535).default(4173).describe("Bind port."),
    profile: renderProfileSchema.default("internal").describe("Reader profile to serve."),
    watch: z.boolean().optional().describe("Rebuild when Ledger source records change."),
    expose: z.boolean().optional().describe("Allow a non-loopback host with a required token."),
    api: z.boolean().optional().describe("Also serve the JSON API, event stream, and MCP over HTTP."),
  }),
  output: looseRecord({
    root: z.string(),
    url: z.string(),
    mode: z.enum(["local", "network"]),
    profile: z.string(),
    api: z.boolean(),
    watchedDirectories: z.number(),
  }),
  cli: {
    path: ["serve"],
    usage:
      "ledger serve [--host <host>] [--port <port>] [--profile <internal|public>] [--watch] [--expose] [--api]",
    flags: {
      api: { type: "boolean", description: "Serve the engine API, events, and MCP alongside the reader." },
      host: { type: "string", description: "Bind host." },
      port: { type: "number", description: "Bind port." },
      profile: {
        type: "string",
        description: "Reader profile to serve.",
        choices: ["internal", "public"],
        choicesLabel: "render profile",
      },
      watch: { type: "boolean", description: "Rebuild when source records change." },
      expose: { type: "boolean", description: "Allow non-loopback binding with a token." },
    },
    json: false,
    help: `Renders and serves the selected static reader profile. --api also serves the
JSON API at /api/v1, the event stream at /events, and MCP over Streamable HTTP
at /mcp, writes .ledger/daemon.json so CLI commands delegate to the warm
server, and always watches source records. --watch rebuilds when Ledger source
records change. The public profile serves .ledger/dist/public. Non-loopback
binding requires --expose and an access token of at least 24 characters from
LEDGER_SERVE_TOKEN.`,
  },
  async run(context, input) {
    const workspace = requireWorkspace(context);
    const mode = input.expose ? "network" : "local";

    if (input.api) {
      const engine = await startLedgerEngine(workspace, {
        host: input.host,
        port: input.port,
        mode,
        accessToken: process.env.LEDGER_SERVE_TOKEN,
        profile: input.profile,
        version: context.version,
        log: context.log,
        logError: context.logError,
      });
      context.log(`Serving ${engine.root} at ${engine.url}`);
      context.log(`API at ${engine.url}api/v1, events at ${engine.url}events, MCP at ${engine.url}mcp`);
      if (engine.daemonPath) context.log(`Wrote ${engine.daemonPath}; CLI commands delegate to this server.`);
      if (engine.mode === "network") {
        context.log("Network exposure enabled; HTTP Basic user is ledger and the configured token is required.");
      }
      if (engine.watching > 0) {
        context.log(`Watching ${engine.watching} Ledger source director${engine.watching === 1 ? "y" : "ies"}.`);
      }
      await waitForSignal();
      await engine.close();
      return {
        data: {
          root: engine.root,
          url: engine.url,
          mode: engine.mode,
          profile: engine.profile,
          api: true,
          watchedDirectories: engine.watching,
        },
      };
    }

    const render = async () => {
      const documents = await readLedgerDocuments(workspace);
      const result = validateDocuments(workspace, documents);
      if (result.errors.length > 0) {
        await writeValidationReport(workspace, result);
        throw new LedgerError(
          "render-validation-failed",
          `Cannot serve reader with ${result.errors.length} validation error(s).`,
          { errors: result.errors.length },
        );
      }
      await writeStaticReader(
        workspace,
        buildStaticReaderModel(workspace, documents, { validation: result, profile: input.profile, evidence: await readEvidence(workspace) }),
      );
    };
    await render();
    const served = await serveStaticReader(workspace, {
      host: input.host,
      port: input.port,
      mode,
      accessToken: process.env.LEDGER_SERVE_TOKEN,
      profile: input.profile,
    });
    const watchers = input.watch
      ? watchLedgerSources(
          workspace,
          async () => {
            try {
              await render();
              context.log("Rebuilt Ledger static reader.");
            } catch (error) {
              context.logError(error instanceof Error ? error.message : String(error));
            }
          },
          (directory, error) => {
            context.logError(`Could not watch ${directory}: ${error.message}`);
          },
        )
      : [];

    context.log(`Serving ${served.root} at ${served.url}`);
    if (served.mode === "network") {
      context.log("Network exposure enabled; HTTP Basic user is ledger and the configured token is required.");
    }
    if (watchers.length > 0) {
      context.log(`Watching ${watchers.length} Ledger source director${watchers.length === 1 ? "y" : "ies"}.`);
    }
    await waitForSignal();
    for (const watcher of watchers) watcher.close();
    await closeStaticReader(served);
    return {
      data: {
        root: served.root,
        url: served.url,
        mode: served.mode,
        profile: served.profile,
        api: false,
        watchedDirectories: watchers.length,
      },
    };
  },
  format() {
    return "";
  },
});

async function waitForSignal(): Promise<void> {
  await new Promise<void>((resolve) => {
    const close = () => {
      process.off("SIGINT", close);
      process.off("SIGTERM", close);
      resolve();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

export const mcpOperation = defineOperation<Record<string, never>, { readonly transport: "stdio" }>({
  name: "mcp",
  title: "Start the MCP server",
  description: "Start a stdio Model Context Protocol server exposing Ledger tools for agents.",
  workspace: "none",
  mutates: false,
  interactive: true,
  input: z.strictObject({}),
  output: looseRecord({ transport: z.literal("stdio") }),
  cli: {
    path: ["mcp"],
    usage: "ledger mcp",
    flags: {},
    json: false,
    help: `Starts a stdio Model Context Protocol server exposing Ledger tools for agents:
validate, ready, query, search, explain, conflict, packet, search-packet,
context, coverage, ci, doctor, metrics, stale, unreleased, release notes, cache status,
docs audit, docs classify, docs impact, and integrity verification. The tools
that write records (new, feedback, backlog new, decision new, promote,
update, and session start, note, and close) take section bodies, ask the user
to confirm first, and write nothing otherwise. The server speaks MCP 2026-07-28 and the 2025 revisions; a 2025-era
client can confirm when it supports elicitation. For MCP over HTTP, run
\`ledger serve --api\` and connect to /mcp.`,
  },
  async run(context) {
    const { startLedgerMcpServer } = await import("../../mcp.js");
    await startLedgerMcpServer({ cwd: context.cwd, version: context.version });
    return { data: { transport: "stdio" } };
  },
  format() {
    return "";
  },
});
