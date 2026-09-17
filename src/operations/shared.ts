import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { readLedgerDocuments } from "../documents.js";
import type { GetChangedFilesOptions } from "../git.js";
import { LedgerError } from "../machine.js";
import { maxSectionBodyChars, parseSectionBodies, type LedgerSectionBodies } from "../sections.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../types.js";
import type { LedgerFlagSpec, LedgerOperationContext } from "./types.js";

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

/** Longest quoted value a confirmation message shows before it is cut. */
export const confirmationQuoteLimit = 200;

/** Quote user text for a confirmation message, on one line and cut to a readable length. */
export function quoteForConfirmation(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return `"${line.length > confirmationQuoteLimit ? `${line.slice(0, confirmationQuoteLimit - 1)}…` : line}"`;
}

/** Section bodies keyed by heading, as record-writing operations accept them. */
export const sectionsInput = z
  .record(z.string().min(1).max(200), z.string().max(maxSectionBodyChars))
  .optional()
  .describe(
    'Section bodies keyed by heading, for example {"Summary": "...", "Why": "..."}. Each replaces that section of the template. Bodies may use ### subsections but not # or ## headings.',
  );

/** A change entry's docs impact declaration. */
export const docsImpactInput = z
  .strictObject({
    status: z.enum(["updated", "not-needed", "none"]).describe("updated, not-needed, or none."),
    reason: z.string().min(1).max(2000).describe("Reviewed prose explaining the status."),
    docs: z.array(pathString).max(200).optional().describe("Durable docs the change updated."),
  })
  .optional()
  .describe("Docs impact declaration for a change entry.");

/** Longest file `--sections-file` reads, in bytes. */
const maxSectionsFileBytes = 1_000_000;

/** CLI flags that fill `sections`; `prepareRecordFlags` folds them into the input. */
export const sectionFlags = {
  section: {
    type: "string[]",
    field: "sectionPairs",
    preparedInto: "sections",
    description: "A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --.",
  },
  "sections-file": {
    type: "string",
    field: "sectionsFile",
    preparedInto: "sections",
    description: "A Markdown file whose ## sections become section bodies; --section values win.",
  },
} as const satisfies Readonly<Record<string, LedgerFlagSpec>>;

/** CLI flags that fill `docsImpact`. */
export const docsImpactFlags = {
  "docs-impact": {
    type: "string",
    field: "docsImpactStatus",
    preparedInto: "docsImpact",
    description: "Docs impact status.",
    choices: ["updated", "not-needed", "none"],
    choicesLabel: "docs impact status",
  },
  "docs-impact-reason": {
    type: "string",
    field: "docsImpactReason",
    preparedInto: "docsImpact",
    description: "Reviewed docs impact reason.",
  },
  "docs-impact-doc": {
    type: "string[]",
    field: "docsImpactDocs",
    preparedInto: "docsImpact",
    description: "Doc the change updated (repeatable).",
  },
} as const satisfies Readonly<Record<string, LedgerFlagSpec>>;

/**
 * Fold the section and docs impact flags into `sections` and `docsImpact`, the
 * fields the operation's input schema declares.
 */
export function prepareRecordFlags(input: Record<string, unknown>): Record<string, unknown> {
  const { sectionPairs, sectionsFile, docsImpactStatus, docsImpactReason, docsImpactDocs, ...rest } = input;
  const prepared: Record<string, unknown> = { ...rest };
  if (sectionPairs !== undefined || sectionsFile !== undefined) {
    const sections: Record<string, string> = {};
    if (typeof sectionsFile === "string") Object.assign(sections, readSectionsFile(sectionsFile));
    for (const pair of (sectionPairs as readonly string[] | undefined) ?? []) {
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        throw new LedgerError("invalid-argument", `--section needs Heading=text, got: ${pair}`);
      }
      sections[pair.slice(0, separator).trim()] = pair.slice(separator + 1);
    }
    prepared.sections = { ...((rest.sections as LedgerSectionBodies | undefined) ?? {}), ...sections };
  }
  if (docsImpactStatus !== undefined || docsImpactReason !== undefined || docsImpactDocs !== undefined) {
    if (docsImpactStatus === undefined || docsImpactReason === undefined) {
      throw new LedgerError("invalid-argument", "--docs-impact and --docs-impact-reason go together");
    }
    prepared.docsImpact = {
      status: docsImpactStatus,
      reason: docsImpactReason,
      ...(docsImpactDocs === undefined ? {} : { docs: docsImpactDocs }),
    };
  }
  return prepared;
}

function readSectionsFile(file: string): Record<string, string> {
  let text: string;
  try {
    if (statSync(file).size > maxSectionsFileBytes) {
      throw new LedgerError("invalid-argument", `--sections-file ${file} is larger than ${maxSectionsFileBytes} bytes`);
    }
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new LedgerError("invalid-argument", `Cannot read --sections-file ${file}: ${reason}`);
  }
  return parseSectionBodies(text, file);
}

/** ` with the A, B, and C sections`, or nothing, for confirmation messages. */
export function describeSections(sections: LedgerSectionBodies | undefined): string {
  const titles = Object.keys(sections ?? {});
  if (titles.length === 0) return "";
  const list =
    titles.length === 1
      ? titles[0]
      : titles.length === 2
        ? `${titles[0]} and ${titles[1]}`
        : `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
  return ` with the ${list} ${titles.length === 1 ? "section" : "sections"}`;
}
