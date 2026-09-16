import { z } from "zod";
import { formatLedgerMetricsResult, runLedgerMetricsCommand } from "../../commands/index.js";
import { formatDoctorResult, runDoctor, type LedgerDoctorResult } from "../../doctor.js";
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

export const doctorOperation = defineOperation<{ noBaseline?: boolean }, LedgerDoctorResult>({
  name: "doctor",
  title: "Check Ledger health",
  description: "Check workspace health, Git availability, validation, docs, indexes, render output, and stale signals.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({
    noBaseline: z.boolean().optional().describe("Ignore the configured validation baseline."),
  }),
  output: looseRecord({
    ok: z.boolean(),
    checks: z.array(looseRecord({ name: z.string(), level: z.string(), message: z.string() })),
  }),
  cli: {
    path: ["doctor"],
    usage: "ledger doctor [--no-baseline] [--json]",
    flags: {
      "no-baseline": { type: "boolean", description: "Ignore the configured validation baseline." },
    },
    json: true,
    help: `Checks workspace health, Git availability, validation, docs references, index
freshness, render output, performance budgets, and stale-knowledge signals.`,
  },
  mcp: {
    tool: "ledger_doctor",
    title: "Check Ledger health",
    summary: (data) => ({
      ok: data.ok,
      checks: data.checks.length,
      failing: data.checks.filter((check) => check.level === "fail").map((check) => check.name),
      warning: data.checks.filter((check) => check.level === "warn").map((check) => check.name),
    }),
  },
  async run(context, input) {
    const { workspace, documents } = await loadDocuments(context);
    const validation = validateDocuments(workspace, documents, {
      baseline: input.noBaseline ? undefined : await readValidationBaseline(workspace),
    });
    const result = await runDoctor(workspace, documents, validation);
    return { data: result, exitCode: result.ok ? 0 : 1 };
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

interface StaleInput extends Record<string, unknown> {
  readonly currentOnly?: boolean;
  readonly noBaseline?: boolean;
  readonly check?: boolean;
  readonly writeReport?: boolean;
}

interface StaleOutput extends LedgerStaleReport {
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
    writeReport: z.boolean().optional().describe("Write .ledger/reports/stale.md."),
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
    help: `Finds stale knowledge signals such as missing references, missing relationship
targets, superseded relationships, stale symbols, and release verification gaps.`,
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
