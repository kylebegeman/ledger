import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { LedgerError } from "../../machine.js";
import { buildStaticReaderModel, writeStaticReader, type LedgerRenderProfile } from "../../render.js";
import { closeStaticReader, serveStaticReader } from "../../serve.js";
import type { LedgerWorkspace } from "../../types.js";
import { validateDocuments, writeValidationReport } from "../../validate.js";
import { readLedgerDocuments } from "../../documents.js";
import { looseRecord, requireWorkspace } from "../shared.js";
import { defineOperation } from "../types.js";
import { renderProfileSchema } from "./records.js";

interface ServeInput extends Record<string, unknown> {
  readonly host?: string;
  readonly port: number;
  readonly profile: LedgerRenderProfile;
  readonly watch?: boolean;
  readonly expose?: boolean;
}

interface ServeOutput {
  readonly root: string;
  readonly url: string;
  readonly mode: "local" | "network";
  readonly profile: LedgerRenderProfile;
  readonly watchedDirectories: number;
}

export const serveOperation = defineOperation<ServeInput, ServeOutput>({
  name: "serve",
  title: "Serve the static reader",
  description: "Render and serve the selected static reader profile on loopback.",
  workspace: "required",
  mutates: true,
  interactive: true,
  input: z.strictObject({
    host: z.string().min(1).max(255).optional().describe("Bind host."),
    port: z.number().int().positive().max(65535).default(4173).describe("Bind port."),
    profile: renderProfileSchema.default("internal").describe("Reader profile to serve."),
    watch: z.boolean().optional().describe("Rebuild when Ledger source records change."),
    expose: z.boolean().optional().describe("Allow a non-loopback host with a required token."),
  }),
  output: looseRecord({
    root: z.string(),
    url: z.string(),
    mode: z.enum(["local", "network"]),
    profile: z.string(),
    watchedDirectories: z.number(),
  }),
  cli: {
    path: ["serve"],
    usage: "ledger serve [--host <host>] [--port <port>] [--profile <internal|public>] [--watch] [--expose]",
    flags: {
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
    help: `Renders and serves the selected static reader profile. --watch rebuilds when
Ledger source records change. The public profile serves .ledger/dist/public.
Non-loopback binding requires --expose and an access token of at least 24
characters from LEDGER_SERVE_TOKEN.`,
  },
  async run(context, input) {
    const workspace = requireWorkspace(context);
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
        buildStaticReaderModel(workspace, documents, { validation: result, profile: input.profile }),
      );
    };
    await render();
    const served = await serveStaticReader(workspace, {
      host: input.host,
      port: input.port,
      mode: input.expose ? "network" : "local",
      accessToken: process.env.LEDGER_SERVE_TOKEN,
      profile: input.profile,
    });
    const watchers = input.watch
      ? watchStaticReaderSources(
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
    await new Promise<void>((resolve) => {
      const close = () => {
        for (const watcher of watchers) watcher.close();
        process.off("SIGINT", close);
        process.off("SIGTERM", close);
        resolve();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });
    await closeStaticReader(served);
    return {
      data: {
        root: served.root,
        url: served.url,
        mode: served.mode,
        profile: served.profile,
        watchedDirectories: watchers.length,
      },
    };
  },
  format() {
    return "";
  },
});

export function watchStaticReaderSources(
  workspace: LedgerWorkspace,
  rebuild: () => Promise<void>,
  onError: (directory: string, error: Error) => void,
): readonly FSWatcher[] {
  const directories = [
    workspace.config.source.entries,
    workspace.config.source.backlog,
    workspace.config.source.decisions,
    workspace.config.source.releases,
  ];
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rebuilding = false;
  let rebuildAgain = false;
  const runRebuild = async () => {
    if (rebuilding) {
      rebuildAgain = true;
      return;
    }
    rebuilding = true;
    try {
      do {
        rebuildAgain = false;
        await rebuild();
      } while (rebuildAgain);
    } finally {
      rebuilding = false;
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void runRebuild();
    }, 150);
  };

  for (const directory of directories) {
    try {
      watchers.push(watch(path.join(workspace.projectRoot, directory), { recursive: true }, schedule));
    } catch (error) {
      onError(directory, error instanceof Error ? error : new Error(String(error)));
    }
  }
  return watchers;
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
validate, query, search, explain, conflict, packet, search-packet, coverage, ci,
doctor, metrics, stale, unreleased, docs audit, docs classify, docs impact, and
integrity verification.`,
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
