import { z } from "zod";
import { checkReadiness, formatReadinessReport, type LedgerReadinessReport } from "../../ready.js";
import type { LedgerDocumentKind } from "../../types.js";
import { loadDocuments, looseRecord, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

const documentKinds = ["change", "backlog", "decision", "release", "product-note", "feedback", "session"] as const;

export interface ReadyInput extends Record<string, unknown> {
  readonly targets?: readonly string[];
  readonly kind?: LedgerDocumentKind;
  readonly status?: string;
}

export const readyOperation = defineOperation<ReadyInput, LedgerReadinessReport>({
  name: "ready",
  title: "Check records are ready to land",
  description: "Check that draft records have no TODOs or template placeholders and carry verification, invariants, docs impact, and valid references.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    targets: z.array(shortString).optional().describe("Record ids or paths. Defaults to draft change entries."),
    kind: z.enum(documentKinds).optional().describe("Kind filter for the default selection."),
    status: shortString.optional().describe("Status filter for the default selection. Defaults to draft."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    checked: z.number(),
    ready: z.array(z.string()),
    notReady: z.array(z.string()),
    records: z.array(
      looseRecord({
        id: z.string(),
        path: z.string(),
        kind: z.string(),
        status: z.string(),
        ready: z.boolean(),
        issues: z.array(looseRecord({ code: z.string(), message: z.string(), line: z.number().optional() })),
      }),
    ),
  }),
  cli: {
    path: ["ready"],
    usage: "ledger ready [id-or-path...] [--kind <kind>] [--status <status>] [--json]",
    positionals: { field: "targets", min: 0 },
    flags: {
      kind: {
        type: "string",
        description: "Kind filter for the default selection.",
        choices: [...documentKinds],
        choicesLabel: "record kind",
      },
      status: { type: "string", description: "Status filter for the default selection." },
    },
    json: true,
    help: `Distinguishes a structurally valid draft from a record that is ready to land.
By default it checks change entries with status draft; pass ids or paths to
check specific records, or --kind and --status to widen the selection. A record
is ready when validation is clean for it, no line carries a TODO marker or a
template placeholder, every required section has a body, change entries list
Verification and Invariants bullets, and docs impact is reviewed. Exits 1 when
any checked record is not ready.`,
    prepare: (input) => {
      const targets = Array.isArray(input.targets) ? input.targets : [];
      return targets.length === 0 ? { ...input, targets: undefined } : input;
    },
  },
  mcp: {
    tool: "ledger_ready",
    title: "Check records are ready to land",
    summary: (data) => ({ ok: data.ok, checked: data.checked, notReady: data.notReady }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const report = await checkReadiness(workspace, documents, {
      targets: input.targets,
      kind: input.kind,
      status: input.status,
    });
    return { data: report, exitCode: report.ok ? 0 : 1 };
  },
  format(data) {
    return formatReadinessReport(data);
  },
});
