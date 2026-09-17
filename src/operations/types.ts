import type { z } from "zod";
import type { LedgerWorkspace } from "../types.js";

/**
 * Flag value types understood by the CLI parser. `string[]` flags may repeat.
 */
export type LedgerFlagType = "boolean" | "string" | "number" | "string[]";

export interface LedgerFlagSpec {
  readonly type: LedgerFlagType;
  /** Input field the flag maps to. Defaults to the camelCase form of the flag name. */
  readonly field?: string;
  readonly description: string;
  /** Allowed values for string flags. */
  readonly choices?: readonly string[];
  /** Human label used in choice errors, for example "agent role". */
  readonly choicesLabel?: string;
  /** The input field `cli.prepare` folds this flag's value into, when the flag has no field of its own. */
  readonly preparedInto?: string;
}

export interface LedgerPositionalSpec {
  /** Input field the positionals map to. */
  readonly field: string;
  /** Minimum number of positionals. */
  readonly min: number;
  /** Maximum number of positionals. Omit for unbounded. */
  readonly max?: number;
  /** Join all positionals into one space-separated string. */
  readonly join?: boolean;
}

export interface LedgerOperationCli {
  /** Command path, for example ["docs", "impact"]. */
  readonly path: readonly string[];
  /** Additional command paths that resolve to this operation. */
  readonly aliases?: readonly (readonly string[])[];
  /** Usage line printed in help, without the leading "Usage:". */
  readonly usage: string;
  readonly positionals?: LedgerPositionalSpec;
  readonly flags: Readonly<Record<string, LedgerFlagSpec>>;
  /** Whether the command accepts --json and prints a machine envelope. */
  readonly json: boolean;
  /** Help title, for example "Ledger docs audit/check". Defaults to the path. */
  readonly helpTitle?: string;
  /** Help paragraph printed below the usage line. */
  readonly help: string;
  /** Additional help topics that resolve to this operation. */
  readonly helpTopics?: readonly string[];
  /** Default input values applied before flags. */
  readonly defaults?: Readonly<Record<string, unknown>>;
  /** Final adjustment of the raw CLI input before schema validation. */
  readonly prepare?: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Omit from the general help listing. */
  readonly hidden?: boolean;
}

export interface LedgerOperationMcp<I, O> {
  readonly tool: string;
  readonly title: string;
  /** Compact signal object placed before the detailed payload fields. */
  readonly summary: (data: O) => Readonly<Record<string, unknown>>;
  /** Input schema override when the MCP surface differs from the CLI surface. */
  readonly input?: z.ZodObject<z.ZodRawShape>;
  /**
   * The sentence the MCP server asks the user to confirm before the tool runs,
   * for example `Create a change entry titled "X".` Every MCP tool that writes
   * source records declares it; tools without it never ask.
   */
  readonly confirm?: (input: I) => string;
  /**
   * Checks a confirmed tool runs before asking, such as a dry run of the
   * write, so the user is never asked to approve a call that would fail.
   * It throws the error the operation would.
   */
  readonly precheck?: (context: LedgerOperationContext, input: I) => Promise<void>;
}

export interface LedgerOperationContext {
  readonly cwd: string;
  readonly version: string;
  /** Resolved workspace when the operation declares one. */
  readonly workspace?: LedgerWorkspace;
  /** Line logger for long-running operations. Defaults to console.log. */
  readonly log: (line: string) => void;
  /** Error logger for long-running operations. Defaults to console.error. */
  readonly logError: (line: string) => void;
}

export interface LedgerOperationOutcome<O> {
  readonly data: O;
  /** Process exit code. Defaults to 0. */
  readonly exitCode?: number;
}

export type LedgerWorkspaceRequirement = "required" | "optional" | "none";

export interface LedgerOperation<I extends Record<string, unknown>, O> {
  /** Machine command name, for example "docs.impact". */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly workspace: LedgerWorkspaceRequirement;
  /** Whether the operation writes Ledger source records or generated files. */
  readonly mutates: boolean;
  /** Long-running operations own their console output and return when they stop. */
  readonly interactive?: boolean;
  /** Validated input contract. Must parse to I. */
  readonly input: z.ZodObject<z.ZodRawShape>;
  /** Output contract describing O. Loose objects keep nested domain shapes in TypeScript. */
  readonly output: z.ZodObject<z.ZodRawShape, z.core.$loose>;
  readonly cli: LedgerOperationCli;
  readonly mcp?: LedgerOperationMcp<I, O>;
  readonly run: (context: LedgerOperationContext, input: I) => Promise<LedgerOperationOutcome<O>>;
  /** Human-readable rendering of the outcome. */
  readonly format: (data: O, input: I) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyLedgerOperation = LedgerOperation<any, any>;

export function defineOperation<I extends Record<string, unknown>, O>(
  operation: LedgerOperation<I, O>,
): LedgerOperation<I, O> {
  return operation;
}
