import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LedgerError, machineFailure, machineSuccess, type LedgerMachineResult } from "./machine.js";
import { findOperationByTool, ledgerOperations, mcpInputSchema } from "./operations/registry.js";
import { buildContext } from "./operations/runtime.js";
import type { AnyLedgerOperation } from "./operations/types.js";

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
