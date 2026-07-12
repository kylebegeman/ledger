import { readLedgerDocuments } from "../documents.js";
import {
  buildSearchAgentPacket,
  formatAgentPacket,
  writeAgentPacketReport,
  type LedgerAgentPacket,
  type LedgerSearchAgentPacketOptions,
} from "../packet.js";
import { buildStaticReaderModel } from "../render.js";
import { LedgerError } from "../machine.js";
import type { LedgerWorkspace } from "../types.js";

export interface LedgerSearchPacketCommandOptions extends LedgerSearchAgentPacketOptions {
  readonly writeReport?: boolean;
}

export interface LedgerSearchPacketCommandResult {
  readonly packet: LedgerAgentPacket;
  readonly reportPath?: string;
}

export async function runLedgerSearchPacketCommand(
  workspace: LedgerWorkspace,
  query: string,
  options: LedgerSearchPacketCommandOptions = {},
): Promise<LedgerSearchPacketCommandResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new LedgerError("invalid-argument", "Search query must not be empty");
  }
  const documents = await readLedgerDocuments(workspace);
  const model = buildStaticReaderModel(workspace, documents);
  const packet = buildSearchAgentPacket(model, normalizedQuery, {
    budgetTokens: options.budgetTokens,
    limit: options.limit,
    maxEntries: options.maxEntries,
  });
  const reportPath = options.writeReport
    ? await writeAgentPacketReport(workspace, packet)
    : undefined;
  return { packet, reportPath };
}

export function formatLedgerSearchPacketResult(result: LedgerSearchPacketCommandResult): string {
  const rendered = formatAgentPacket(result.packet);
  return result.reportPath ? `${rendered}Wrote ${result.reportPath}` : rendered.trimEnd();
}
