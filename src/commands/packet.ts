import { readLedgerDocuments } from "../documents.js";
import {
  buildAgentPacket,
  formatAgentPacket,
  writeAgentPacketReport,
  type LedgerAgentPacket,
  type LedgerAgentPacketOptions,
} from "../packet.js";
import type { LedgerWorkspace } from "../types.js";

export interface LedgerPacketCommandOptions extends LedgerAgentPacketOptions {
  readonly writeReport?: boolean;
}

export interface LedgerPacketCommandResult {
  readonly packet: LedgerAgentPacket;
  readonly reportPath?: string;
}

export async function runLedgerPacketCommand(
  workspace: LedgerWorkspace,
  target: string,
  options: LedgerPacketCommandOptions = {},
): Promise<LedgerPacketCommandResult> {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) {
    throw new Error("Packet target must not be empty");
  }
  const documents = await readLedgerDocuments(workspace);
  const packet = buildAgentPacket(documents, normalizedTarget, {
    budgetTokens: options.budgetTokens,
    maxEntries: options.maxEntries,
  });
  const reportPath = options.writeReport
    ? await writeAgentPacketReport(workspace, packet)
    : undefined;
  return { packet, reportPath };
}

export function formatLedgerPacketResult(result: LedgerPacketCommandResult): string {
  const rendered = formatAgentPacket(result.packet);
  return result.reportPath ? `${rendered}Wrote ${result.reportPath}` : rendered.trimEnd();
}
