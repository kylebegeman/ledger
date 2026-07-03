import { performance } from "node:perf_hooks";
import { readLedgerDocuments } from "./documents.js";
import { buildIndexes } from "./indexer.js";
import { buildStaticReaderModel } from "./render.js";
import { searchLedgerIndex } from "./search.js";
import type { LedgerValidationResult, LedgerWorkspace } from "./types.js";
import { validateDocuments } from "./validate.js";

export type LedgerPerformanceStepName = "read" | "validate" | "index" | "render-model" | "search";

export interface LedgerPerformanceStep {
  readonly name: LedgerPerformanceStepName;
  readonly durationMs: number;
  readonly maxMs: number;
  readonly ok: boolean;
}

export interface LedgerPerformanceResult {
  readonly ok: boolean;
  readonly totalMs: number;
  readonly maxTotalMs: number;
  readonly steps: readonly LedgerPerformanceStep[];
  readonly validation: LedgerValidationResult;
  readonly documents: number;
}

export async function measureLedgerPerformance(
  workspace: LedgerWorkspace,
): Promise<LedgerPerformanceResult> {
  const budgets = workspace.config.performance.budgets;
  const startedAt = performance.now();
  const read = await measure("read", budgets.maxReadMs, async () => readLedgerDocuments(workspace));
  const documents = read.value;
  const validate = await measure("validate", budgets.maxValidateMs, async () =>
    validateDocuments(workspace, documents),
  );
  const validation = validate.value;
  const index = await measure("index", budgets.maxIndexMs, async () => {
    buildIndexes(workspace, documents);
  });
  const renderModel = await measure("render-model", budgets.maxRenderModelMs, async () => {
    return buildStaticReaderModel(workspace, documents, { validation });
  });
  const search = await measure("search", budgets.maxSearchMs, async () => {
    searchLedgerIndex(renderModel.value.searchIndex, workspace.config.project, { limit: 5 });
  });
  const totalMs = roundMs(performance.now() - startedAt);
  const steps = [read.step, validate.step, index.step, renderModel.step, search.step];

  return {
    ok: steps.every((step) => step.ok) && totalMs <= budgets.maxTotalMs,
    totalMs,
    maxTotalMs: budgets.maxTotalMs,
    steps,
    validation,
    documents: documents.length,
  };
}

export function formatLedgerPerformance(result: LedgerPerformanceResult): string {
  const lines = [
    `Ledger metrics: ${result.ok ? "passed" : "warned"} (${result.totalMs}/${result.maxTotalMs}ms total, ${result.documents} document(s)).`,
  ];
  for (const step of result.steps) {
    lines.push(`- ${step.ok ? "pass" : "warn"}: ${step.name} (${step.durationMs}/${step.maxMs}ms)`);
  }
  return lines.join("\n");
}

async function measure<T>(
  name: LedgerPerformanceStepName,
  maxMs: number,
  action: () => T | Promise<T>,
): Promise<{ readonly step: LedgerPerformanceStep; readonly value: T }> {
  const startedAt = performance.now();
  const value = await action();
  const durationMs = roundMs(performance.now() - startedAt);
  return {
    step: {
      name,
      durationMs,
      maxMs,
      ok: durationMs <= maxMs,
    },
    value,
  };
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
