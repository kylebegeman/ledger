import {
  formatLedgerPerformance,
  measureLedgerPerformance,
  type LedgerPerformanceResult,
} from "../performance.js";
import type { LedgerWorkspace } from "../types.js";

export interface LedgerMetricsCommandResult {
  readonly performance: LedgerPerformanceResult;
}

export async function runLedgerMetricsCommand(
  workspace: LedgerWorkspace,
): Promise<LedgerMetricsCommandResult> {
  return {
    performance: await measureLedgerPerformance(workspace),
  };
}

export function formatLedgerMetricsResult(result: LedgerMetricsCommandResult): string {
  return formatLedgerPerformance(result.performance);
}
