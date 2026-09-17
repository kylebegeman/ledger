import { checkCoverage } from "./coverage.js";
import { buildDocsImpact } from "./docsImpact.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { getChangedFileDetails, type GetChangedFilesOptions, type GitChangeStatus } from "./git.js";
import { estimateTokens } from "./packet.js";
import { extractBullets, getSectionBody } from "./query.js";
import { checkReadiness } from "./ready.js";
import { relatedRecords, retrieveByPath, supersededByIndex, type LedgerRelationshipKind } from "./retrieval.js";
import { sessionDraftHints, type SessionDraftHint } from "./sessions.js";
import type { LedgerCoverageMode, LedgerWorkspace, ParsedLedgerDocument } from "./types.js";
import { evidenceFreshness, readEvidence, type LedgerVerificationFreshness } from "./verify.js";

/** Token budget `ledger context` fits its Markdown into unless told otherwise. */
export const defaultContextBudgetTokens = 2_400;
/** Records shown per changed file, newest first; older ones are only counted. */
const recordsPerFile = 5;

export interface LedgerChangeContextRecordRef {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
}

export interface LedgerChangeContextNote {
  readonly record: string;
  readonly text: string;
}

export interface LedgerChangeContextFile {
  readonly path: string;
  readonly change: GitChangeStatus;
  readonly coverage: "ignored" | "not-required" | "covered" | "historical" | "missing";
  /** Change entries in this change set that list the file. */
  readonly receipts: readonly string[];
  /** Whether the file's docs impact is satisfied; absent for files docs impact does not judge. */
  readonly docsImpact?: "satisfied" | "missing";
  /** Records that mention the file, newest first, capped per file. */
  readonly records: readonly LedgerChangeContextRecordRef[];
  /** Records beyond the cap. */
  readonly moreRecords: number;
  readonly invariants: readonly LedgerChangeContextNote[];
  readonly conflictRules: readonly LedgerChangeContextNote[];
  /** Set when the token budget left this file's records, invariants, and rules out. */
  readonly detailsOmitted?: true;
}

export interface LedgerChangeContextReceipt extends LedgerChangeContextRecordRef {
  readonly path: string;
  readonly ready: boolean;
  readonly issues: readonly string[];
  readonly verification: readonly string[];
  readonly verificationStatus: LedgerVerificationFreshness;
}

export interface LedgerChangeContextRelated extends LedgerChangeContextRecordRef {
  readonly via: readonly LedgerRelationshipKind[];
  readonly from: readonly string[];
}

export interface LedgerChangeContext {
  readonly range: string;
  readonly files: readonly LedgerChangeContextFile[];
  readonly receipts: readonly LedgerChangeContextReceipt[];
  readonly coverage: {
    readonly mode: LedgerCoverageMode;
    readonly required: number;
    readonly covered: number;
    readonly missing: readonly string[];
    readonly historical: readonly string[];
  };
  readonly docsImpact: { readonly missing: readonly string[] };
  readonly related: readonly LedgerChangeContextRelated[];
  /** Active hooked sessions that will draft a receipt for missing files. */
  readonly sessions: readonly SessionDraftHint[];
  readonly estimatedTokens: number;
  readonly budgetTokens: number;
  readonly truncated: boolean;
}

export interface BuildChangeContextOptions extends GetChangedFilesOptions {
  readonly budgetTokens?: number;
}

/**
 * Everything a reviewer or agent needs about one change set: each changed
 * file with its coverage, docs impact, history, invariants, and conflict
 * rules; the receipts the change carries and whether they are ready; the
 * decisions and backlog items they link; and the verification to run.
 */
export async function buildChangeContext(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: BuildChangeContextOptions = {},
): Promise<LedgerChangeContext> {
  const { budgetTokens = defaultContextBudgetTokens, ...range } = options;
  const [details, coverage, evidence] = await Promise.all([
    getChangedFileDetails(workspace.projectRoot, range),
    checkCoverage(workspace, documents, range),
    readEvidence(workspace),
  ]);
  const docsImpact = buildDocsImpact(workspace, documents, coverage.changedFiles);
  const docsImpactByPath = new Map(docsImpact.files.map((file) => [file.path, file.satisfied]));
  const coverageByPath = new Map(coverage.files.map((file) => [file.path, file]));
  const receiptIds = new Set(coverage.currentEntries);

  const files: LedgerChangeContextFile[] = details.map((detail) => {
    const filePath = normalizePath(detail.path);
    const covered = coverageByPath.get(filePath);
    const retrieved = retrieveByPath(documents, filePath);
    // Receipts that name the file come before ones that reach it through a pattern; sessions are notes, not memory.
    const records = retrieved.records
      .filter((record) => record.kind !== "session")
      .sort(
        (left, right) =>
          matchRank(left.matches) - matchRank(right.matches) ||
          (right.updated ?? right.date).localeCompare(left.updated ?? left.date) ||
          right.id.localeCompare(left.id),
      );
    const shown = records.slice(0, recordsPerFile);
    const satisfied = docsImpactByPath.get(filePath);
    return {
      path: filePath,
      change: detail.status,
      coverage: covered?.status ?? "not-required",
      receipts: covered?.currentEntries ?? [],
      ...(satisfied === undefined ? {} : { docsImpact: satisfied ? ("satisfied" as const) : ("missing" as const) }),
      records: shown.map((record) => ({ id: record.id, kind: record.kind, title: record.title, status: record.status })),
      moreRecords: records.length - shown.length,
      invariants: uniqueNotes(shown.flatMap((record) => record.invariants.map((text) => ({ record: record.id, text })))),
      conflictRules: uniqueNotes(
        shown.flatMap((record) => record.conflictRules.map((text) => ({ record: record.id, text }))),
      ),
    };
  });

  const readiness = receiptIds.size > 0
    ? await checkReadiness(workspace, documents, { targets: [...receiptIds] })
    : undefined;
  const readinessById = new Map((readiness?.records ?? []).map((record) => [record.id, record]));
  const catalog = documents.map((document) => ({ parsed: document, normalized: normalizeDocument(document) }));
  const receiptDocs = catalog.filter(({ normalized }) => receiptIds.has(normalized.id));
  const receipts: LedgerChangeContextReceipt[] = receiptDocs.map(({ parsed, normalized }) => {
    const report = readinessById.get(normalized.id);
    return {
      id: normalized.id,
      kind: normalized.kind,
      title: normalized.title,
      status: normalized.status,
      path: normalized.path,
      ready: report?.ready ?? false,
      issues: (report?.issues ?? []).map((issue) => issue.message),
      verification: extractBullets(getSectionBody(parsed, "Verification")),
      verificationStatus: evidenceFreshness(evidence.entries[normalized.id], workspace.config.verification.maxAgeDays),
    };
  });

  const normalizedCatalog = catalog.map(({ normalized }) => normalized);
  const { related } = relatedRecords(
    receiptDocs.map(({ normalized }) => normalized),
    normalizedCatalog,
    supersededByIndex(normalizedCatalog),
  );

  const draft: LedgerChangeContext = {
    range: describeRange(range),
    files,
    receipts,
    coverage: {
      mode: coverage.mode,
      required: coverage.requiredFiles.length,
      covered: coverage.coveredFiles.length,
      missing: coverage.missingFiles,
      historical: coverage.historicalFiles,
    },
    docsImpact: { missing: docsImpact.missingDocsImpact },
    related: related.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      status: record.status,
      via: record.via,
      from: record.from,
    })),
    sessions: sessionDraftHints(workspace, documents, coverage.missingFiles),
    estimatedTokens: 0,
    budgetTokens,
    truncated: false,
  };
  return fitToBudget(draft);
}

/** Drop per-file details from the last file backward until the Markdown fits the budget. */
function fitToBudget(context: LedgerChangeContext): LedgerChangeContext {
  let current = { ...context, estimatedTokens: estimateTokens(formatChangeContext(context)) };
  const files = [...current.files];
  for (let index = files.length - 1; index >= 0 && current.estimatedTokens > current.budgetTokens; index -= 1) {
    const file = files[index]!;
    if (file.records.length === 0 && file.invariants.length === 0 && file.conflictRules.length === 0) continue;
    files[index] = {
      ...file,
      records: [],
      moreRecords: file.moreRecords + file.records.length,
      invariants: [],
      conflictRules: [],
      detailsOmitted: true,
    };
    const next = { ...current, files: [...files], truncated: true };
    current = { ...next, estimatedTokens: estimateTokens(formatChangeContext(next)) };
  }
  return current;
}

/** 0 when any reference names the file exactly, 1 otherwise. */
function matchRank(matches: readonly { readonly kind: string }[]): number {
  return matches.some((match) => match.kind === "exact") ? 0 : 1;
}

function uniqueNotes(notes: readonly LedgerChangeContextNote[]): LedgerChangeContextNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = note.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describeRange(range: GetChangedFilesOptions): string {
  if (range.base && range.head) return `${range.base}...${range.head}`;
  return range.staged ? "staged changes" : "working tree";
}

/** The context as Markdown for a reviewer or an agent. */
export function formatChangeContext(context: LedgerChangeContext): string {
  const lines: string[] = [`# Change context: ${context.range}`, ""];
  if (context.files.length === 0) {
    lines.push("No changed files.");
    return lines.join("\n");
  }
  const { coverage } = context;
  lines.push(
    `- Files: ${context.files.length} changed.`,
    `- Coverage (${coverage.mode}): ${coverage.covered} of ${coverage.required} required files covered${
      coverage.missing.length > 0 ? `; missing ${coverage.missing.map((file) => `\`${file}\``).join(", ")}` : ""
    }.`,
    context.docsImpact.missing.length > 0
      ? `- Docs impact: missing for ${context.docsImpact.missing.map((file) => `\`${file}\``).join(", ")}.`
      : "- Docs impact: every judged source file has evidence.",
  );
  for (const hint of context.sessions) lines.push(`- Session ${hint.session}: ${hint.message}`);
  if (context.truncated) lines.push(`- Budget: details for some files were left out to fit ${context.budgetTokens} tokens.`);
  lines.push("");

  lines.push("## Receipts in this change", "");
  if (context.receipts.length === 0) lines.push("None.");
  for (const receipt of context.receipts) {
    const state = receipt.ready ? "ready" : `not ready: ${receipt.issues.join("; ")}`;
    lines.push(`- ${receipt.id} ${receipt.title} (${receipt.status}; ${state}; evidence ${receipt.verificationStatus})`);
  }
  lines.push("");

  for (const file of context.files) {
    const receipts = file.receipts.length > 0 ? `; receipts ${file.receipts.join(", ")}` : "";
    const docs = file.docsImpact ? `; docs impact ${file.docsImpact}` : "";
    lines.push(`## ${file.path}`, "", `${file.change}; coverage ${file.coverage}${receipts}${docs}.`, "");
    if (file.detailsOmitted) {
      lines.push(`Details left out for the budget (${file.moreRecords} records mention it).`, "");
      continue;
    }
    if (file.records.length > 0) {
      const more = file.moreRecords > 0 ? `, and ${file.moreRecords} older` : "";
      lines.push(`Records: ${file.records.map((record) => `${record.id} ${record.title}`).join("; ")}${more}.`, "");
    }
    if (file.invariants.length > 0) {
      lines.push("Invariants:", ...file.invariants.map((note) => `- (${note.record}) ${note.text}`), "");
    }
    if (file.conflictRules.length > 0) {
      lines.push("Conflict rules:", ...file.conflictRules.map((note) => `- (${note.record}) ${note.text}`), "");
    }
  }

  if (context.related.length > 0) {
    lines.push("## Linked records", "");
    for (const record of context.related) {
      lines.push(`- ${record.id} ${record.title} (${record.kind}, ${record.status}) via ${record.via.join(", ")} from ${record.from.join(", ")}`);
    }
    lines.push("");
  }

  const checks = context.receipts.filter((receipt) => receipt.verification.length > 0);
  if (checks.length > 0) {
    lines.push("## Verification", "");
    for (const receipt of checks) {
      lines.push(`${receipt.id}:`, ...receipt.verification.map((item) => `- ${item}`), "");
    }
  }
  return lines.join("\n").trimEnd();
}
