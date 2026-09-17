import { z } from "zod";
import { formatLedgerMetricsResult, runLedgerMetricsCommand } from "../../commands/index.js";
import { formatDoctorResult, repairDerivedState, runDoctor, type LedgerDoctorResult } from "../../doctor.js";
import type { LedgerPerformanceResult } from "../../performance.js";
import {
  detectStaleKnowledge,
  formatStaleReport,
  writeStaleReport,
  type LedgerStaleReport,
} from "../../stale.js";
import { readValidationBaseline, validateDocuments } from "../../validate.js";
import { loadDocuments, looseRecord } from "../shared.js";
import { defineOperation } from "../types.js";

export const doctorOperation = defineOperation<{ noBaseline?: boolean; fix?: boolean }, LedgerDoctorResult>({
  name: "doctor",
  title: "Check Ledger health",
  description:
    "Check workspace health, Git availability, validation, docs, indexes, render output, hooks, and stale signals, and with fix repair derived state.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
    fix: z
      .boolean()
      .optional()
      .describe("Repair derived state first: interrupted writes, stale engine records, the cache, indexes, and a missing reader."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    checks: z.array(looseRecord({ name: z.string(), level: z.string(), message: z.string() })),
    fixes: z.array(looseRecord({ check: z.string(), ok: z.boolean(), message: z.string() })).optional(),
  }),
  cli: {
    path: ["doctor"],
    usage: "ledger doctor [--no-baseline] [--fix] [--json]",
    flags: {
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
      fix: { type: "boolean", description: "Repair derived state, then check again." },
    },
    json: true,
    help: `Checks workspace health, Git availability, validation, docs references, index
freshness, render output, performance budgets, installed hooks, and
stale-knowledge signals. The hooks check warns when a host hook file runs a
different command than agents.command, or when that command cannot print this
Ledger's version, because hosts skip failing hooks without a message.

--fix first repairs derived and runtime state: it recovers interrupted writes
and stale locks, removes a stale engine record, rebuilds a stale catalog
cache, regenerates missing or stale indexes, and renders a missing reader. It
never edits records, so it is safe to rerun, and then it runs the checks
again.`,
  },
  mcp: {
    tool: "ledger_doctor",
    title: "Check Ledger health",
    summary: (data) => ({
      ok: data.ok,
      checks: data.checks.length,
      failing: data.checks.filter((check) => check.level === "fail").map((check) => check.name),
      warning: data.checks.filter((check) => check.level === "warn").map((check) => check.name),
      ...(data.fixes ? { fixed: data.fixes.filter((fix) => fix.ok).map((fix) => fix.check) } : {}),
    }),
  },
  async run(context, input) {
    const check = async () => {
      const { workspace, documents } = await loadDocuments(context);
      const validation = validateDocuments(workspace, documents, {
        baseline: input.noBaseline ? undefined : await readValidationBaseline(workspace),
      });
      return { workspace, documents, validation, result: await runDoctor(workspace, documents, validation, { version: context.version }) };
    };
    const first = await check();
    if (!input.fix) return { data: first.result, exitCode: first.result.ok ? 0 : 1 };
    const fixes = await repairDerivedState(first.workspace, first.documents, first.validation, first.result.checks);
    const after = fixes.length > 0 ? (await check()).result : first.result;
    return { data: { ...after, fixes }, exitCode: after.ok ? 0 : 1 };
  },
  format(data) {
    return formatDoctorResult(data);
  },
});

export const metricsOperation = defineOperation<Record<string, never>, LedgerPerformanceResult>({
  name: "metrics",
  title: "Measure Ledger performance",
  description: "Measure read, validate, index, render-model, and search latency against budgets.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({}),
  output: looseRecord({
    ok: z.boolean(),
    totalMs: z.number(),
    maxTotalMs: z.number(),
    documents: z.number(),
    steps: z.array(looseRecord({ name: z.string(), ms: z.number().optional() })),
  }),
  cli: {
    path: ["metrics"],
    usage: "ledger metrics [--json]",
    flags: {},
    json: true,
    help: `Measures read, validate, index, render-model, and search latency against
configured performance budgets.`,
  },
  mcp: {
    tool: "ledger_metrics",
    title: "Measure Ledger performance",
    summary: (data) => ({ ok: data.ok, totalMs: data.totalMs, maxTotalMs: data.maxTotalMs, documents: data.documents }),
  },
  async run(context) {
    const { workspace } = await loadDocuments(context);
    const result = await runLedgerMetricsCommand(workspace);
    return { data: result.performance, exitCode: result.performance.ok ? 0 : 1 };
  },
  format(data) {
    return formatLedgerMetricsResult({ performance: data });
  },
});

export interface StaleInput extends Record<string, unknown> {
  readonly currentOnly?: boolean;
  readonly noBaseline?: boolean;
  readonly check?: boolean;
  readonly writeReport?: boolean;
}

export interface StaleOutput extends LedgerStaleReport {
  readonly reportPath?: string;
}

export const staleOperation = defineOperation<StaleInput, StaleOutput>({
  name: "stale",
  title: "Find stale knowledge",
  description: "Find stale knowledge signals such as missing references, stale symbols, and release verification gaps.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    currentOnly: z.boolean().optional().describe("Skip historical records."),
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
    check: z.boolean().optional().describe("Exit non-zero when stale signals exist."),
    writeReport: z.boolean().optional().describe("Write .ledger/reports/stale-knowledge.md."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    issues: z.array(looseRecord({ message: z.string() })),
    reportPath: z.string().optional(),
  }),
  cli: {
    path: ["stale"],
    usage: "ledger stale [--current-only] [--no-baseline] [--check] [--write-report] [--json]",
    flags: {
      "current-only": { type: "boolean", description: "Skip historical records." },
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
      check: { type: "boolean", description: "Fail when stale signals exist." },
      "write-report": { type: "boolean", description: "Write the stale knowledge report." },
    },
    json: true,
    help: `Finds stale knowledge signals: missing references, missing relationship
targets, superseded relationships, symbols and Changed Files anchors that no
longer exist in the referenced files, invariants that cite them, release
verification gaps, expired sessions, and stale or failed verification
evidence. --write-report writes .ledger/reports/stale-knowledge.md.`,
  },
  mcp: {
    tool: "ledger_stale",
    title: "Find stale knowledge",
    summary: (data) => ({ ok: data.ok, issues: data.issues.length, reportPath: data.reportPath }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const validation = validateDocuments(workspace, documents, {
      currentOnly: input.currentOnly,
      baseline: input.noBaseline ? undefined : await readValidationBaseline(workspace),
    });
    const report = await detectStaleKnowledge(workspace, documents, validation);
    const reportPath = input.writeReport ? await writeStaleReport(workspace, report) : undefined;
    return {
      data: { ...report, reportPath },
      exitCode: input.check && !report.ok ? 1 : 0,
    };
  },
  format(data) {
    const { reportPath, ...report } = data;
    const rendered = formatStaleReport(report).trimEnd();
    return reportPath ? `${rendered}\nWrote ${reportPath}` : rendered;
  },
});
