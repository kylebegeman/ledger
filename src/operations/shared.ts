import { z } from "zod";
import { readLedgerDocuments } from "../documents.js";
import type { GetChangedFilesOptions } from "../git.js";
import { LedgerError } from "../machine.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../types.js";
import type { LedgerOperationContext } from "./types.js";

export const shortString = z.string().min(1).max(500);
export const pathString = z.string().min(1).max(4096);
export const positiveInt = z.number().int().positive();

/** Loose object schema for domain results whose nested shape lives in TypeScript types. */
export function looseRecord(shape: z.ZodRawShape = {}): z.ZodObject<z.ZodRawShape, z.core.$loose> {
  return z.looseObject(shape);
}

export const issueSchema = looseRecord({
  level: z.enum(["error", "warning"]),
  message: z.string(),
});

export const validationResultShape = {
  issues: z.array(issueSchema),
  errors: z.array(issueSchema),
  warnings: z.array(issueSchema),
  suppressed: z.array(issueSchema),
};

export const changeRangeShape = {
  staged: z.boolean().optional().describe("Inspect the staged Git diff."),
  base: shortString.optional().describe("Base revision for a merge-base range."),
  head: shortString.optional().describe("Head revision for a merge-base range."),
};

export interface ChangeRangeInput {
  readonly staged?: boolean;
  readonly base?: string;
  readonly head?: string;
}

export function resolveChangeOptions(input: ChangeRangeInput): GetChangedFilesOptions {
  const { base, head, staged } = input;
  if (Boolean(base) !== Boolean(head)) {
    throw new LedgerError("invalid-argument", "--base and --head must be provided together");
  }
  if (staged && base) {
    throw new LedgerError("invalid-argument", "--staged cannot be combined with --base and --head");
  }
  return { staged, base, head };
}

export function requireWorkspace(context: LedgerOperationContext): LedgerWorkspace {
  if (!context.workspace) {
    throw new LedgerError("workspace-not-found", `Could not find .ledger/config.yaml from ${context.cwd}`, {
      startDir: context.cwd,
    });
  }
  return context.workspace;
}

export async function loadDocuments(
  context: LedgerOperationContext,
): Promise<{ readonly workspace: LedgerWorkspace; readonly documents: readonly ParsedLedgerDocument[] }> {
  const workspace = requireWorkspace(context);
  const documents = await readLedgerDocuments(workspace);
  return { workspace, documents };
}

export function validationLine(errors: number, warnings: number): string {
  return `Ledger validation: ${errors} error(s), ${warnings} warning(s).`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
