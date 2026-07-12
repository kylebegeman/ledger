import { createHash } from "node:crypto";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { isSafeProjectRelativePath, resolveSafeProjectPath } from "./projectPaths.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export interface LedgerDocumentIntegrity {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly path: string;
  readonly algorithm: "sha256";
  readonly hash: string;
  readonly bytes: number;
}

export interface LedgerIntegrityReport {
  readonly version: 1;
  readonly generatedAt: string;
  readonly project: string;
  readonly algorithm: "sha256";
  readonly catalogHash: string;
  readonly documents: readonly LedgerDocumentIntegrity[];
}

export interface WrittenIntegrityArtifacts {
  readonly indexPath: string;
  readonly reportPath: string;
}

export interface LedgerIntegrityVerification {
  readonly ok: boolean;
  readonly expectedProject: string;
  readonly currentProject: string;
  readonly expectedCatalogHash: string;
  readonly currentCatalogHash: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

export function buildIntegrityReport(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerIntegrityReport {
  const documentHashes = documents
    .map((document) => ({
      id: stringValue(document.frontmatter.id),
      kind: document.kind,
      title: stringValue(document.frontmatter.title),
      path: normalizePath(document.relativePath),
      algorithm: "sha256" as const,
      hash: sha256(document.raw),
      bytes: Buffer.byteLength(document.raw, "utf8"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    algorithm: "sha256",
    catalogHash: sha256(
      documentHashes.map((document) => `${document.path}\0${document.hash}`).join("\n"),
    ),
    documents: documentHashes,
  };
}

export async function writeIntegrityArtifacts(
  workspace: LedgerWorkspace,
  report: LedgerIntegrityReport,
): Promise<WrittenIntegrityArtifacts> {
  const indexPath = normalizePath(path.join(workspace.config.indexes.output, "integrity.json"));
  const reportPath = normalizePath(path.join(workspace.config.reports.output, "integrity.md"));
  await applyFileTransaction(workspace, "write integrity artifacts", [
    { path: indexPath, content: `${JSON.stringify(report, null, 2)}\n` },
    { path: reportPath, content: formatIntegrityReport(report) },
  ]);
  return {
    indexPath,
    reportPath,
  };
}

export async function readIntegrityReport(
  workspace: LedgerWorkspace,
): Promise<LedgerIntegrityReport> {
  const indexPath = await resolveSafeProjectPath(
    workspace.projectRoot,
    `${workspace.config.indexes.output}/integrity.json`,
    "integrity baseline",
  );
  try {
    const parsed: unknown = JSON.parse(
      await readUtf8FileLimited(
        indexPath,
        workspace.config.limits.maxTotalDocumentBytes,
        "integrity baseline",
      ),
    );
    if (!isIntegrityReport(parsed)) {
      throw invalidIntegrityBaseline(indexPath);
    }
    if (parsed.documents.length > workspace.config.limits.maxDocuments) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Integrity baseline exceeds ${workspace.config.limits.maxDocuments} documents`,
        { kind: "integrity-baseline-documents", limit: workspace.config.limits.maxDocuments },
      );
    }
    return parsed;
  } catch (error) {
    if (isCode(error, "ENOENT")) {
      throw new LedgerError(
        "integrity-baseline-missing",
        `Integrity baseline does not exist: ${normalizePath(path.relative(workspace.projectRoot, indexPath))}`,
      );
    }
    if (error instanceof SyntaxError) throw invalidIntegrityBaseline(indexPath);
    throw error;
  }
}

function isIntegrityReport(value: unknown): value is LedgerIntegrityReport {
  if (value === null || typeof value !== "object") return false;
  const report = value as Partial<LedgerIntegrityReport>;
  if (
    report.version !== 1 ||
    !isBoundedText(report.generatedAt, 100) ||
    !Number.isFinite(Date.parse(report.generatedAt)) ||
    !isBoundedText(report.project, 1_000) ||
    report.algorithm !== "sha256" ||
    !isSha256(report.catalogHash) ||
    !Array.isArray(report.documents)
  ) {
    return false;
  }
  const paths = new Set<string>();
  for (const document of report.documents) {
    if (
      document === null ||
      typeof document !== "object" ||
      !isBoundedText(document.id, 1_000) ||
      !isBoundedText(document.kind, 100) ||
      !isBoundedText(document.title, 10_000) ||
      !isBoundedText(document.path, 4_096) ||
      !isSafeProjectRelativePath(document.path) ||
      document.algorithm !== "sha256" ||
      !isSha256(document.hash) ||
      !Number.isSafeInteger(document.bytes) ||
      document.bytes < 0 ||
      paths.has(document.path)
    ) {
      return false;
    }
    paths.add(document.path);
  }
  return true;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function verifyIntegrityReport(
  expected: LedgerIntegrityReport,
  current: LedgerIntegrityReport,
): LedgerIntegrityVerification {
  const expectedByPath = new Map(expected.documents.map((document) => [document.path, document.hash]));
  const currentByPath = new Map(current.documents.map((document) => [document.path, document.hash]));
  const added = [...currentByPath.keys()].filter((filePath) => !expectedByPath.has(filePath)).sort();
  const removed = [...expectedByPath.keys()].filter((filePath) => !currentByPath.has(filePath)).sort();
  const changed = [...currentByPath.entries()]
    .filter(([filePath, hash]) => expectedByPath.has(filePath) && expectedByPath.get(filePath) !== hash)
    .map(([filePath]) => filePath)
    .sort();
  return {
    ok:
      expected.project === current.project &&
      expected.catalogHash === current.catalogHash &&
      added.length === 0 &&
      removed.length === 0 &&
      changed.length === 0,
    expectedProject: expected.project,
    currentProject: current.project,
    expectedCatalogHash: expected.catalogHash,
    currentCatalogHash: current.catalogHash,
    added,
    removed,
    changed,
  };
}

function invalidIntegrityBaseline(indexPath: string): LedgerError {
  return new LedgerError(
    "integrity-baseline-invalid",
    `Invalid integrity baseline: ${indexPath}`,
  );
}

export function formatIntegrityReport(report: LedgerIntegrityReport): string {
  const lines = [
    "# Ledger Integrity Report",
    "",
    `Project: \`${markdownCode(report.project)}\``,
    `Generated: \`${report.generatedAt}\``,
    `Algorithm: \`${report.algorithm}\``,
    `Catalog hash: \`${report.catalogHash}\``,
    "",
    "## Documents",
    "",
    ...report.documents.map((document) =>
      `- \`${document.hash}\` ${markdownText(document.id)} ${markdownText(document.title)} (\`${markdownCode(document.path)}\`, ${document.bytes} bytes)`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function markdownText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1");
}

function markdownCode(value: string): string {
  return value.replace(/`/g, "\\`").replace(/[\r\n]+/g, " ");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
