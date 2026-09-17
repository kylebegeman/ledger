import { z } from "zod";
import { agentsOperation } from "./definitions/agents.js";
import {
  backlogNewOperation,
  decisionNewOperation,
  feedbackOperation,
  migrateChangelogOperation,
  newEntryOperation,
  promoteOperation,
  releaseNotesOperation,
  releaseOperation,
  unreleasedOperation,
  updateOperation,
} from "./definitions/authoring.js";
import { cacheClearOperation, cacheStatusOperation, cacheWarmOperation } from "./definitions/cache.js";
import { ciOperation, coverageOperation, docsImpactOperation } from "./definitions/changes.js";
import {
  docsAuditOperation,
  docsCheckOperation,
  docsClassifyOperation,
  docsMigrateOperation,
  docsReconcileOperation,
} from "./definitions/docs.js";
import { doctorOperation, metricsOperation, staleOperation } from "./definitions/health.js";
import { hookOperation, hooksInstallOperation } from "./definitions/hooks.js";
import { readyOperation } from "./definitions/readiness.js";
import { skillsInstallOperation } from "./definitions/skills.js";
import { verifyOperation } from "./definitions/verify.js";
import {
  adoptOperation,
  indexOperation,
  initOperation,
  renderOperation,
  validateOperation,
  verifyIntegrityOperation,
} from "./definitions/records.js";
import {
  conflictOperation,
  explainOperation,
  packetOperation,
  queryOperation,
  searchOperation,
  searchPacketOperation,
} from "./definitions/retrieval.js";
import { mcpOperation, serveOperation } from "./definitions/server.js";
import {
  sessionCloseOperation,
  sessionNoteOperation,
  sessionPruneOperation,
  sessionStartOperation,
  sessionTouchOperation,
} from "./definitions/sessions.js";
import { pathString } from "./shared.js";
import type { AnyLedgerOperation } from "./types.js";

export const ledgerOperationsContractVersion = 1 as const;

/**
 * Every Ledger operation keyed by machine name, in help order. CLI parsing,
 * help text, MCP tools, the contract manifest, and the typed API client derive
 * from this table.
 */
export const ledgerOperationTable = {
  "init": initOperation,
  "adopt": adoptOperation,
  "new": newEntryOperation,
  "feedback": feedbackOperation,
  "backlog.new": backlogNewOperation,
  "decision.new": decisionNewOperation,
  "promote": promoteOperation,
  "update": updateOperation,
  "session.start": sessionStartOperation,
  "session.touch": sessionTouchOperation,
  "session.note": sessionNoteOperation,
  "session.close": sessionCloseOperation,
  "session.prune": sessionPruneOperation,
  "validate": validateOperation,
  "ready": readyOperation,
  "verify": verifyOperation,
  "index": indexOperation,
  "verify-integrity": verifyIntegrityOperation,
  "render": renderOperation,
  "serve": serveOperation,
  "coverage": coverageOperation,
  "ci": ciOperation,
  "doctor": doctorOperation,
  "metrics": metricsOperation,
  "stale": staleOperation,
  "cache.status": cacheStatusOperation,
  "cache.warm": cacheWarmOperation,
  "cache.clear": cacheClearOperation,
  "conflict": conflictOperation,
  "explain": explainOperation,
  "search": searchOperation,
  "search-packet": searchPacketOperation,
  "query": queryOperation,
  "packet": packetOperation,
  "mcp": mcpOperation,
  "unreleased": unreleasedOperation,
  "release": releaseOperation,
  "release.notes": releaseNotesOperation,
  "migrate.changelog": migrateChangelogOperation,
  "agents": agentsOperation,
  "skills.install": skillsInstallOperation,
  "hooks.install": hooksInstallOperation,
  "hook": hookOperation,
  "docs.audit": docsAuditOperation,
  "docs.check": docsCheckOperation,
  "docs.classify": docsClassifyOperation,
  "docs.impact": docsImpactOperation,
  "docs.reconcile": docsReconcileOperation,
  "docs.migrate": docsMigrateOperation,
} as const satisfies Readonly<Record<string, AnyLedgerOperation>>;

/** Machine names of every operation. */
export type LedgerOperationName = keyof typeof ledgerOperationTable;

/** Input type of an operation, as the registry declares it. */
export type LedgerOperationInput<K extends LedgerOperationName> =
  Parameters<(typeof ledgerOperationTable)[K]["run"]>[1];

/** Output type of an operation, as the registry declares it. */
export type LedgerOperationOutput<K extends LedgerOperationName> =
  Awaited<ReturnType<(typeof ledgerOperationTable)[K]["run"]>>["data"];

/** Every Ledger operation in help order. */
export const ledgerOperations: readonly AnyLedgerOperation[] = Object.values(ledgerOperationTable);

export function findOperation(name: string): AnyLedgerOperation | undefined {
  return ledgerOperations.find((operation) => operation.name === name);
}

export function findOperationByTool(tool: string): AnyLedgerOperation | undefined {
  return ledgerOperations.find((operation) => operation.mcp?.tool === tool);
}

export const mcpProjectRootShape = {
  projectRoot: pathString.optional().describe("Project directory containing .ledger/."),
};

/** Strict MCP input schema for an operation: the CLI-independent input plus projectRoot. */
export function mcpInputSchema(operation: AnyLedgerOperation): z.ZodObject<z.ZodRawShape> {
  const base = operation.mcp?.input ?? operation.input;
  return z.strictObject({ ...mcpProjectRootShape, ...base.shape });
}

export interface LedgerOperationContract {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly workspace: string;
  readonly mutates: boolean;
  readonly interactive: boolean;
  readonly cli: {
    readonly path: readonly string[];
    readonly aliases: readonly (readonly string[])[];
    readonly usage: string;
    readonly json: boolean;
    readonly positionals?: { readonly field: string; readonly min: number; readonly max?: number; readonly join?: boolean };
    readonly flags: Readonly<
      Record<string, { readonly type: string; readonly field: string; readonly choices?: readonly string[]; readonly preparedInto?: string }>
    >;
  };
  readonly input: unknown;
  readonly output: unknown;
  readonly mcp?: { readonly tool: string; readonly input: unknown; readonly confirms?: true };
}

export interface LedgerOperationsContract {
  readonly contractVersion: typeof ledgerOperationsContractVersion;
  readonly operations: readonly LedgerOperationContract[];
}

/** Deterministic description of every operation for golden tests and generated docs. */
export function buildOperationsContract(
  registry: readonly AnyLedgerOperation[] = ledgerOperations,
): LedgerOperationsContract {
  return {
    contractVersion: ledgerOperationsContractVersion,
    operations: registry.map((operation) => ({
      name: operation.name,
      title: operation.title,
      description: operation.description,
      workspace: operation.workspace,
      mutates: operation.mutates,
      interactive: Boolean(operation.interactive),
      cli: {
        path: operation.cli.path,
        aliases: operation.cli.aliases ?? [],
        usage: operation.cli.usage,
        json: operation.cli.json,
        positionals: operation.cli.positionals,
        flags: Object.fromEntries(
          Object.entries(operation.cli.flags).map(([flag, spec]) => [
            flag,
            {
              type: spec.type,
              field: spec.field ?? flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
              ...(spec.choices ? { choices: spec.choices } : {}),
              ...(spec.preparedInto ? { preparedInto: spec.preparedInto } : {}),
            },
          ]),
        ),
      },
      input: z.toJSONSchema(operation.input),
      output: z.toJSONSchema(operation.output),
      ...(operation.mcp
        ? {
            mcp: {
              tool: operation.mcp.tool,
              input: z.toJSONSchema(mcpInputSchema(operation)),
              ...(operation.mcp.confirm ? { confirms: true as const } : {}),
            },
          }
        : {}),
    })),
  };
}
