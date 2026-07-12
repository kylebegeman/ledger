import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { buildConflictTargets, writeConflictReport } from "./conflict.js";
import { buildDocsImpact } from "./docsImpact.js";
import { getChangedFiles } from "./git.js";
import { explainFile } from "./indexer.js";
import { buildIntegrityReport, writeIntegrityArtifacts } from "./integrity.js";
import { LedgerError, machineFailure, machineSuccess } from "./machine.js";
import { buildAgentPacket, buildSearchAgentPacket, writeAgentPacketReport } from "./packet.js";
import { normalizeKindFilter, queryDocuments } from "./query.js";
import { buildStaticReaderModel } from "./render.js";
import { validateDocuments, writeValidationReport } from "./validate.js";
import { readLedgerDocuments } from "./documents.js";
import { findWorkspace } from "./workspace.js";
import type { LedgerDocumentKind } from "./types.js";

export type LedgerMcpToolName =
  | "ledger_validate"
  | "ledger_query"
  | "ledger_explain"
  | "ledger_conflict"
  | "ledger_packet"
  | "ledger_search_packet"
  | "ledger_docs_impact"
  | "ledger_verify_integrity";

export interface LedgerMcpOptions {
  readonly cwd?: string;
  readonly version?: string;
}

interface LedgerMcpParsedArgs {
  readonly projectRoot?: string;
  readonly writeReport?: boolean;
  readonly writeArtifacts?: boolean;
  readonly kind?: LedgerDocumentKind;
  readonly status?: string;
  readonly area?: string;
  readonly release?: string;
  readonly decision?: string;
  readonly backlog?: string;
  readonly symbol?: string;
  readonly file?: string;
  readonly doc?: string;
  readonly id?: string;
  readonly text?: string;
  readonly query?: string;
  readonly limit?: number;
  readonly budgetTokens?: number;
  readonly maxEntries?: number;
  readonly path?: string;
  readonly paths?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly staged?: boolean;
}

const projectRootSchema = {
  projectRoot: z.string().optional().describe("Project directory containing .ledger/."),
};

const validateSchema = {
  ...projectRootSchema,
  writeReport: z.boolean().optional().describe("Write .ledger/reports/latest-validation.md."),
};

const querySchema = {
  ...projectRootSchema,
  kind: z.enum(["change", "backlog", "decision", "release", "product-note", "feedback"]).optional(),
  status: z.string().optional(),
  area: z.string().optional(),
  release: z.string().optional(),
  decision: z.string().optional(),
  backlog: z.string().optional(),
  symbol: z.string().optional(),
  file: z.string().optional(),
  doc: z.string().optional(),
  id: z.string().optional(),
  text: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
};

const explainSchema = {
  ...projectRootSchema,
  path: z.string().describe("File path to explain."),
};

const conflictSchema = {
  ...projectRootSchema,
  paths: z.array(z.string()).min(1).describe("File paths to inspect."),
  writeReport: z.boolean().optional().describe("Write .ledger/reports/conflict.md."),
};

const packetSchema = {
  ...projectRootSchema,
  path: z.string().describe("File path to package for agent context."),
  budgetTokens: z.number().int().positive().max(10000).optional().describe("Approximate token budget for the returned packet."),
  maxEntries: z.number().int().positive().max(100).optional().describe("Maximum records to include."),
  writeReport: z.boolean().optional().describe("Write .ledger/reports/packet.md."),
};

const searchPacketSchema = {
  ...projectRootSchema,
  query: z.string().min(1).describe("Search query to package for agent context."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum search matches to include."),
  budgetTokens: z.number().int().positive().max(10000).optional().describe("Approximate token budget for the returned packet."),
  writeReport: z.boolean().optional().describe("Write .ledger/reports/packet.md."),
};

const docsImpactSchema = {
  ...projectRootSchema,
  changedFiles: z.array(z.string()).optional().describe("Changed files to inspect. Uses git status when omitted."),
  staged: z.boolean().optional().describe("Use staged git diff when changedFiles is omitted."),
};

const integritySchema = {
  ...projectRootSchema,
  writeArtifacts: z.boolean().optional().describe("Write .ledger/indexes/integrity.json and .ledger/reports/integrity.md."),
};

export function createLedgerMcpServer(options: LedgerMcpOptions = {}): McpServer {
  const server = new McpServer({
    name: "ledger",
    version: options.version ?? "0.0.0",
  });

  server.registerTool(
    "ledger_validate",
    {
      title: "Validate Ledger records",
      description: "Validate Ledger source records and return errors and warnings.",
      inputSchema: validateSchema,
    },
    (args) => runLedgerMcpTool("ledger_validate", args, options),
  );

  server.registerTool(
    "ledger_query",
    {
      title: "Query Ledger records",
      description: "Filter Ledger records by metadata, relationships, paths, and text.",
      inputSchema: querySchema,
    },
    (args) => runLedgerMcpTool("ledger_query", args, options),
  );

  server.registerTool(
    "ledger_explain",
    {
      title: "Explain file history",
      description: "Return Ledger records that mention a file path.",
      inputSchema: explainSchema,
    },
    (args) => runLedgerMcpTool("ledger_explain", args, options),
  );

  server.registerTool(
    "ledger_conflict",
    {
      title: "Get conflict guidance",
      description: "Return conflict rules, invariants, and verification for paths.",
      inputSchema: conflictSchema,
    },
    (args) => runLedgerMcpTool("ledger_conflict", args, options),
  );

  server.registerTool(
    "ledger_packet",
    {
      title: "Build agent packet",
      description: "Return compact agent handoff context for a file path.",
      inputSchema: packetSchema,
    },
    (args) => runLedgerMcpTool("ledger_packet", args, options),
  );

  server.registerTool(
    "ledger_search_packet",
    {
      title: "Build search agent packet",
      description: "Return compact agent handoff context from weighted Ledger search results.",
      inputSchema: searchPacketSchema,
    },
    (args) => runLedgerMcpTool("ledger_search_packet", args, options),
  );

  server.registerTool(
    "ledger_docs_impact",
    {
      title: "Check docs impact",
      description: "Return docs impact for changed files or the current git diff.",
      inputSchema: docsImpactSchema,
    },
    (args) => runLedgerMcpTool("ledger_docs_impact", args, options),
  );

  server.registerTool(
    "ledger_verify_integrity",
    {
      title: "Verify Ledger integrity",
      description: "Return source record hashes and a deterministic catalog hash.",
      inputSchema: integritySchema,
    },
    (args) => runLedgerMcpTool("ledger_verify_integrity", args, options),
  );

  return server;
}

export async function startLedgerMcpServer(options: LedgerMcpOptions = {}): Promise<void> {
  const server = createLedgerMcpServer(options);
  await server.connect(new StdioServerTransport());
}

export async function runLedgerMcpTool(
  name: LedgerMcpToolName,
  args: unknown,
  options: LedgerMcpOptions = {},
): Promise<CallToolResult> {
  try {
    return await executeLedgerMcpTool(name, args, options);
  } catch (error) {
    return jsonToolError(name, error);
  }
}

async function executeLedgerMcpTool(
  name: LedgerMcpToolName,
  args: unknown,
  options: LedgerMcpOptions,
): Promise<CallToolResult> {
  const parsed = parseArgs(name, args);
  const cwd = parsed.projectRoot ?? options.cwd ?? process.cwd();
  const workspace = await findWorkspace(cwd);
  const documents = await readLedgerDocuments(workspace);

  switch (name) {
    case "ledger_validate": {
      const result = validateDocuments(workspace, documents);
      if (parsed.writeReport) await writeValidationReport(workspace, result);
      return jsonToolResult(name, {
        summary: {
          ok: result.errors.length === 0,
          projectRoot: workspace.projectRoot,
          issueCount: result.issues.length,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
        projectRoot: workspace.projectRoot,
        errors: result.errors,
        warnings: result.warnings,
        issueCount: result.issues.length,
      });
    }

    case "ledger_query": {
      const matches = queryDocuments(documents, {
        kind: parseKind(parsed.kind),
        status: parsed.status,
        area: parsed.area,
        release: parsed.release,
        decision: parsed.decision,
        backlog: parsed.backlog,
        symbol: parsed.symbol,
        file: parsed.file,
        doc: parsed.doc,
        id: parsed.id,
        text: parsed.text,
      });
      const returned = typeof parsed.limit === "number" ? matches.slice(0, parsed.limit) : matches;
      return jsonToolResult(name, {
        summary: {
          total: matches.length,
          returned: returned.length,
          limited: typeof parsed.limit === "number" && returned.length < matches.length,
        },
        matches: returned,
        total: matches.length,
      });
    }

    case "ledger_explain": {
      const target = requiredString(parsed.path, "path");
      const matches = explainFile(documents, target);
      return jsonToolResult(name, {
        summary: {
          target,
          matches: matches.length,
        },
        target,
        matches,
      });
    }

    case "ledger_conflict": {
      const targets = buildConflictTargets(documents, parsed.paths ?? []);
      const reportPath = parsed.writeReport
        ? await writeConflictReport(workspace, targets)
        : undefined;
      return jsonToolResult(name, {
        summary: {
          targets: targets.length,
          entries: targets.reduce((sum, target) => sum + target.entries.length, 0),
          reportPath,
        },
        targets,
        reportPath,
      });
    }

    case "ledger_packet": {
      const packet = buildAgentPacket(documents, requiredString(parsed.path, "path"), {
        budgetTokens: parsed.budgetTokens,
        maxEntries: parsed.maxEntries,
      });
      const reportPath = parsed.writeReport
        ? await writeAgentPacketReport(workspace, packet)
        : undefined;
      return jsonToolResult(name, {
        summary: {
          target: packet.target,
          entries: packet.entries.length,
          estimatedTokens: packet.estimatedTokens,
          budgetTokens: packet.budgetTokens,
          truncated: packet.truncated,
          omittedEntries: packet.omittedEntries,
          reportPath,
        },
        ...packet,
        reportPath,
      });
    }

    case "ledger_search_packet": {
      const query = requiredString(parsed.query, "query");
      const model = buildStaticReaderModel(workspace, documents);
      const packet = buildSearchAgentPacket(model, query, {
        budgetTokens: parsed.budgetTokens,
        limit: parsed.limit,
        maxEntries: parsed.limit,
      });
      const reportPath = parsed.writeReport
        ? await writeAgentPacketReport(workspace, packet)
        : undefined;
      return jsonToolResult(name, {
        summary: {
          target: packet.target,
          entries: packet.entries.length,
          estimatedTokens: packet.estimatedTokens,
          budgetTokens: packet.budgetTokens,
          truncated: packet.truncated,
          omittedEntries: packet.omittedEntries,
          reportPath,
        },
        ...packet,
        reportPath,
      });
    }

    case "ledger_docs_impact": {
      const changedFiles = parsed.changedFiles ?? await getChangedFiles(workspace.projectRoot, {
        staged: parsed.staged,
      });
      const impact = buildDocsImpact(workspace, documents, changedFiles);
      return jsonToolResult(name, {
        summary: {
          sourceFiles: impact.sourceFiles.length,
          docsFiles: impact.docsFiles.length,
          declarations: impact.declarations.length,
          missingDocsImpact: impact.missingDocsImpact.length,
        },
        ...impact,
      });
    }

    case "ledger_verify_integrity": {
      const report = buildIntegrityReport(workspace, documents);
      const written = parsed.writeArtifacts
        ? await writeIntegrityArtifacts(workspace, report)
        : undefined;
      return jsonToolResult(name, {
        summary: {
          documents: report.documents.length,
          catalogHash: report.catalogHash,
          written,
        },
        ...report,
        written,
      });
    }
  }
}

function parseArgs(name: LedgerMcpToolName, args: unknown): LedgerMcpParsedArgs {
  return schemaForTool(name).parse(args ?? {}) as unknown as LedgerMcpParsedArgs;
}

function schemaForTool(name: LedgerMcpToolName): z.ZodObject<z.ZodRawShape> {
  switch (name) {
    case "ledger_validate":
      return z.object(validateSchema);
    case "ledger_query":
      return z.object(querySchema);
    case "ledger_explain":
      return z.object(explainSchema);
    case "ledger_conflict":
      return z.object(conflictSchema);
    case "ledger_packet":
      return z.object(packetSchema);
    case "ledger_search_packet":
      return z.object(searchPacketSchema);
    case "ledger_docs_impact":
      return z.object(docsImpactSchema);
    case "ledger_verify_integrity":
      return z.object(integritySchema);
  }
}

function parseKind(value: LedgerDocumentKind | undefined): LedgerDocumentKind | undefined {
  return normalizeKindFilter(value);
}

function jsonToolResult(command: string, value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(machineSuccess(command, value), null, 2),
      },
    ],
  };
}

function jsonToolError(command: string, error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(machineFailure(command, error), null, 2),
      },
    ],
  };
}

function requiredString(value: string | undefined, fieldName: string): string {
  if (!value) {
    throw new LedgerError("invalid-argument", `Missing required MCP argument: ${fieldName}`, {
      fieldName,
    });
  }
  return value;
}
