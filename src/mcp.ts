import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

export interface LedgerMcpOptions {
  readonly cwd?: string;
  readonly version?: string;
}

export interface LedgerMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly operation: string;
  readonly mutates: boolean;
}

/** Tools exposed by the MCP server, in registry order. */
export function listLedgerMcpTools(): readonly LedgerMcpTool[] {
  return ledgerOperations.flatMap((operation) =>
    operation.mcp
      ? [
          {
            name: operation.mcp.tool,
            title: operation.mcp.title,
            description: operation.description,
            operation: operation.name,
            mutates: operation.mutates,
          },
        ]
      : [],
  );
}

export function createLedgerMcpServer(options: LedgerMcpOptions = {}): McpServer {
  const server = new McpServer({
    name: "ledger",
    version: options.version ?? "0.0.0",
  });

  registerLedgerResources(server, options);
  registerLedgerPrompts(server, options);

  for (const operation of ledgerOperations) {
    const mcp = operation.mcp;
    if (!mcp) continue;
    server.registerTool(
      mcp.tool,
      {
        title: mcp.title,
        description: operation.description,
        inputSchema: mcpInputSchema(operation).shape,
        outputSchema: mcpOutputShape(operation),
        annotations: {
          readOnlyHint: !operation.mutates,
          idempotentHint: !operation.mutates,
        },
      },
      (args) => runLedgerMcpTool(mcp.tool, args, options),
    );
  }

  return server;
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
      argsSchema: {
        role: z.enum(agentRoles).optional().describe("contributor, reviewer, release, migration, or conflict"),
      },
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
      argsSchema: {
        path: z.string().min(1).describe("Project-relative file path."),
        budgetTokens: z.string().optional().describe("Approximate token budget, default 1600."),
      },
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

export async function startLedgerMcpServer(options: LedgerMcpOptions = {}): Promise<void> {
  const server = createLedgerMcpServer(options);
  await server.connect(new StdioServerTransport());
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

function toolResult(envelope: LedgerMachineResult<unknown>): CallToolResult {
  return {
    ...(envelope.ok ? {} : { isError: true }),
    content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope as unknown as Record<string, unknown>,
  };
}
