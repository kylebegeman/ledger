import { createHash, randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import {
  acceptedContent,
  CLIENT_CAPABILITIES_META_KEY,
  createMcpHandler,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  McpServer,
  ResourceTemplate,
  SUPPORTED_PROTOCOL_VERSIONS,
  type CacheHint,
  type CallToolResult,
  type ClientCapabilities,
  type InputRequiredResult,
  type McpHttpHandler,
  type RequestStateCodec,
  type ServerContext,
  type Transport,
} from "@modelcontextprotocol/server";
import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { readLedgerCatalog } from "./catalogCache.js";
import { normalizeDocument } from "./documents.js";
import { LedgerError, machineFailure, machineSuccess, type LedgerMachineResult } from "./machine.js";
import { agentInstructions, agentRoles } from "./operations/definitions/agents.js";
import {
  buildOperationsContract,
  findOperationByTool,
  ledgerOperations,
  mcpInputSchema,
} from "./operations/registry.js";
import { buildContext } from "./operations/runtime.js";
import type { AnyLedgerOperation } from "./operations/types.js";
import { buildAgentPacket, formatAgentPacket } from "./packet.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";
import { findWorkspace } from "./workspace.js";

/** MCP tool name. Every tool is an operation from the registry with `mcp` metadata. */
export type LedgerMcpToolName = string;

/** Protocol revisions the server speaks, newest first; the confirmed write tools need the first. */
export const ledgerMcpProtocolVersions = ["2026-07-28", ...SUPPORTED_PROTOCOL_VERSIONS] as const;

export interface LedgerMcpOptions {
  readonly cwd?: string;
  readonly version?: string;
  /**
   * Whether the server registers the tools that write source records. Those
   * tools ask the user to confirm first, so the engine leaves them out of
   * stateless 2025-era HTTP requests, which cannot carry a confirmation.
   * Defaults to true.
   */
  readonly writeTools?: boolean;
  /**
   * The only project a confirmed write may target. The engine sets it to its
   * own workspace, so a `projectRoot` argument cannot send a write elsewhere.
   */
  readonly writeRoot?: string;
  /** Receives SDK errors that never reach a client, such as a rejected requestState. */
  readonly onerror?: (error: Error) => void;
}

export interface LedgerMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly operation: string;
  readonly mutates: boolean;
  /** Whether the tool asks the user to confirm before it writes. */
  readonly confirms: boolean;
}

/** Tools exposed by the MCP server, in registry order. */
export function listLedgerMcpTools(): readonly LedgerMcpTool[] {
  return ledgerOperations.flatMap((operation) =>
    operation.mcp
      ? [
          {
            name: operation.mcp.tool,
            title: operation.mcp.title,
            description: toolDescription(operation),
            operation: operation.name,
            mutates: operation.mutates,
            confirms: operation.mcp.confirm !== undefined,
          },
        ]
      : [],
  );
}

/**
 * Cache lifetimes the 2026-07-28 revision advertises for list results. Tools,
 * prompts, and resource templates only change with the Ledger version, which
 * is part of the server identity clients cache under; record lists and reads
 * change with every edit and keep the SDK's no-cache default.
 */
export const ledgerMcpCacheHints = {
  "tools/list": { ttlMs: 60 * 60 * 1000, cacheScope: "private" },
  "prompts/list": { ttlMs: 60 * 60 * 1000, cacheScope: "private" },
  "resources/templates/list": { ttlMs: 60 * 60 * 1000, cacheScope: "private" },
} as const satisfies Readonly<Record<string, CacheHint>>;

export function createLedgerMcpServer(options: LedgerMcpOptions = {}): McpServer {
  const server = new McpServer(
    { name: "ledger", version: options.version ?? "0.0.0" },
    {
      cacheHints: ledgerMcpCacheHints,
      requestState: { verify: (state, ctx) => confirmationCodec().verify(state, ctx) },
    },
  );
  if (options.onerror) server.server.onerror = options.onerror;

  registerLedgerResources(server, options);
  registerLedgerPrompts(server, options);

  for (const operation of ledgerOperations) {
    const mcp = operation.mcp;
    if (!mcp) continue;
    const confirms = mcp.confirm !== undefined;
    if (confirms && options.writeTools === false) continue;
    server.registerTool(
      mcp.tool,
      {
        title: mcp.title,
        description: toolDescription(operation),
        inputSchema: mcpInputSchema(operation),
        outputSchema: z.object(mcpOutputShape(operation)),
        annotations: confirms
          ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
          : { readOnlyHint: !operation.mutates, idempotentHint: !operation.mutates },
      },
      confirms
        ? (args, ctx) => runConfirmedLedgerMcpTool(server, operation, args, ctx, options)
        : (args) => runLedgerMcpTool(mcp.tool, args, options),
    );
  }

  return server;
}

function toolDescription(operation: AnyLedgerOperation): string {
  return operation.mcp?.confirm
    ? `${operation.description} Asks the user to confirm before writing; nothing is written without that confirmation.`
    : operation.description;
}

/** Default token budget for packet resources and handoff prompts. */
export const mcpPacketBudgetTokens = 1_600;

/** Resource URIs the server exposes. Records list; packets and the contract are read on demand. */
export const ledgerMcpResourceUris = {
  record: "ledger://records/{id}",
  packet: "ledger://packet/{path}",
  contract: "ledger://contract",
} as const;

function registerLedgerResources(server: McpServer, options: LedgerMcpOptions): void {
  server.registerResource(
    "ledger-record",
    new ResourceTemplate(ledgerMcpResourceUris.record, {
      list: async () => {
        const { documents } = await loadCatalog(options);
        return {
          resources: documents.map((document) => {
            const normalized = normalizeDocument(document);
            return {
              uri: `ledger://records/${encodeURIComponent(normalized.id)}`,
              name: normalized.id,
              title: normalized.title,
              description: `${normalized.kind} ${normalized.status} at ${normalized.path}`,
              mimeType: "text/markdown",
            };
          }),
        };
      },
    }),
    {
      title: "Ledger record",
      description: "The raw Markdown of one Ledger record, addressed by id.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const id = decodeURIComponent(String(variables.id ?? ""));
      const { documents } = await loadCatalog(options);
      const document = documents.find((candidate) => String(candidate.frontmatter.id) === id);
      if (!document) {
        throw new LedgerError("invalid-argument", `Unknown Ledger record: ${id}`, { id });
      }
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: document.raw }] };
    },
  );

  server.registerResource(
    "ledger-packet",
    new ResourceTemplate(ledgerMcpResourceUris.packet, { list: undefined }),
    {
      title: "Agent packet for a path",
      description:
        "A token-bounded handoff packet for a project-relative file path. Encode the path with encodeURIComponent.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const target = decodeURIComponent(String(variables.path ?? ""));
      if (!target) throw new LedgerError("invalid-argument", "Packet path must not be empty");
      const { documents } = await loadCatalog(options);
      const packet = buildAgentPacket(documents, target, { budgetTokens: mcpPacketBudgetTokens });
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatAgentPacket(packet) }] };
    },
  );

  server.registerResource(
    "ledger-contract",
    ledgerMcpResourceUris.contract,
    {
      title: "Ledger operations contract",
      description: "Every Ledger operation with JSON Schema for its input and output.",
      mimeType: "application/json",
      cacheHint: ledgerMcpCacheHints["tools/list"],
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(buildOperationsContract(), null, 2),
        },
      ],
    }),
  );
}

function registerLedgerPrompts(server: McpServer, options: LedgerMcpOptions): void {
  server.registerPrompt(
    "ledger_agent_instructions",
    {
      title: "Ledger workflow instructions",
      description: "Operating instructions for an agent role in this Ledger project.",
      argsSchema: z.object({
        role: z.enum(agentRoles).optional().describe("contributor, reviewer, release, migration, or conflict"),
      }),
    },
    async ({ role }) => {
      const workspace = await tryWorkspace(options);
      const text = agentInstructions(
        workspace?.config.project ?? "this project",
        workspace?.config.docs.adoption ?? "partial",
        role ?? "contributor",
      );
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  server.registerPrompt(
    "ledger_handoff",
    {
      title: "Ledger handoff for a path",
      description: "Context an agent should read before editing a file: matching records, conflict rules, invariants, verification, and related decisions.",
      argsSchema: z.object({
        path: z.string().min(1).describe("Project-relative file path."),
        budgetTokens: z.string().optional().describe("Approximate token budget, default 1600."),
      }),
    },
    async ({ path: target, budgetTokens }) => {
      const { documents } = await loadCatalog(options);
      const budget = budgetTokens && /^[1-9]\d*$/.test(budgetTokens) ? Number.parseInt(budgetTokens, 10) : mcpPacketBudgetTokens;
      const packet = buildAgentPacket(documents, target, { budgetTokens: budget });
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Before editing ${target}, read this Ledger handoff and preserve its conflict rules and invariants.\n\n${formatAgentPacket(packet)}`,
            },
          },
        ],
      };
    },
  );
}

async function loadCatalog(
  options: LedgerMcpOptions,
): Promise<{ readonly workspace: LedgerWorkspace; readonly documents: readonly ParsedLedgerDocument[] }> {
  const workspace = await findWorkspace(options.cwd ?? process.cwd());
  const { documents } = await readLedgerCatalog(workspace);
  return { workspace, documents };
}

async function tryWorkspace(options: LedgerMcpOptions): Promise<LedgerWorkspace | undefined> {
  try {
    return await findWorkspace(options.cwd ?? process.cwd());
  } catch {
    return undefined;
  }
}

export interface LedgerMcpStdioOptions extends LedgerMcpOptions {
  /** Transport to serve instead of the process's stdin and stdout. */
  readonly transport?: Transport;
}

/**
 * Serve MCP over stdio. The client's opening message picks the protocol era:
 * a 2026-07-28 client gets that revision, and a 2025-era `initialize` gets the
 * earlier protocol from the same tools, resources, and prompts.
 */
export function serveLedgerMcpStdio(options: LedgerMcpStdioOptions = {}): StdioServerHandle {
  const { transport, ...serverOptions } = options;
  const onerror = options.onerror ?? ((error: Error) => console.error(`ledger mcp: ${error.message}`));
  return serveStdio(() => createLedgerMcpServer({ ...serverOptions, onerror }), { transport, onerror });
}

export async function startLedgerMcpServer(options: LedgerMcpOptions = {}): Promise<void> {
  serveLedgerMcpStdio(options);
}

/**
 * The web-standard MCP handler the engine mounts at `/mcp`. It serves
 * 2026-07-28 requests and, statelessly, 2025-era requests; the confirmed
 * write tools exist only on the 2026-07-28 side, where a confirmation can
 * travel with the request.
 */
export function createLedgerMcpHttpHandler(options: LedgerMcpOptions = {}): McpHttpHandler {
  return createMcpHandler(
    (context) =>
      createLedgerMcpServer({
        ...options,
        writeTools: options.writeTools !== false && context.era === "modern",
      }),
    { onerror: options.onerror },
  );
}

/** Machine envelope shape returned by every tool as structured content. */
export function mcpOutputShape(operation: AnyLedgerOperation): z.ZodRawShape {
  return {
    schemaVersion: z.literal(1),
    ok: z.boolean(),
    command: z.string(),
    data: z.looseObject({ summary: z.looseObject({}), ...operation.output.shape }).optional(),
    error: z
      .looseObject({ code: z.string(), message: z.string(), details: z.looseObject({}).optional() })
      .optional(),
  };
}

/**
 * Run a tool's operation directly and wrap the outcome in the machine envelope.
 * This is the library entry point: it never asks for confirmation, because
 * the caller is the program itself. The MCP server asks before calling it for
 * tools that write source records.
 */
export async function runLedgerMcpTool(
  name: LedgerMcpToolName,
  args: unknown,
  options: LedgerMcpOptions = {},
): Promise<CallToolResult> {
  const operation = findOperationByTool(name);
  if (!operation?.mcp) {
    return toolResult(
      machineFailure(name, new LedgerError("unknown-command", `Unknown MCP tool: ${name}`, { tool: name })),
    );
  }
  try {
    const parsed = mcpInputSchema(operation).parse(args ?? {}) as Record<string, unknown> & {
      readonly projectRoot?: string;
    };
    const { projectRoot, ...input } = parsed;
    const cwd = projectRoot ?? options.cwd ?? process.cwd();
    if (operation.mcp.confirm && options.writeRoot !== undefined) {
      await requireWriteRoot(cwd, options.writeRoot);
    }
    const base = await buildContext(operation, cwd, options.version ?? "0.0.0");
    const context = {
      ...base,
      log: (line: string) => console.error(line),
      logError: (line: string) => console.error(line),
    };
    const outcome = await operation.run(context, input);
    const payload = { summary: operation.mcp.summary(outcome.data), ...outcome.data };
    return toolResult(machineSuccess(name, payload));
  } catch (error) {
    return toolResult(machineFailure(name, error));
  }
}

/** The key the confirmation travels under in `inputRequests` and `inputResponses`. */
export const ledgerMcpConfirmationKey = "confirm";

/** How long a confirmation request stays answerable, in seconds. */
export const ledgerMcpConfirmationTtlSeconds = 600;

const confirmationContent = z.object({ confirm: z.boolean() });

const confirmationRequestedSchema = {
  type: "object" as const,
  properties: {
    confirm: {
      type: "boolean" as const,
      title: "Write it",
      description: "Ledger writes only when this is checked and you accept.",
    },
  },
  required: ["confirm"],
};

/** What a confirmation round carries back: the tool and the exact arguments it was asked for. */
export interface LedgerMcpConfirmationState {
  readonly tool: string;
  readonly fingerprint: string;
}

let sharedConfirmationCodec: RequestStateCodec<LedgerMcpConfirmationState> | undefined;

/**
 * One HMAC key per process: every round of a confirmation reaches the process
 * that asked, both over stdio and through the engine, so the key never needs
 * to leave memory.
 */
function confirmationCodec(): RequestStateCodec<LedgerMcpConfirmationState> {
  sharedConfirmationCodec ??= createRequestStateCodec<LedgerMcpConfirmationState>({
    key: randomBytes(32),
    ttlSeconds: ledgerMcpConfirmationTtlSeconds,
  });
  return sharedConfirmationCodec;
}

/**
 * A digest of a tool call's arguments that ignores key order, so a
 * confirmation given for one call cannot be replayed for different arguments.
 */
export function confirmationFingerprint(tool: string, args: unknown): string {
  return createHash("sha256").update(`${tool}\0${canonicalJson(args ?? {})}`).digest("base64url");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function runConfirmedLedgerMcpTool(
  server: McpServer,
  operation: AnyLedgerOperation,
  args: unknown,
  ctx: ServerContext,
  options: LedgerMcpOptions,
): Promise<CallToolResult | InputRequiredResult> {
  const mcp = operation.mcp!;
  const confirm = mcp.confirm!;
  const fingerprint = confirmationFingerprint(mcp.tool, args);
  const state = ctx.mcpReq.requestState<LedgerMcpConfirmationState>();

  if (state === undefined) {
    let message: string;
    try {
      const parsed = mcpInputSchema(operation).parse(args ?? {}) as Record<string, unknown> & {
        readonly projectRoot?: string;
      };
      const { projectRoot, ...input } = parsed;
      const cwd = projectRoot ?? options.cwd ?? process.cwd();
      if (options.writeRoot !== undefined) await requireWriteRoot(cwd, options.writeRoot);
      const workspace = await findWorkspace(cwd);
      // One line per part, so text from the arguments cannot pose as the project line.
      const action = confirm(input).replace(/\s+/g, " ").trim();
      message = `${action}\nProject: ${workspace.config.project} (${workspace.projectRoot}). Nothing is written unless you confirm.`;
    } catch (error) {
      return toolResult(machineFailure(mcp.tool, error));
    }
    if (!supportsFormElicitation(clientCapabilities(server, ctx))) {
      return toolResult(
        machineFailure(
          mcp.tool,
          new LedgerError(
            "confirmation-unavailable",
            `${mcp.tool} writes records, so it asks the user to confirm first, and this client cannot show that confirmation. Nothing was written; run the same Ledger command in a terminal instead.`,
            { tool: mcp.tool, operation: operation.name },
          ),
        ),
      );
    }
    return inputRequired({
      inputRequests: {
        [ledgerMcpConfirmationKey]: inputRequired.elicit({ message, requestedSchema: confirmationRequestedSchema }),
      },
      requestState: await confirmationCodec().mint({ tool: mcp.tool, fingerprint }),
    });
  }

  if (typeof state !== "object" || state === null || state.tool !== mcp.tool || state.fingerprint !== fingerprint) {
    return toolResult(
      machineFailure(
        mcp.tool,
        new LedgerError("invalid-argument", "The confirmation belongs to a different tool call. Nothing was written.", {
          tool: mcp.tool,
        }),
      ),
    );
  }

  const accepted = acceptedContent(ctx.mcpReq.inputResponses, ledgerMcpConfirmationKey, confirmationContent);
  if (accepted?.confirm !== true) {
    const answer = inputResponse(ctx.mcpReq.inputResponses, ledgerMcpConfirmationKey);
    const reason =
      answer.kind !== "elicit"
        ? "no confirmation came back"
        : answer.action === "accept"
          ? "the confirmation was accepted without checking Write it"
          : `the user chose ${answer.action}`;
    return toolResult(
      machineFailure(
        mcp.tool,
        new LedgerError("confirmation-declined", `Nothing was written: ${reason}.`, { tool: mcp.tool }),
      ),
    );
  }

  return runLedgerMcpTool(mcp.tool, args, options);
}

/**
 * The capabilities the client declared for this request: the request's own
 * envelope on the 2026-07-28 revision, the `initialize` handshake on a
 * 2025-era connection. Stateless 2025-era requests declare nothing.
 */
function clientCapabilities(server: McpServer, ctx: ServerContext): ClientCapabilities | undefined {
  const envelope = ctx.mcpReq.envelope as Readonly<Record<string, unknown>> | undefined;
  if (envelope) return envelope[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
  return server.server.getClientCapabilities();
}

/** A bare `elicitation: {}` declares form support; otherwise `form` must be listed. */
function supportsFormElicitation(capabilities: ClientCapabilities | undefined): boolean {
  const elicitation = capabilities?.elicitation as Readonly<Record<string, unknown>> | undefined;
  if (elicitation === undefined || elicitation === null || typeof elicitation !== "object") return false;
  const modes = Object.keys(elicitation);
  return modes.length === 0 || modes.includes("form");
}

async function requireWriteRoot(cwd: string, writeRoot: string): Promise<void> {
  const workspace = await findWorkspace(cwd);
  const [target, allowed] = await Promise.all([realpath(workspace.projectRoot), realpath(writeRoot)]);
  if (target !== allowed) {
    throw new LedgerError(
      "invalid-argument",
      "This server writes only to its own project; projectRoot points somewhere else.",
      { projectRoot: workspace.projectRoot },
    );
  }
}

function toolResult(envelope: LedgerMachineResult<unknown>): CallToolResult {
  return {
    ...(envelope.ok ? {} : { isError: true }),
    content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope as unknown as Record<string, unknown>,
  };
}
