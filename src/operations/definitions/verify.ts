import { z } from "zod";
import { formatVerifyReport, runVerification, type LedgerVerifyReport } from "../../verify.js";
import { loadDocuments, looseRecord, positiveInt, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

export interface VerifyInput extends Record<string, unknown> {
  readonly targets?: readonly string[];
  readonly all?: boolean;
  readonly run?: boolean;
  readonly timeoutMs?: number;
}

export const verifyOperation = defineOperation<VerifyInput, LedgerVerifyReport>({
  name: "verify",
  title: "Run verification commands",
  description: "List the verification commands of change entries and, with --run, execute the allowlisted ones and record evidence.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    targets: z.array(shortString).optional().describe("Change entry ids or paths. Defaults to entries in the working-tree change set."),
    all: z.boolean().optional().describe("Select every change entry."),
    run: z.boolean().optional().describe("Execute allowlisted commands and write the evidence sidecar."),
    timeoutMs: positiveInt.max(3_600_000).optional().describe("Per-command timeout in milliseconds."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    ran: z.boolean(),
    evidencePath: z.string(),
    records: z.array(
      looseRecord({
        id: z.string(),
        path: z.string(),
        freshness: z.enum(["fresh", "stale", "failed", "none"]),
        ran: z.boolean(),
        commands: z.array(looseRecord({ bullet: z.string(), allowed: z.boolean() })),
      }),
    ),
  }),
  cli: {
    path: ["verify"],
    usage: "ledger verify [id-or-path...] [--all] [--run] [--timeout <ms>] [--json]",
    positionals: { field: "targets", min: 0 },
    flags: {
      all: { type: "boolean", description: "Select every change entry." },
      run: { type: "boolean", description: "Execute allowlisted commands and record evidence." },
      timeout: { type: "number", field: "timeoutMs", description: "Per-command timeout in milliseconds." },
    },
    json: true,
    help: `Reads the Verification section of change entries. Each bullet that starts
with a backticked command is parsed; an optional KEY=value prefix sets the
environment. Commands must match verification.allow (npm run, npm test, npx
vitest, ledger checks, and similar by default). When agents.command is set, a
command written with it matches the same ledger pattern, and a bare ledger
command runs through it. Prose, shell operators, and unlisted commands are
skipped, never failed. --run executes the allowed
commands from the project root, records command, exit status, duration, and
the HEAD commit in the evidence sidecar (verification.evidence), and exits 1
when a command fails. Without ids, --all, or changed entries, nothing is
selected. doctor, stale, packets, and the reader surface the evidence.`,
    prepare: (input) => {
      const targets = Array.isArray(input.targets) ? input.targets : [];
      return targets.length === 0 ? { ...input, targets: undefined } : input;
    },
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const report = await runVerification(workspace, documents, {
      targets: input.targets,
      all: input.all,
      run: Boolean(input.run),
      timeoutMs: input.timeoutMs,
    });
    return { data: report, exitCode: report.ok ? 0 : 1 };
  },
  format(data) {
    return formatVerifyReport(data);
  },
});
